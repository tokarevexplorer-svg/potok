// Оркестратор задач команды.
//
// Прямой портирование жизненного цикла задач из `dkl_tool/backend/services/task_runner.py`
// на JS, с заменой:
//   - локальный JSONL-журнал tasks.jsonl → таблица team_tasks (append-only).
//     Каждое изменение состояния задачи = новая строка с тем же `id`.
//     Текущее состояние = последний снапшот по id (через teamSupabase.getTaskById).
//   - локальная файловая система → bucket team-database в Supabase Storage.
//
// Статусы (из миграции 0012, английские константы):
//   running       — задача запущена, обработчик работает
//   done          — задача завершена успешно (на проверке у пользователя)
//   marked_done   — пользователь подтвердил готовность
//   revision      — пользователь отметил «на доработке» (резерв на этап 2)
//   archived      — задача архивирована
//   error         — задача упала с ошибкой
//
// Изолированные статусы шагов закладываются на этапе 1 в полях самих
// snapshot'ов (started_at, finished_at, error). На этапе 2, когда задачи
// станут многошаговыми (агенты с self-review), это превратится в отдельные
// поля типа `step_status`. Сейчас однофазные задачи — один шаг = один статус.

import { randomBytes } from "node:crypto";
import {
  appendTaskSnapshot,
  getTaskById,
} from "./teamSupabase.js";
import { downloadFile, uploadFile, listFiles } from "./teamStorage.js";
import { call as llmCall } from "./llmClient.js";
import { fetchSource } from "./contentFetcher.js";
import { recordCall, getCostForTask, checkTaskLimit } from "./costTracker.js";
import {
  TASK_HANDLERS,
  TASK_TITLES,
  taskTemplateName,
  buildPreviewVariables,
  buildTaskPrompt,
  formatEdits,
} from "./taskHandlers.js";
import { enqueueTeamTask } from "../../queue/teamWorkerPool.js";
import { parseSuggestedNextSteps } from "./handoffParser.js";
import { createNotification } from "./notificationsService.js";
import { getTaskTemplateDefaults } from "./promptBuilder.js";
import {
  runSelfReview,
  shouldSkipSelfReview,
} from "./selfReviewService.js";
import { getAgent } from "./agentService.js";

// Сессия 29: тихая обёртка над agentService.getAgent — если агента нет
// или сервис недоступен, возвращает null. Self-review должен корректно
// падать в skip, а не валить всю задачу.
async function getAgentSafe(agentId) {
  if (!agentId) return null;
  try {
    return await getAgent(agentId);
  } catch (err) {
    console.warn(
      `[taskRunner] getAgentSafe ${agentId} failed: ${err?.message ?? err}`,
    );
    return null;
  }
}

const DATABASE_BUCKET = "team-database";
const PRESETS_PATH = "presets.json";
const PRICING_PATH = "pricing.json";
const CONFIG_BUCKET = "team-config";

// =========================================================================
// helpers: ids, время
// =========================================================================

function nowIso() {
  // ISO с локальным offset, как в Python (...isoformat(timespec="seconds")).
  // Точность до секунды достаточна для журнала состояний.
  return new Date().toISOString();
}

function newTaskId() {
  return "tsk_" + randomBytes(6).toString("hex");
}

// Берёт текущий снапшот задачи, мерджит с update'ами, кладёт новую строку.
// Используется для всех переходов статуса (started, done, error, archive,
// rename, mark_done, refresh_cost). Возвращает обновлённый снапшот.
async function appendUpdate(taskId, update) {
  const current = await getTaskById(taskId);
  if (!current) {
    throw new Error(`Задача не найдена: ${taskId}`);
  }
  // current приходит из БД в snake_case — превращаем в camelCase для appendTaskSnapshot.
  const merged = mergeSnapshot(current, update);
  await appendTaskSnapshot(merged);
  return merged;
}

// Снапшот, который теперь сохраняем — это «полная» картина в camelCase для
// appendTaskSnapshot (он сам мапит в snake_case). Берём существующие поля
// и накладываем update.
function mergeSnapshot(current, update) {
  return {
    id: current.id,
    type: current.type,
    title: update.title ?? current.title,
    status: update.status ?? current.status,
    params: update.params ?? current.params,
    modelChoice: update.modelChoice ?? current.model_choice,
    provider: update.provider ?? current.provider,
    model: update.model ?? current.model,
    prompt: update.prompt ?? current.prompt,
    promptOverrideUsed:
      typeof update.promptOverrideUsed === "boolean"
        ? update.promptOverrideUsed
        : current.prompt_override_used,
    result: update.result ?? current.result,
    artifactPath: update.artifactPath ?? current.artifact_path,
    tokens: update.tokens ?? current.tokens,
    costUsd: typeof update.costUsd === "number" ? update.costUsd : current.cost_usd,
    error: update.error === undefined ? current.error : update.error,
    startedAt: update.startedAt ?? current.started_at,
    finishedAt: update.finishedAt ?? current.finished_at,
    // agent_id живёт на уровне задачи (Сессия 12) — не меняется между
    // снапшотами, переносим текущее значение, если update не уточняет.
    agentId: update.agentId ?? current.agent_id,
    // parent_task_id фиксируется при createTask (handoff) и не меняется
    // между снапшотами. Сессия 13.
    parentTaskId:
      update.parentTaskId !== undefined ? update.parentTaskId : current.parent_task_id,
    // suggested_next_steps записывается один раз в finishTask, остальные
    // снапшоты её сохраняют. NULL до завершения — это норма.
    suggestedNextSteps:
      update.suggestedNextSteps !== undefined
        ? update.suggestedNextSteps
        : current.suggested_next_steps,
    // project_id (Сессия 16) — тег задачи. Меняется только в админских
    // действиях (rename/move project) — обычно фиксирован после createTask.
    projectId:
      update.projectId !== undefined ? update.projectId : current.project_id,
    // self-review (Сессия 29). Флаг и доп. чек-лист фиксируются при
    // createTask и переносятся как есть. selfReviewResult пишется один раз
    // в finishTask, дальше неизменно.
    selfReviewEnabled:
      typeof update.selfReviewEnabled === "boolean"
        ? update.selfReviewEnabled
        : current.self_review_enabled,
    selfReviewExtraChecks:
      update.selfReviewExtraChecks !== undefined
        ? update.selfReviewExtraChecks
        : current.self_review_extra_checks,
    selfReviewResult:
      update.selfReviewResult !== undefined
        ? update.selfReviewResult
        : current.self_review_result,
  };
}

// =========================================================================
// presets.json и pricing.json — для resolveModelChoice
// =========================================================================

const PRESETS_TTL_MS = 60_000;
let presetsCache = { value: null, expiresAt: 0 };
let pricingCache = { value: null, expiresAt: 0 };

async function loadPresets() {
  const now = Date.now();
  if (presetsCache.value && presetsCache.expiresAt > now) return presetsCache.value;
  let parsed = {};
  try {
    const raw = await downloadFile(CONFIG_BUCKET, PRESETS_PATH);
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`[team] не удалось загрузить ${PRESETS_PATH}: ${err.message}`);
    parsed = {};
  }
  presetsCache = { value: parsed, expiresAt: now + PRESETS_TTL_MS };
  return parsed;
}

async function loadPricingForLookup() {
  const now = Date.now();
  if (pricingCache.value && pricingCache.expiresAt > now) return pricingCache.value;
  let parsed = {};
  try {
    const raw = await downloadFile(CONFIG_BUCKET, PRICING_PATH);
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(`[team] не удалось загрузить ${PRICING_PATH}: ${err.message}`);
    parsed = {};
  }
  pricingCache = { value: parsed, expiresAt: now + PRESETS_TTL_MS };
  return parsed;
}

// Ищет провайдера по id модели в pricing.json (поддерживает и новую структуру
// с массивом models, и старую вложенную {provider: {model_id: {...}}}).
async function providerForModel(modelId) {
  const pricing = await loadPricingForLookup();
  for (const entry of pricing.models ?? []) {
    if (entry?.id === modelId) return entry.provider ?? null;
  }
  for (const [provider, models] of Object.entries(pricing)) {
    if (!models || typeof models !== "object" || Array.isArray(models)) continue;
    if (["_comment", "_units", "models", "audio"].includes(provider)) continue;
    if (modelId in models) return provider;
  }
  return null;
}

// Резолвинг выбора модели:
//   { preset: "fast"|"balanced"|"best" }      — из presets.json
//   { model: "claude-..." }                   — провайдер находится по pricing.json
//   { provider: "...", model: "..." }         — явный override
//
// taskType учитывается: presets.json может иметь per-task override
// (presets[name][taskType]) — он приоритетнее presets[name].default.
export async function resolveModelChoice(modelChoice, taskType = null) {
  const presets = await loadPresets();
  const choice = { ...(modelChoice || {}) };

  const explicitProvider = (choice.provider || "").trim();
  const explicitModel = (choice.model || "").trim();

  if (explicitModel) {
    if (explicitProvider) return { provider: explicitProvider, model: explicitModel };
    const derived = await providerForModel(explicitModel);
    if (!derived) {
      throw new Error(
        `Не удалось определить провайдера для модели '${explicitModel}'. ` +
          `Добавь её в config/pricing.json (поле provider).`,
      );
    }
    return { provider: derived, model: explicitModel };
  }

  const presetName = (choice.preset || "balanced").trim();
  const preset = presets[presetName];
  if (!preset) {
    const available = Object.keys(presets)
      .filter((k) => !k.startsWith("_"))
      .join(", ");
    throw new Error(`Неизвестный пресет: '${presetName}'. Доступны: ${available}.`);
  }
  if (typeof preset !== "object" || Array.isArray(preset)) {
    throw new Error(`Пресет '${presetName}' в config/presets.json имеет неверную структуру.`);
  }

  let modelId = null;
  if (taskType && typeof preset[taskType] === "string") {
    modelId = preset[taskType];
  }
  if (!modelId && typeof preset.default === "string") {
    modelId = preset.default;
  }
  if (!modelId && preset.models && typeof preset.models === "object") {
    const legacyDefaultProvider = preset.default_provider;
    if (legacyDefaultProvider && legacyDefaultProvider in preset.models) {
      modelId = preset.models[legacyDefaultProvider];
    } else {
      const first = Object.values(preset.models)[0];
      if (first) modelId = first;
    }
  }

  if (!modelId) {
    throw new Error(
      `В пресете '${presetName}' не задана модель ни для типа '${taskType}', ни как default.`,
    );
  }

  const provider = await providerForModel(modelId);
  if (!provider) {
    throw new Error(
      `Модель '${modelId}' из пресета '${presetName}' не найдена в config/pricing.json.`,
    );
  }
  return { provider, model: modelId };
}

// =========================================================================
// publicAPI: createTask, runTaskInBackground, archive/rename/markDone
// =========================================================================

// Собирает промпт для предпросмотра через UI (без запуска задачи).
// Используется эндпоинтом /api/team/tasks/preview-prompt.
// Сессия 12: если в params есть agent_id, передаём его в buildPrompt — это
// подтянет Role + Memory + Awareness в превью (раньше эти слои оставались
// пустыми, потому что мы не знали, для кого собирается задача).
export async function previewPrompt(taskType, params) {
  const variables = await buildPreviewVariables(taskType, params || {});
  return await buildTaskPrompt(taskType, variables);
}

// Создаёт новую задачу: пишет первый снапшот running, кладёт id в очередь.
// Возвращает task id.
//
// Аргументы:
//   - taskType: ключ TASK_HANDLERS
//   - params: входные параметры задачи
//   - modelChoice (опц.): выбор модели (preset или provider/model)
//   - promptOverride (опц.): {system, user, cacheable_blocks?} — пользователь
//     отредактировал промпт перед запуском
//   - title (опц.): пользовательское название задачи
//   - agentId (опц.): slug агента-исполнителя (Сессия 12). Если передан —
//     buildPrompt подтянет Role + Memory + Awareness; промпт станет
//     персональным. Без agentId — задача собирается «как раньше»
//     (только Mission + Goals + шаблон).
export async function createTask({
  taskType,
  params,
  modelChoice = null,
  promptOverride = null,
  title = null,
  agentId = null,
  parentTaskId = null,
  projectId = null,
  selfReviewEnabled = null,
  selfReviewExtraChecks = null,
}) {
  if (!TASK_HANDLERS[taskType]) {
    throw new Error(`Тип задачи не поддерживается: ${taskType}`);
  }

  const { provider, model } = await resolveModelChoice(modelChoice, taskType);

  // agent_id передаётся в buildPrompt через variables — promptBuilder
  // ожидает ключ `agent_id` (или alias `agentId`) и сам разрулит загрузку
  // Role/Memory/Awareness. Не мутируем исходный params — копируем.
  const promptVars = { ...(params || {}) };
  if (agentId) promptVars.agent_id = agentId;

  const overrideUsed = !!(promptOverride && promptOverride.system != null);
  let prompt;
  if (overrideUsed) {
    // Пользователь отредактировал текст — берём его. Для cacheable_blocks
    // фолбэк на стандартные context/concept (если в override не указано иначе).
    let cacheableBlocks = promptOverride.cacheable_blocks ?? promptOverride.cacheableBlocks;
    if (!Array.isArray(cacheableBlocks)) {
      const standard = await previewPrompt(taskType, promptVars);
      cacheableBlocks = standard.cacheableBlocks ?? [];
    }
    prompt = {
      system: promptOverride.system ?? "",
      user: promptOverride.user || (params?.user_input ?? ""),
      cacheable_blocks: cacheableBlocks,
      template: taskTemplateName(taskType),
    };
  } else {
    const built = await previewPrompt(taskType, promptVars);
    prompt = {
      system: built.system,
      user: built.user,
      cacheable_blocks: built.cacheableBlocks,
      template: built.template,
    };
  }

  // self-review дефолт читается из frontmatter шаблона (`self_review_default`).
  // Если форма передала boolean — он перекрывает дефолт. Если null — дефолт
  // из шаблона (false, если шаблона/поля нет).
  let resolvedSelfReview;
  if (typeof selfReviewEnabled === "boolean") {
    resolvedSelfReview = selfReviewEnabled;
  } else {
    try {
      const defaults = await getTaskTemplateDefaults(taskType);
      resolvedSelfReview = defaults.self_review_default === true;
    } catch {
      resolvedSelfReview = false;
    }
  }

  const taskId = newTaskId();
  const snapshot = {
    id: taskId,
    type: taskType,
    title: title || TASK_TITLES[taskType] || taskType,
    status: "running",
    params: { ...(params || {}) },
    modelChoice: { ...(modelChoice || {}) },
    provider,
    model,
    prompt,
    promptOverrideUsed: overrideUsed,
    result: "",
    artifactPath: null,
    tokens: { input: 0, output: 0, cached: 0 },
    costUsd: 0,
    error: null,
    startedAt: null,
    finishedAt: null,
    agentId: agentId || null,
    parentTaskId: parentTaskId || null,
    suggestedNextSteps: null,
    projectId: projectId || null,
    selfReviewEnabled: resolvedSelfReview,
    selfReviewExtraChecks:
      typeof selfReviewExtraChecks === "string" && selfReviewExtraChecks.trim()
        ? selfReviewExtraChecks.trim()
        : null,
    selfReviewResult: null,
  };

  await appendTaskSnapshot(snapshot);
  enqueueTeamTask(taskId);
  return taskId;
}

// Главный воркер задачи. Дёргается из teamWorkerPool. Не должен бросать —
// все ошибки записывает в БД как status=error.
export async function runTaskInBackground(taskId) {
  const task = await getTaskById(taskId);
  if (!task) return;

  const handler = TASK_HANDLERS[task.type];
  const startedAt = nowIso();

  try {
    if (!handler) {
      throw new Error(`Тип задачи не поддерживается: ${task.type}`);
    }

    // edit_text_fragments — особый случай: handler нуждается в parent artifact.
    // Подкладываем его в params перед вызовом, чтобы handler был тупым.
    if (task.type === "edit_text_fragments") {
      const parentId = (task.params?.parent_task_id ?? "").trim();
      if (!parentId) {
        throw new Error("Не указан parent_task_id для правки фрагментов");
      }
      const parent = await getTaskById(parentId);
      if (!parent) {
        throw new Error(`Не найдена исходная задача (parent_task_id=${parentId})`);
      }
      if (!["write_text", "edit_text_fragments"].includes(parent.type)) {
        throw new Error("Правки применяются только к задачам типа write_text");
      }
      if (!parent.artifact_path) {
        throw new Error("У исходной задачи нет артефакта в Storage");
      }
      task.params = {
        ...task.params,
        parent_artifact_path: parent.artifact_path,
      };
    }

    const outcome = await handler(task);

    // record API call перед апдейтом задачи: получим cost_usd для записи.
    // Сессия 12: пробрасываем agent_id и purpose='task' — будущая страница
    // биллинга разбирает расходы по агентам, текущая Админка использует
    // purpose для разграничения task / role_draft / test_run.
    const tokens = outcome.tokens || {};
    const apiEntry = await recordCall({
      provider: task.provider,
      model: task.model,
      inputTokens: Number(tokens.input ?? 0),
      outputTokens: Number(tokens.output ?? 0),
      cachedTokens: Number(tokens.cached ?? 0),
      taskId,
      success: true,
      agentId: task.agent_id ?? null,
      purpose: "task",
    });

    // Жёсткий лимит стоимости одной задачи (Сессия 2 этапа 2). После каждого
    // успешного LLM-вызова сверяем суммарную стоимость задачи с настройкой.
    // При превышении — мягко прерываем со status='error': артефакт уже
    // загружен в Storage (handler отработал), step_state в team_tasks не
    // удаляется. Это даёт Владу возможность анализировать промежуточный
    // результат или продолжить руками.
    const taskCheck = await checkTaskLimit(taskId);
    if (!taskCheck.allowed) {
      const spent = Number(taskCheck.spent_usd ?? 0);
      const limit = Number(taskCheck.limit_usd ?? 0);
      await appendUpdate(taskId, {
        status: "error",
        error:
          `Превышен лимит стоимости задачи: фактически потрачено $${spent.toFixed(2)} ` +
          `из лимита $${limit.toFixed(2)}.`,
        result: outcome.result ?? "",
        artifactPath: outcome.artifactPath ?? null,
        tokens,
        costUsd: Number(apiEntry?.cost_usd ?? 0),
        startedAt,
        finishedAt: nowIso(),
        ...(outcome.prompt ? { prompt: outcome.prompt } : {}),
      });
      return;
    }

    // =====================================================================
    // Self-review (Сессия 29). Запускается после первого вызова, если фича
    // включена флагом self_review_enabled (либо явно из формы, либо из
    // frontmatter шаблона). Второй вызов идёт на той же модели, расходы
    // пишутся отдельной строкой с purpose='self_review'.
    //
    // Если revision_needed=true и есть revised_result — финальный артефакт
    // подменяем на исправленную версию. Если артефакта в Storage не было
    // (write_text перезаписывает файл, остальные хранят inline), просто
    // подменяем result.
    // =====================================================================
    let finalResult = outcome.result ?? "";
    let selfReviewResult = null;
    const skipCheck = shouldSkipSelfReview(task, finalResult);
    if (!skipCheck.skip) {
      const agentForReview = task.agent_id
        ? await getAgentSafe(task.agent_id)
        : null;
      try {
        const review = await runSelfReview(task, agentForReview, finalResult);
        if (!review.skipped) {
          selfReviewResult = review;
          if (review.revised && review.revised_result) {
            // Если был артефакт в Storage — перезаписываем его исправленной
            // версией. Для write_text путь у нас на task.artifact_path,
            // outcome.artifactPath свежий. Используем outcome.artifactPath.
            if (outcome.artifactPath) {
              try {
                await uploadFile(
                  DATABASE_BUCKET,
                  outcome.artifactPath,
                  review.revised_result,
                  "text/markdown; charset=utf-8",
                );
              } catch (err) {
                console.warn(
                  `[taskRunner] self-review: не удалось переписать артефакт ${outcome.artifactPath}: ${err?.message ?? err}`,
                );
              }
            }
            finalResult = review.revised_result;
          }
        }
      } catch (err) {
        console.warn(
          `[taskRunner] self-review failed for ${taskId}: ${err?.message ?? err}`,
        );
      }
    }

    // Парсим необязательный блок «**Suggested Next Steps:**» в конце ответа
    // (Сессия 13, пункт 8). Пустой массив, если блока нет — это нормальный
    // случай для большинства задач. UI handoff использует этот массив для
    // предзаполнения формы передачи задачи.
    const suggestedSteps = parseSuggestedNextSteps(finalResult);

    const update = {
      status: "done",
      result: finalResult,
      artifactPath: outcome.artifactPath ?? null,
      tokens,
      costUsd: Number(apiEntry?.cost_usd ?? 0),
      startedAt,
      finishedAt: nowIso(),
      suggestedNextSteps: suggestedSteps.length > 0 ? suggestedSteps : null,
      selfReviewResult,
    };
    if (outcome.prompt) update.prompt = outcome.prompt;

    await appendUpdate(taskId, update);

    // Сессия 18: нотификации Inbox внимания. Создаём после успешного
    // обновления статуса — иначе можно получить notification на «done»,
    // который потом откатится по rate limit (теоретически).
    // Завершение задачи — повод для оценки (см. Сессия 14, блок Оценить).
    try {
      const taskTitle = task.title || TASK_TITLES[task.type] || task.type;
      await createNotification({
        type: "task_awaiting_review",
        title: `Задача «${taskTitle}» ждёт оценки`,
        description: null,
        agent_id: task.agent_id ?? null,
        related_entity_id: taskId,
        related_entity_type: "task",
        link: "/blog/team/dashboard",
      });
    } catch (err) {
      console.warn(
        `[taskRunner] createNotification(task_awaiting_review) failed for ${taskId}:`,
        err?.message ?? err,
      );
    }

    // Если агент в финале ответа предложил handoff — отдельная нотификация
    // на каждое предложение нам не нужна (засорит Inbox); делаем одну
    // общую с count.
    if (suggestedSteps.length > 0) {
      try {
        const taskTitle = task.title || TASK_TITLES[task.type] || task.type;
        const names = suggestedSteps.map((s) => s.agent_name).join(", ");
        await createNotification({
          type: "handoff_suggestion",
          title: `Агент предлагает передать задачу «${taskTitle}» дальше`,
          description: `Кому: ${names}`,
          agent_id: task.agent_id ?? null,
          related_entity_id: taskId,
          related_entity_type: "task",
          link: "/blog/team/dashboard",
        });
      } catch (err) {
        console.warn(
          `[taskRunner] createNotification(handoff_suggestion) failed for ${taskId}:`,
          err?.message ?? err,
        );
      }
    }
  } catch (err) {
    const message = err?.message ?? String(err);
    const provider = task?.provider || "unknown";
    const model = task?.model || "unknown";
    // Лог об ошибке тоже идёт в team_api_calls (как в Python-версии),
    // чтобы видеть статистику падений по моделям. Сессия 12: agent_id и
    // purpose в журнале остаются согласованными с успешным путём.
    try {
      await recordCall({
        provider,
        model,
        taskId,
        success: false,
        error: message,
        agentId: task?.agent_id ?? null,
        purpose: "task",
      });
    } catch (recErr) {
      console.error("[team] recordCall (error) failed:", recErr);
    }
    try {
      await appendUpdate(taskId, {
        status: "error",
        error: message,
        startedAt,
        finishedAt: nowIso(),
      });
    } catch (snapErr) {
      console.error(
        `[team] не удалось записать ошибочный снапшот для ${taskId}:`,
        snapErr,
      );
    }
  }
}

// =========================================================================
// management: archive, rename, markDone, refreshCost
// =========================================================================

export async function archiveTask(taskId) {
  return await appendUpdate(taskId, { status: "archived" });
}

export async function renameTask(taskId, title) {
  return await appendUpdate(taskId, { title: (title ?? "").trim() });
}

export async function markTaskDone(taskId) {
  return await appendUpdate(taskId, { status: "marked_done" });
}

// Пересчитывает cost_usd задачи как сумму всех её записей в team_api_calls.
// Используется после AI-правки фрагментов: правка биллится против
// родительской задачи (без новой записи в team_tasks).
export async function refreshTaskCost(taskId) {
  const total = await getCostForTask(taskId);
  return await appendUpdate(taskId, { costUsd: total });
}

// =========================================================================
// AI-правка фрагментов write_text — без новой записи в team_tasks
// =========================================================================

// Применяет AI-правки к артефакту write_text задачи. Создаёт новую версию
// (vN+1) в той же папке точки. Стоимость записывается на parentTaskId через
// team_api_calls — никакого нового team_tasks снапшота на саму правку.
//
// Аргументы:
//   - parentTaskId: id родительской write_text (или edit_text_fragments) задачи
//   - fullText: текущий текст (UI отдаёт то, что пользователь видел)
//   - edits: [{fragment, instruction}, ...]
//   - generalInstruction: общая инструкция (опц.)
//   - modelChoice: выбор модели (resolveModelChoice → provider/model)
//   - promptOverride: {system, user, cacheable_blocks?} (опц.)
//
// Возвращает {version, path, name, provider, model, tokens}.
export async function applyFragmentEditsInline({
  parentTaskId,
  fullText,
  edits,
  generalInstruction,
  modelChoice,
  promptOverride = null,
}) {
  const parent = await getTaskById(parentTaskId);
  if (!parent) throw new Error("Не найдена исходная задача (parent_task_id)");
  if (!["write_text", "edit_text_fragments"].includes(parent.type)) {
    throw new Error("Правки применяются только к задачам типа write_text");
  }
  if (!parent.artifact_path) {
    throw new Error("У исходной задачи нет артефакта в Storage");
  }

  const parentPath = parent.artifact_path;
  const pointDir = parentPath.includes("/")
    ? parentPath.slice(0, parentPath.lastIndexOf("/"))
    : "";
  if (!pointDir) {
    throw new Error(`Не удалось определить папку точки из пути ${parentPath}`);
  }

  // Жёсткий лимит стоимости задачи: правки фрагментов биллятся к родительской
  // задаче, поэтому проверяем суммарную стоимость parent перед LLM-вызовом.
  const preCheck = await checkTaskLimit(parentTaskId);
  if (!preCheck.allowed) {
    const spent = Number(preCheck.spent_usd ?? 0);
    const limit = Number(preCheck.limit_usd ?? 0);
    throw new Error(
      `Превышен лимит стоимости задачи: фактически потрачено $${spent.toFixed(2)} ` +
        `из лимита $${limit.toFixed(2)}.`,
    );
  }

  const { provider, model } = await resolveModelChoice(modelChoice, "edit_text_fragments");

  let usedPrompt;
  if (promptOverride && promptOverride.system != null) {
    usedPrompt = {
      system: promptOverride.system ?? "",
      user:
        promptOverride.user ||
        "Примени все перечисленные правки и верни обновлённый текст целиком.",
      cacheable_blocks:
        promptOverride.cacheable_blocks ?? promptOverride.cacheableBlocks ?? [],
    };
  } else {
    const built = await buildTaskPrompt("edit_text_fragments", {
      full_text: fullText || "",
      edits: formatEdits(edits || []),
      general_instruction: (generalInstruction ?? "").trim(),
      user_input:
        "Примени все перечисленные правки и верни обновлённый текст целиком.",
    });
    usedPrompt = {
      system: built.system,
      user: built.user,
      cacheable_blocks: built.cacheableBlocks,
    };
  }

  const result = await llmCall({
    provider,
    model,
    systemPrompt: usedPrompt.system,
    userPrompt: usedPrompt.user,
    cacheableBlocks: usedPrompt.cacheable_blocks,
    maxTokens: 8192,
  });

  await recordCall({
    provider,
    model,
    inputTokens: Number(result.inputTokens ?? 0),
    outputTokens: Number(result.outputTokens ?? 0),
    cachedTokens: Number(result.cachedTokens ?? 0),
    taskId: parentTaskId,
    success: true,
    // Сессия 12: правки биллятся к parent — agent_id тянем с него.
    agentId: parent.agent_id ?? null,
    purpose: "task",
  });

  // Версионирование: ищем максимальный vN в pointDir.
  const ts = (() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `_${pad(d.getHours())}${pad(d.getMinutes())}`
    );
  })();
  const version = await nextVersionInDir(pointDir);
  const path = `${pointDir}/v${version}_${ts}.md`;

  const headerLines = [
    `<!-- ai edit · v${version} · ${ts} · based on task ${parentTaskId} · ${provider}/${model} -->`,
  ];
  await uploadFile(
    DATABASE_BUCKET,
    path,
    [headerLines.join("\n"), "", result.text ?? ""].join("\n"),
  );

  await refreshTaskCost(parentTaskId);

  const name = path.split("/").pop() || path;
  return {
    version,
    path,
    name,
    provider,
    model,
    tokens: {
      input: Number(result.inputTokens ?? 0),
      output: Number(result.outputTokens ?? 0),
      cached: Number(result.cachedTokens ?? 0),
    },
  };
}

// Прямое сохранение редактуры без LLM-вызова (пользователь сам отредактировал
// текст в textarea). Просто новая версия в той же папке. Биллинг = 0.
//
// Возвращает {version, path, name}.
export async function saveDirectEdit({ parentTaskId, content }) {
  const parent = await getTaskById(parentTaskId);
  if (!parent) throw new Error("Не найдена исходная задача");
  if (!["write_text", "edit_text_fragments"].includes(parent.type)) {
    throw new Error("Прямая правка доступна только для задач write_text");
  }
  if (!parent.artifact_path) {
    throw new Error("У исходной задачи нет артефакта в Storage");
  }
  const pointDir = parent.artifact_path.includes("/")
    ? parent.artifact_path.slice(0, parent.artifact_path.lastIndexOf("/"))
    : "";
  if (!pointDir) {
    throw new Error(`Не удалось определить папку точки из пути ${parent.artifact_path}`);
  }

  const ts = (() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return (
      `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
      `_${pad(d.getHours())}${pad(d.getMinutes())}`
    );
  })();
  const version = await nextVersionInDir(pointDir);
  const path = `${pointDir}/v${version}_${ts}.md`;
  const headerLines = [
    `<!-- direct edit · v${version} · ${ts} · based on task ${parentTaskId} -->`,
  ];
  await uploadFile(
    DATABASE_BUCKET,
    path,
    [headerLines.join("\n"), "", content ?? ""].join("\n"),
  );

  const name = path.split("/").pop() || path;
  return { version, path, name };
}

// =========================================================================
// research: дополнительный вопрос (дописывает в существующий артефакт)
// =========================================================================

// Дополнительный вопрос к research_direct задаче. НЕ создаёт новую запись в
// team_tasks — переиспользует артефакт родительской задачи и биллинг идёт
// против её id. UI этой функцией пользуется в TaskViewerModal.
//
// Возвращает {success, appended_text, cost_usd}.
export async function appendQuestionToResearch({
  parentTaskId,
  question,
  modelChoice = null,
}) {
  const parent = await getTaskById(parentTaskId);
  if (!parent) throw new Error("Не найдена исходная задача");
  if (parent.type !== "research_direct") {
    throw new Error("Дополнительный вопрос доступен только для задач research_direct");
  }
  const trimmed = (question ?? "").trim();
  if (!trimmed) throw new Error("Пустой вопрос");
  if (!parent.artifact_path) throw new Error("У исходной задачи нет артефакта в Storage");

  // Модель: либо явный choice, либо ту же, что у родителя.
  let provider, model;
  if (modelChoice) {
    ({ provider, model } = await resolveModelChoice(modelChoice, "research_direct"));
  } else {
    provider = parent.provider || "anthropic";
    model = parent.model;
    if (!model) {
      ({ provider, model } = await resolveModelChoice(null, "research_direct"));
    }
  }

  // Жёсткий лимит стоимости задачи: доп. вопрос биллится к parent — проверяем
  // суммарную стоимость до LLM-вызова, чтобы не плодить лишних запросов.
  const preCheck = await checkTaskLimit(parentTaskId);
  if (!preCheck.allowed) {
    const spent = Number(preCheck.spent_usd ?? 0);
    const limit = Number(preCheck.limit_usd ?? 0);
    throw new Error(
      `Превышен лимит стоимости задачи: фактически потрачено $${spent.toFixed(2)} ` +
        `из лимита $${limit.toFixed(2)}.`,
    );
  }

  const params = parent.params || {};
  const source = (params.source ?? "").trim();
  if (!source) throw new Error("В исходной задаче не сохранён источник");

  const fetched = await fetchSource(source);
  const rebuilt = await buildTaskPrompt("research_direct", {
    user_input: trimmed,
    source_label: fetched.label,
    source_text: fetched.text,
  });

  const result = await llmCall({
    provider,
    model,
    systemPrompt: rebuilt.system,
    userPrompt: rebuilt.user,
    cacheableBlocks: rebuilt.cacheableBlocks ?? [],
  });

  const apiEntry = await recordCall({
    provider,
    model,
    inputTokens: Number(result.inputTokens ?? 0),
    outputTokens: Number(result.outputTokens ?? 0),
    cachedTokens: Number(result.cachedTokens ?? 0),
    taskId: parentTaskId,
    success: true,
    // Сессия 12: доп. вопрос биллится к parent — agent_id тянем с него.
    agentId: parent.agent_id ?? null,
    purpose: "task",
  });

  // Дописываем в артефакт новый блок «## Вопрос» / «## Ответ».
  const existing = await downloadFile(DATABASE_BUCKET, parent.artifact_path);
  const ts = (() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}, ${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
  })();
  const appended =
    "\n\n---\n\n" +
    `## Вопрос (${ts})\n\n` +
    `${trimmed}\n\n` +
    "## Ответ\n\n" +
    `${(result.text || "").trim()}\n`;
  await uploadFile(DATABASE_BUCKET, parent.artifact_path, existing + appended);

  await refreshTaskCost(parentTaskId);

  return {
    success: true,
    appended_text: appended,
    cost_usd: Number(apiEntry?.cost_usd ?? 0),
  };
}

// =========================================================================
// shared: nextVersionInDir
// =========================================================================

async function nextVersionInDir(pointDir) {
  let files;
  try {
    files = await listFiles(DATABASE_BUCKET, pointDir);
  } catch {
    return 1;
  }
  let highest = 0;
  const re = /^v(\d+)_/i;
  for (const file of files) {
    const m = (file?.name ?? "").match(re);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n)) highest = Math.max(highest, n);
  }
  return highest + 1;
}

// Реэкспорт taskTemplateName для удобства роутов.
export { taskTemplateName };
