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
import { getTaskById } from "../../services/team/teamSupabase.js";
import { listFiles, downloadFile } from "../../services/team/teamStorage.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { checkDailyLimit } from "../../services/team/costTracker.js";

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
  const { taskType, params, modelChoice, promptOverride, title, agentId } =
    req.body ?? {};

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

    const taskId = await createTask({
      taskType,
      params: params || {},
      modelChoice: modelChoice ?? null,
      promptOverride: promptOverride ?? null,
      title: title ?? null,
      agentId: normalizedAgentId,
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

export default router;
