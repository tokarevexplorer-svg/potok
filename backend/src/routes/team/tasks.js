// REST-эндпоинты команды для запуска и управления задачами.
//
// Все операции, которые требуют service-role (запись в team_tasks,
// биллинг через team_api_calls, реальный вызов LLM), идут через бэкенд.
// Чтение списков задач фронт делает напрямую из Supabase через
// teamSupabase-клиент с RLS — это снимает нагрузку с бэкенда и быстрее.
//
// Все ошибки → JSON `{error: "<сообщение на русском>"}` с подходящим HTTP-кодом.

import { Router } from "express";
import {
  TASK_HANDLERS,
  TASK_TITLES,
  HIDDEN_TYPES_IN_LOG,
} from "../../services/team/taskHandlers.js";
import {
  createTask,
  previewPrompt,
  archiveTask,
  renameTask,
  markTaskDone,
  applyFragmentEditsInline,
  saveDirectEdit,
  appendQuestionToResearch,
} from "../../services/team/taskRunner.js";
import { getTaskById, getChildTasks } from "../../services/team/teamSupabase.js";
import { getAgent } from "../../services/team/agentService.js";
import { listFiles, downloadFile } from "../../services/team/teamStorage.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { checkDailyLimit } from "../../services/team/costTracker.js";
import { getTaskTemplateDefaults } from "../../services/team/promptBuilder.js";

const DATABASE_BUCKET = "team-database";

const router = Router();

// Все маршруты команды требуют валидного JWT (см. Сессию 1 этапа 2,
// Claude_team_stage2.md). 401 без токена, 403 на чужой email.
router.use(requireAuth);

const TASK_ID_REGEX = /^tsk_[A-Za-z0-9]+$/;

function ensureTaskId(req, res) {
  const taskId = req.params.taskId;
  if (typeof taskId !== "string" || !TASK_ID_REGEX.test(taskId)) {
    res.status(400).json({ error: "Некорректный taskId" });
    return null;
  }
  return taskId;
}

// =========================================================================
// GET /api/team/tasks/templates
// Список доступных типов задач (используется UI для рендеринга кнопок).
// =========================================================================

router.get("/templates", (_req, res) => {
  const templates = Object.keys(TASK_HANDLERS).map((type) => ({
    type,
    title: TASK_TITLES[type] ?? type,
    hiddenInLog: HIDDEN_TYPES_IN_LOG.has(type),
  }));
  res.json({ templates });
});

// =========================================================================
// GET /api/team/tasks/template-defaults/:taskType
// Сессия 29: возвращает frontmatter-дефолты конкретного шаблона задачи
// (поле self_review_default и т.п.). Используется формой постановки задачи,
// чтобы преселектить чекбоксы.
// =========================================================================
router.get("/template-defaults/:taskType", async (req, res) => {
  const { taskType } = req.params;
  if (!TASK_HANDLERS[taskType]) {
    return res.status(400).json({ error: "Неизвестный тип задачи" });
  }
  try {
    const defaults = await getTaskTemplateDefaults(taskType);
    return res.json({ defaults });
  } catch (err) {
    console.error(`[team/tasks] template-defaults ${taskType} failed:`, err);
    return res
      .status(500)
      .json({ error: err?.message ?? "Не удалось получить дефолты шаблона" });
  }
});

// =========================================================================
// POST /api/team/tasks/preview-prompt
// Body: { taskType, params }
// Возвращает собранный промпт без запуска задачи. UI показывает его и даёт
// пользователю возможность отредактировать перед запуском.
// =========================================================================

router.post("/preview-prompt", async (req, res) => {
  const { taskType, params, agentId } = req.body ?? {};
  if (typeof taskType !== "string" || !TASK_HANDLERS[taskType]) {
    return res.status(400).json({ error: "Неизвестный тип задачи" });
  }
  try {
    // Сессия 12: agentId — top-level, чтобы превью отражало то, что увидит
    // конкретный агент (Role + Memory + Awareness). buildPrompt принимает
    // ключ `agent_id` в variables.
    const promptVars = { ...(params || {}) };
    if (typeof agentId === "string" && agentId.trim()) {
      promptVars.agent_id = agentId.trim();
    }
    const prompt = await previewPrompt(taskType, promptVars);
    return res.json({ prompt });
  } catch (err) {
    console.error("[team] preview-prompt failed:", err);
    return res.status(500).json({ error: err.message ?? "Не удалось собрать промпт" });
  }
});

// =========================================================================
// POST /api/team/tasks/run
// Body: { taskType, params, modelChoice?, promptOverride?, title? }
// Создаёт задачу со статусом running, кладёт id в очередь команды,
// сразу отвечает 202. Реальный handler отработает в фоне.
// =========================================================================

router.post("/run", async (req, res) => {
  const {
    taskType,
    params,
    modelChoice,
    promptOverride,
    title,
    agentId,
    parentTaskId,
    attachParentArtifact,
    projectId,
    selfReviewEnabled,
    selfReviewExtraChecks,
  } = req.body ?? {};

  if (typeof taskType !== "string" || !TASK_HANDLERS[taskType]) {
    return res.status(400).json({ error: "Неизвестный тип задачи" });
  }
  if (params != null && (typeof params !== "object" || Array.isArray(params))) {
    return res.status(400).json({ error: "params должен быть объектом" });
  }

  // Сессия 12: agentId — опц. top-level. Принимаем строку (slug агента) или
  // null/undefined. Без агента задача собирается «как раньше» — только
  // Mission + Goals + шаблон.
  let normalizedAgentId = null;
  if (typeof agentId === "string" && agentId.trim()) {
    normalizedAgentId = agentId.trim();
  } else if (agentId !== null && agentId !== undefined && agentId !== "") {
    return res
      .status(400)
      .json({ error: "agentId должен быть строкой (id агента) или null." });
  }

  // Сессия 13: parentTaskId — опц. top-level. При handoff содержит id
  // исходной задачи. Если флаг attachParentArtifact=true — подмешиваем
  // контент артефакта родителя в params.user_input как «контекст».
  let normalizedParentId = null;
  if (typeof parentTaskId === "string" && parentTaskId.trim()) {
    if (!TASK_ID_REGEX.test(parentTaskId.trim())) {
      return res.status(400).json({ error: "Некорректный parentTaskId" });
    }
    normalizedParentId = parentTaskId.trim();
  } else if (parentTaskId !== null && parentTaskId !== undefined && parentTaskId !== "") {
    return res
      .status(400)
      .json({ error: "parentTaskId должен быть строкой (id задачи) или null." });
  }

  // Сессия 16: projectId — опц. навигационный тег. Если не передан — задача
  // без проекта (категория «⚪ Без проекта»). Невалидный id (несуществующий
  // проект) даст ошибку при createTask через FK ON UPDATE — пока такие
  // случаи возвращаем как 400.
  let normalizedProjectId = null;
  if (typeof projectId === "string" && projectId.trim()) {
    normalizedProjectId = projectId.trim();
  } else if (projectId !== null && projectId !== undefined && projectId !== "") {
    return res
      .status(400)
      .json({ error: "projectId должен быть строкой (id проекта) или null." });
  }

  // Сессия 17: если выбран агент и у него непустой allowed_task_templates,
  // запрошенный taskType должен входить в этот список. Иначе 400 — иначе
  // Влад мог бы запустить шаблон, который ему не разрешён в карточке агента.
  // Пустой allowed_task_templates = «разрешено всё» (старое поведение
  // этапа 1, когда поля ещё не было).
  if (normalizedAgentId) {
    try {
      const agent = await getAgent(normalizedAgentId);
      const allowed = Array.isArray(agent?.allowed_task_templates)
        ? agent.allowed_task_templates
        : [];
      if (allowed.length > 0 && !allowed.includes(taskType)) {
        return res.status(400).json({
          error:
            `Этот шаблон задачи не разрешён для сотрудника «${agent.display_name}». ` +
            `Добавь его в раздел «Доступы → Шаблоны задач» в карточке сотрудника.`,
        });
      }
    } catch (err) {
      // Если агента не нашли — пускаем дальше, mergeSnapshot / FK даст
      // понятную ошибку. Падать тут раньше времени не имеет смысла.
      console.warn(
        `[team/tasks] не удалось получить агента ${normalizedAgentId} для allowlist:`,
        err?.message ?? err,
      );
    }
  }

  try {
    // Жёсткий дневной лимит. Считаем сумму cost_usd в team_api_calls за
    // текущие UTC-сутки и сверяем с настройкой в team_settings (запись
    // key='limits'). При превышении возвращаем 409 — фронт покажет alert.
    const dailyCheck = await checkDailyLimit();
    if (!dailyCheck.allowed) {
      const spent = Number(dailyCheck.spent_usd ?? 0);
      const limit = Number(dailyCheck.limit_usd ?? 0);
      return res.status(409).json({
        error:
          `Достигнут дневной лимит расходов: $${spent.toFixed(2)} из $${limit.toFixed(2)}. ` +
          "Поднимите лимит в Админке или попробуйте завтра.",
        spent_usd: spent,
        limit_usd: limit,
      });
    }

    // Сборка финальных params: при handoff с прикреплённым артефактом
    // дописываем контекст в user_input. Сама задача создаётся «обычно»,
    // просто видит расширенный бриф.
    let finalParams = params || {};
    if (normalizedParentId && attachParentArtifact === true) {
      const parent = await getTaskById(normalizedParentId);
      if (parent?.artifact_path) {
        try {
          const content = await downloadFile(DATABASE_BUCKET, parent.artifact_path);
          const userBrief = String(finalParams.user_input ?? "").trim();
          const parentLabel = parent.title || `задача ${parent.id}`;
          const contextBlock =
            `\n\n---\n\n## Контекст из задачи «${parentLabel}»\n\n${content}`;
          finalParams = {
            ...finalParams,
            user_input: userBrief ? userBrief + contextBlock : contextBlock.trim(),
          };
        } catch (err) {
          console.warn(
            `[team] tasks/run: не удалось приложить артефакт родителя ${normalizedParentId}:`,
            err?.message ?? err,
          );
        }
      }
    }

    // Сессия 29: self-review. Принимаем boolean или null (тогда createTask
    // возьмёт frontmatter-дефолт шаблона). Extra-checks — текст по строке.
    let normalizedSelfReview = null;
    if (typeof selfReviewEnabled === "boolean") {
      normalizedSelfReview = selfReviewEnabled;
    } else if (selfReviewEnabled !== undefined && selfReviewEnabled !== null) {
      return res
        .status(400)
        .json({ error: "selfReviewEnabled должен быть boolean или null." });
    }
    let normalizedExtraChecks = null;
    if (typeof selfReviewExtraChecks === "string") {
      normalizedExtraChecks = selfReviewExtraChecks.trim() || null;
    } else if (selfReviewExtraChecks !== undefined && selfReviewExtraChecks !== null) {
      return res
        .status(400)
        .json({ error: "selfReviewExtraChecks должен быть строкой или null." });
    }

    const taskId = await createTask({
      taskType,
      params: finalParams,
      modelChoice: modelChoice ?? null,
      promptOverride: promptOverride ?? null,
      title: title ?? null,
      agentId: normalizedAgentId,
      parentTaskId: normalizedParentId,
      projectId: normalizedProjectId,
      selfReviewEnabled: normalizedSelfReview,
      selfReviewExtraChecks: normalizedExtraChecks,
    });
    return res.status(202).json({ taskId });
  } catch (err) {
    console.error("[team] tasks/run failed:", err);
    return res.status(400).json({ error: err.message ?? "Не удалось создать задачу" });
  }
});

// =========================================================================
// POST /api/team/tasks/:taskId/archive
// =========================================================================

router.post("/:taskId/archive", async (req, res) => {
  const taskId = ensureTaskId(req, res);
  if (!taskId) return;
  try {
    const task = await archiveTask(taskId);
    return res.json({ task });
  } catch (err) {
    console.error(`[team] archive ${taskId} failed:`, err);
    return res.status(404).json({ error: err.message ?? "Задача не найдена" });
  }
});

// =========================================================================
// POST /api/team/tasks/:taskId/rename
// Body: { title }
// =========================================================================

router.post("/:taskId/rename", async (req, res) => {
  const taskId = ensureTaskId(req, res);
  if (!taskId) return;
  const { title } = req.body ?? {};
  if (typeof title !== "string" || !title.trim()) {
    return res.status(400).json({ error: "title должен быть непустой строкой" });
  }
  try {
    const task = await renameTask(taskId, title);
    return res.json({ task });
  } catch (err) {
    console.error(`[team] rename ${taskId} failed:`, err);
    return res.status(404).json({ error: err.message ?? "Задача не найдена" });
  }
});

// =========================================================================
// POST /api/team/tasks/:taskId/mark-done
// =========================================================================

router.post("/:taskId/mark-done", async (req, res) => {
  const taskId = ensureTaskId(req, res);
  if (!taskId) return;
  try {
    const task = await markTaskDone(taskId);
    return res.json({ task });
  } catch (err) {
    console.error(`[team] mark-done ${taskId} failed:`, err);
    return res.status(404).json({ error: err.message ?? "Задача не найдена" });
  }
});

// =========================================================================
// POST /api/team/tasks/:taskId/append-question
// Body: { question, modelChoice? }
// Доп.вопрос к research_direct: дописывает в существующий артефакт,
// биллинг идёт против исходной задачи (без новой записи в team_tasks).
// =========================================================================

router.post("/:taskId/append-question", async (req, res) => {
  const taskId = ensureTaskId(req, res);
  if (!taskId) return;
  const { question, modelChoice } = req.body ?? {};
  if (typeof question !== "string" || !question.trim()) {
    return res.status(400).json({ error: "question должен быть непустой строкой" });
  }
  try {
    const result = await appendQuestionToResearch({
      parentTaskId: taskId,
      question,
      modelChoice: modelChoice ?? null,
    });
    return res.json(result);
  } catch (err) {
    console.error(`[team] append-question ${taskId} failed:`, err);
    return res.status(400).json({ error: err.message ?? "Не удалось дописать вопрос" });
  }
});

// =========================================================================
// POST /api/team/tasks/:taskId/apply-ai-edit
// Body: { fullText, edits, generalInstruction?, modelChoice?, promptOverride? }
// Применяет AI-правки к артефакту write_text задачи. Создаёт новую версию
// (vN+1) в той же папке, биллинг к родителю.
// =========================================================================

router.post("/:taskId/apply-ai-edit", async (req, res) => {
  const taskId = ensureTaskId(req, res);
  if (!taskId) return;
  const {
    fullText,
    edits,
    generalInstruction,
    modelChoice,
    promptOverride,
  } = req.body ?? {};

  if (typeof fullText !== "string") {
    return res.status(400).json({ error: "fullText должен быть строкой" });
  }
  if (!Array.isArray(edits)) {
    return res.status(400).json({ error: "edits должен быть массивом" });
  }

  try {
    const result = await applyFragmentEditsInline({
      parentTaskId: taskId,
      fullText,
      edits,
      generalInstruction: generalInstruction ?? "",
      modelChoice: modelChoice ?? null,
      promptOverride: promptOverride ?? null,
    });
    return res.json(result);
  } catch (err) {
    console.error(`[team] apply-ai-edit ${taskId} failed:`, err);
    return res.status(400).json({ error: err.message ?? "Не удалось применить правки" });
  }
});

// =========================================================================
// POST /api/team/tasks/:taskId/save-direct-edit
// Body: { content }
// Прямая правка от пользователя без LLM-вызова. Просто новая версия
// в той же папке точки, биллинг = 0.
// =========================================================================

router.post("/:taskId/save-direct-edit", async (req, res) => {
  const taskId = ensureTaskId(req, res);
  if (!taskId) return;
  const { content } = req.body ?? {};
  if (typeof content !== "string") {
    return res.status(400).json({ error: "content должен быть строкой" });
  }
  try {
    const result = await saveDirectEdit({ parentTaskId: taskId, content });
    return res.json(result);
  } catch (err) {
    console.error(`[team] save-direct-edit ${taskId} failed:`, err);
    return res.status(400).json({ error: err.message ?? "Не удалось сохранить версию" });
  }
});

// =========================================================================
// GET /api/team/tasks/:taskId/versions
// Список версий артефакта write_text задачи. Сканирует папку точки в
// bucket'е team-database, находит все файлы вида vN_<ts>.md, парсит номер
// версии из имени, сортирует по убыванию.
//
// Query: ?withContent=1 — дополнительно скачивает содержимое каждой версии.
// Без параметра — только метаданные (быстрее, для шапки модалки).
// =========================================================================

router.get("/:taskId/versions", async (req, res) => {
  const taskId = ensureTaskId(req, res);
  if (!taskId) return;

  try {
    const task = await getTaskById(taskId);
    if (!task) return res.status(404).json({ error: "Задача не найдена" });
    if (task.type !== "write_text" && task.type !== "edit_text_fragments") {
      return res.json({ versions: [] });
    }
    if (!task.artifact_path) return res.json({ versions: [] });

    const pointDir = task.artifact_path.includes("/")
      ? task.artifact_path.slice(0, task.artifact_path.lastIndexOf("/"))
      : "";
    if (!pointDir) return res.json({ versions: [] });

    const files = await listFiles(DATABASE_BUCKET, pointDir);
    const versionRe = /^v(\d+)_(.+)\.md$/i;
    const versions = [];
    for (const file of files ?? []) {
      const name = file?.name ?? "";
      const match = name.match(versionRe);
      if (!match) continue;
      const version = parseInt(match[1], 10);
      if (!Number.isFinite(version)) continue;
      versions.push({
        version,
        name,
        path: `${pointDir}/${name}`,
        createdAt: file?.created_at ?? null,
        updatedAt: file?.updated_at ?? null,
        size: file?.metadata?.size ?? null,
      });
    }

    versions.sort((a, b) => b.version - a.version);

    const withContent = req.query.withContent === "1" || req.query.withContent === "true";
    if (withContent) {
      for (const v of versions) {
        try {
          v.content = await downloadFile(DATABASE_BUCKET, v.path);
        } catch (err) {
          console.warn(`[team] versions: не удалось прочитать ${v.path}:`, err.message);
          v.content = null;
        }
      }
    }

    return res.json({ versions });
  } catch (err) {
    console.error(`[team] versions ${taskId} failed:`, err);
    return res.status(500).json({ error: err.message ?? "Не удалось получить версии" });
  }
});

// =========================================================================
// GET /api/team/tasks/:taskId/version-content?path=<storagePath>
// Скачивает содержимое одной версии артефакта по её пути в Storage. Path
// валидируется, что относится к папке исходной задачи — иначе можно было бы
// вытащить любой файл bucket'а через подмену query.
// =========================================================================

router.get("/:taskId/version-content", async (req, res) => {
  const taskId = ensureTaskId(req, res);
  if (!taskId) return;
  const path = typeof req.query.path === "string" ? req.query.path.trim() : "";
  if (!path) return res.status(400).json({ error: "path обязателен" });
  if (path.includes("..")) return res.status(400).json({ error: "Некорректный path" });

  try {
    const task = await getTaskById(taskId);
    if (!task) return res.status(404).json({ error: "Задача не найдена" });
    if (!task.artifact_path) {
      return res.status(404).json({ error: "У задачи нет артефакта" });
    }
    const pointDir = task.artifact_path.includes("/")
      ? task.artifact_path.slice(0, task.artifact_path.lastIndexOf("/"))
      : "";
    if (!path.startsWith(`${pointDir}/`)) {
      return res.status(400).json({ error: "Запрошенный путь не принадлежит задаче" });
    }
    const content = await downloadFile(DATABASE_BUCKET, path);
    return res.json({ path, content });
  } catch (err) {
    console.error(`[team] version-content ${taskId} failed:`, err);
    return res.status(500).json({ error: err.message ?? "Не удалось прочитать версию" });
  }
});

// =========================================================================
// GET /api/team/tasks/:taskId/chain
// Возвращает цепочку задач (Сессия 13, handoff): корень → ... → текущая → ...
// дочерние. Используется UI для подсветки связей между задачами.
//
// Алгоритм:
//   1. Идём вверх по parent_task_id, пока есть родитель (защита от циклов —
//      hard cap 50 шагов, чтобы баг в данных не зациклил сервер).
//   2. От корня обходим вниз через getChildTasks (BFS, тот же cap).
//   3. Считаем current_index — позицию текущей задачи в линейном
//      порядке цепочки (для UI «← 2/4 →»).
//
// Возвращает { chain: [{id, title, agent_id, status, parent_task_id}],
//              current_index, total }. Если задача не найдена — 404.
// =========================================================================

router.get("/:taskId/chain", async (req, res) => {
  const taskId = ensureTaskId(req, res);
  if (!taskId) return;

  const MAX_DEPTH = 50;

  try {
    const current = await getTaskById(taskId);
    if (!current) return res.status(404).json({ error: "Задача не найдена" });

    // Поднимаемся к корню.
    const ancestorsReversed = [];
    let cursor = current;
    const visited = new Set([cursor.id]);
    let safety = 0;
    while (cursor.parent_task_id && safety < MAX_DEPTH) {
      const parent = await getTaskById(cursor.parent_task_id);
      if (!parent) break;
      if (visited.has(parent.id)) break; // защита от цикла в данных
      visited.add(parent.id);
      ancestorsReversed.push(parent);
      cursor = parent;
      safety += 1;
    }
    const root = ancestorsReversed.length > 0
      ? ancestorsReversed[ancestorsReversed.length - 1]
      : current;

    // Спускаемся от корня вниз (BFS). При сходящейся ветке несколько дочерних —
    // обрабатываем все. visited предотвращает повторные посещения.
    const allTasks = new Map(); // id → row
    const queue = [root];
    visited.clear();
    visited.add(root.id);
    allTasks.set(root.id, root);
    while (queue.length && allTasks.size < MAX_DEPTH * 2) {
      const node = queue.shift();
      const children = await getChildTasks(node.id);
      for (const child of children) {
        if (visited.has(child.id)) continue;
        visited.add(child.id);
        allTasks.set(child.id, child);
        queue.push(child);
      }
    }

    // Линейная цепочка: BFS-порядок от корня. Для UI этого достаточно —
    // если ветвление было, UI отобразит как «дерево» (но в MVP мы не строим
    // граф, только список). Сортируем по created_at, чтобы порядок был
    // детерминированным.
    const chainRows = Array.from(allTasks.values())
      .sort((a, b) => {
        const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
        const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
        return ta - tb;
      })
      .map((row) => ({
        id: row.id,
        title: row.title,
        type: row.type,
        status: row.status,
        agent_id: row.agent_id ?? null,
        parent_task_id: row.parent_task_id ?? null,
        suggested_next_steps: row.suggested_next_steps ?? null,
        created_at: row.created_at,
      }));

    const currentIndex = chainRows.findIndex((t) => t.id === current.id);

    return res.json({
      chain: chainRows,
      current_index: currentIndex >= 0 ? currentIndex : 0,
      total: chainRows.length,
    });
  } catch (err) {
    console.error(`[team] chain ${taskId} failed:`, err);
    return res.status(500).json({ error: err.message ?? "Не удалось получить цепочку" });
  }
});

// =========================================================================
// GET /api/team/tasks/:taskId
// Текущее состояние задачи. Нужен фронту, чтобы загрузить детали задачи
// без полного запроса /api/team/tasks (например, при открытии модалки
// handoff из строки лога — там есть только id). Read-only.
// =========================================================================

router.get("/:taskId", async (req, res) => {
  const taskId = ensureTaskId(req, res);
  if (!taskId) return;
  try {
    const task = await getTaskById(taskId);
    if (!task) return res.status(404).json({ error: "Задача не найдена" });
    return res.json({ task });
  } catch (err) {
    console.error(`[team] get ${taskId} failed:`, err);
    return res.status(500).json({ error: err.message ?? "Не удалось получить задачу" });
  }
});

export default router;
