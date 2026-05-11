// Эндпоинты раздела «Сотрудники» (Сессия 9 этапа 2).
//
// CRUD над таблицей team_agents:
//   GET    /api/team/agents              — список (фильтр ?status).
//   GET    /api/team/agents/roster       — сжатый ростер активных агентов (Awareness).
//   GET    /api/team/agents/:id          — один агент.
//   GET    /api/team/agents/:id/history  — лог изменений (limit по умолчанию 50).
//   POST   /api/team/agents              — создать.
//   PATCH  /api/team/agents/:id          — частичное обновление.
//   DELETE /api/team/agents/:id          — мягкое удаление (status='archived').
//   POST   /api/team/agents/:id/restore  — снять архив (status='active').
//
// Все эндпоинты под requireAuth — единый паттерн с остальными /api/team/*.

import { Router } from "express";
import {
  listAgents,
  getAgent,
  getAgentRoster,
  getAgentHistory,
  createAgent,
  updateAgent,
  archiveAgent,
  restoreAgent,
} from "../../services/team/agentService.js";
import { call as llmCall, LLMError } from "../../services/team/llmClient.js";
import { recordCall } from "../../services/team/costTracker.js";
import { buildTestPrompt } from "../../services/team/promptBuilder.js";
import { getApiKey } from "../../services/team/keysService.js";
import { requireAuth } from "../../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

// Универсальный helper: статус ответа для «не найдено» / «уже существует» /
// валидационных ошибок. Поднимаем 400 для валидации, 404 для отсутствия,
// 409 для конфликта id, 500 — для остального.
function statusForError(err) {
  const msg = String(err?.message ?? "");
  if (/уже существует/i.test(msg)) return 409;
  if (/не найден/i.test(msg)) return 404;
  if (
    /обязател|некорректн|неизвестн|не может быть пуст|должен быть|нечего обновлять/i.test(msg)
  ) {
    return 400;
  }
  return 500;
}

// =========================================================================
// GET /api/team/agents?status=active|paused|archived|all
// По умолчанию — активные (как в большинстве UI-сценариев).
// =========================================================================
router.get("/", async (req, res) => {
  const status = String(req.query.status ?? "active");
  try {
    const agents = await listAgents({ status });
    return res.json({ agents });
  } catch (err) {
    console.error("[team/agents] list failed:", err);
    return res.status(statusForError(err)).json({ error: err.message ?? "Не удалось получить список агентов" });
  }
});

// =========================================================================
// GET /api/team/agents/roster
// Сжатый список { id, display_name, role_title, department, status } для
// Awareness-блока промпта. Используется promptBuilder в пункте 12.
// =========================================================================
router.get("/roster", async (_req, res) => {
  try {
    const roster = await getAgentRoster();
    return res.json({ roster });
  } catch (err) {
    console.error("[team/agents] roster failed:", err);
    return res.status(500).json({ error: err.message ?? "Не удалось получить ростер" });
  }
});

// =========================================================================
// GET /api/team/agents/:id
// =========================================================================
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const agent = await getAgent(id);
    return res.json({ agent });
  } catch (err) {
    console.error(`[team/agents] get ${id} failed:`, err);
    return res.status(statusForError(err)).json({ error: err.message ?? "Не удалось получить агента" });
  }
});

// =========================================================================
// GET /api/team/agents/:id/history?limit=50
// =========================================================================
router.get("/:id/history", async (req, res) => {
  const { id } = req.params;
  const limit = parseInt(String(req.query.limit ?? "50"), 10) || 50;
  try {
    const history = await getAgentHistory(id, { limit });
    return res.json({ history });
  } catch (err) {
    console.error(`[team/agents] history ${id} failed:`, err);
    return res.status(statusForError(err)).json({ error: err.message ?? "Не удалось получить историю" });
  }
});

// =========================================================================
// POST /api/team/agents
// Body: { id, display_name, role_title?, department?, biography?, avatar_url?,
//         default_model?, database_access?, available_tools?,
//         allowed_task_templates?, orchestration_mode?, autonomy_level?, comment? }
// =========================================================================
router.post("/", async (req, res) => {
  const body = req.body ?? {};
  try {
    const agent = await createAgent(body);
    return res.status(201).json({ agent });
  } catch (err) {
    console.error("[team/agents] create failed:", err);
    return res.status(statusForError(err)).json({ error: err.message ?? "Не удалось создать агента" });
  }
});

// =========================================================================
// PATCH /api/team/agents/:id
// Body: любой набор UPDATABLE_FIELDS + опц. comment.
// =========================================================================
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const agent = await updateAgent(id, req.body ?? {});
    return res.json({ agent });
  } catch (err) {
    console.error(`[team/agents] update ${id} failed:`, err);
    return res.status(statusForError(err)).json({ error: err.message ?? "Не удалось обновить агента" });
  }
});

// =========================================================================
// DELETE /api/team/agents/:id
// Мягкое удаление: status='archived'. Можно передать ?comment=... — оно
// пойдёт в history. Body тоже принимаем, на случай если фронт шлёт JSON.
// =========================================================================
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  const comment =
    (typeof req.query.comment === "string" && req.query.comment) ||
    (req.body && typeof req.body.comment === "string" ? req.body.comment : null);
  try {
    const agent = await archiveAgent(id, { comment });
    return res.json({ agent });
  } catch (err) {
    console.error(`[team/agents] archive ${id} failed:`, err);
    return res.status(statusForError(err)).json({ error: err.message ?? "Не удалось архивировать агента" });
  }
});

// =========================================================================
// POST /api/team/agents/draft-role
// Голосовой/текстовый чат с LLM для черновика Role в шаге 2 мастера.
// Body: { messages: [{role, content}], display_name, role_title }
// Ответ: { response: "<текст LLM>" }
// =========================================================================

// Модель по умолчанию для черновика Role и тестового полигона. Берём актуальный
// Sonnet — рассуждалка, которой Anthropic-аккаунты обычно владеют. Если ключа
// нет — эндпоинт вернёт 400 с подсказкой добавить ключ в Админке.
const FALLBACK_ANTHROPIC_MODEL = "claude-sonnet-4-20250514";

function buildDraftRoleSystem(displayName, roleTitle) {
  const name = (displayName || "—").trim();
  const role = (roleTitle || "").trim();
  return [
    "Ты — помощник для создания должностной инструкции агента AI-редакции блога об истории и культуре России в стиле Леонида Парфёнова.",
    role
      ? `Сейчас формируется инструкция для агента «${name}» (должность: ${role}).`
      : `Сейчас формируется инструкция для агента «${name}».`,
    "Задача: помочь автору блога описать должностную инструкцию. Сначала задай 2–3 коротких уточняющих вопроса (по одному за раз), потом — когда контуры понятны — сформируй финальный Role-файл по шаблону:",
    "",
    "## Зона ответственности",
    "[что делает агент]",
    "",
    "## Методология работы",
    "[как подходит к задачам]",
    "",
    "## Принципы",
    "- [принцип 1]",
    "- [принцип 2]",
    "",
    "## Что НЕ делает",
    "- [ограничение 1]",
    "",
    "Когда формируешь финальный Role-файл, начни ответ с заголовка `## Зона ответственности` — фронт автоматически перенесёт текст в редактор. До этого общайся свободно, без шаблона.",
  ].join("\n");
}

router.post("/draft-role", async (req, res) => {
  const body = req.body ?? {};
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const displayName =
    typeof body.display_name === "string" ? body.display_name.trim() : "";
  const roleTitle =
    typeof body.role_title === "string" ? body.role_title.trim() : "";

  if (messages.length === 0) {
    return res
      .status(400)
      .json({ error: "messages обязательны — нужен хотя бы один ход диалога." });
  }
  if (!displayName) {
    return res.status(400).json({ error: "display_name обязателен." });
  }

  // Anthropic-ключ — проверяем заранее, чтобы дать понятную ошибку до вызова.
  const anthropicKey = await getApiKey("anthropic").catch(() => null);
  if (!anthropicKey) {
    return res.status(400).json({
      error:
        "Для голосового черновика Role нужен Anthropic-ключ. Добавьте его в Админке → Ключи.",
    });
  }

  // Склейка диалога в системный + единый user. Anthropic поддерживает multi-turn
  // через messages array, но llmClient у нас принимает один user-prompt. Этого
  // достаточно: вся история склеивается в текст «Реплика автора:» / «Реплика
  // ассистента:». Качество ответов не страдает (тестировали в Сессии 7
  // refinePromptTemplate тем же способом).
  const systemPrompt = buildDraftRoleSystem(displayName, roleTitle);
  const dialogue = messages
    .map((m) => {
      const role = m?.role === "assistant" ? "Ассистент" : "Автор";
      const content = String(m?.content ?? "").trim();
      return content ? `${role}: ${content}` : "";
    })
    .filter(Boolean)
    .join("\n\n");
  const userPrompt = dialogue || "Здравствуй! Помоги составить должностную инструкцию.";

  const model = FALLBACK_ANTHROPIC_MODEL;
  try {
    const result = await llmCall({
      provider: "anthropic",
      model,
      systemPrompt,
      userPrompt,
      cacheableBlocks: [],
      maxTokens: 4096,
    });

    await recordCall({
      provider: "anthropic",
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cachedTokens: result.cachedTokens,
      success: true,
      agentId: "system",
      purpose: "role_draft",
    });

    return res.json({
      response: result.text,
      tokens: {
        input: result.inputTokens,
        output: result.outputTokens,
        cached: result.cachedTokens,
      },
    });
  } catch (err) {
    console.error("[team/agents] draft-role failed:", err);
    // Журналим неудачный вызов, чтобы потом видеть статистику падений.
    await recordCall({
      provider: "anthropic",
      model,
      success: false,
      error: err?.message ?? String(err),
      agentId: "system",
      purpose: "role_draft",
    }).catch(() => {});
    const status = err instanceof LLMError ? 502 : 500;
    return res.status(status).json({ error: err.message ?? "Не удалось получить ответ LLM" });
  }
});

// =========================================================================
// POST /api/team/agents/test-run
// «Тестовый полигон» в шаге 3 мастера: запускает агента с уже выбранной
// моделью, переданным Role и seed-rules, прогоняет тестовый запрос.
// Тестовые прогоны НЕ сохраняются в team_tasks — это разовый sanity-check.
// Body: { role, seed_rules: [...], model, query, provider? }
// Ответ: { response, tokens: { input, output, cached } }
// =========================================================================

router.post("/test-run", async (req, res) => {
  const body = req.body ?? {};
  const role = typeof body.role === "string" ? body.role : "";
  const seedRules = Array.isArray(body.seed_rules) ? body.seed_rules : [];
  const query = typeof body.query === "string" ? body.query.trim() : "";
  const explicitProvider =
    typeof body.provider === "string" && body.provider.trim()
      ? body.provider.trim()
      : null;
  const model =
    typeof body.model === "string" && body.model.trim()
      ? body.model.trim()
      : FALLBACK_ANTHROPIC_MODEL;

  if (!query) {
    return res.status(400).json({ error: "query обязателен — введите тестовый запрос." });
  }
  if (!role.trim()) {
    return res.status(400).json({ error: "role обязателен — заполните должностную инструкцию." });
  }

  // Если provider не передан и модель не Anthropic-овская — попробуем угадать
  // по префиксу. Это допустимо для теста: при создании реального агента
  // taskRunner определит provider по pricing.json, а здесь мы хотим быстро.
  let provider = explicitProvider;
  if (!provider) {
    if (model.startsWith("claude")) provider = "anthropic";
    else if (model.startsWith("gemini")) provider = "google";
    else if (model.startsWith("gpt") || model.startsWith("o1") || model.startsWith("o3")) {
      provider = "openai";
    } else {
      provider = "anthropic"; // дефолт
    }
  }

  try {
    const prompt = await buildTestPrompt({ role, seedRules, query });
    const result = await llmCall({
      provider,
      model,
      systemPrompt: prompt.system,
      userPrompt: prompt.user,
      cacheableBlocks: prompt.cacheableBlocks,
      maxTokens: 4096,
    });

    await recordCall({
      provider,
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cachedTokens: result.cachedTokens,
      success: true,
      agentId: "system",
      purpose: "test_run",
    });

    return res.json({
      response: result.text,
      tokens: {
        input: result.inputTokens,
        output: result.outputTokens,
        cached: result.cachedTokens,
      },
    });
  } catch (err) {
    console.error("[team/agents] test-run failed:", err);
    await recordCall({
      provider,
      model,
      success: false,
      error: err?.message ?? String(err),
      agentId: "system",
      purpose: "test_run",
    }).catch(() => {});
    const status = err instanceof LLMError ? 502 : 500;
    return res.status(status).json({ error: err.message ?? "Не удалось выполнить тестовый прогон" });
  }
});

// =========================================================================
// POST /api/team/agents/:id/restore
// Снимает архив, возвращает статус active. comment — в history.
// =========================================================================
router.post("/:id/restore", async (req, res) => {
  const { id } = req.params;
  const comment = req.body && typeof req.body.comment === "string" ? req.body.comment : null;
  try {
    const agent = await restoreAgent(id, { comment });
    return res.json({ agent });
  } catch (err) {
    console.error(`[team/agents] restore ${id} failed:`, err);
    return res.status(statusForError(err)).json({ error: err.message ?? "Не удалось восстановить агента" });
  }
});

export default router;
