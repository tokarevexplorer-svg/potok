// Эндпоинты раздела «Инструменты команды» (Сессия 20 этапа 2, пункт 16).
//
//   GET    /api/team/tools                    — список (?type=executor|system|all)
//   GET    /api/team/tools/:id                — одна запись
//   POST   /api/team/tools                    — создание
//   PATCH  /api/team/tools/:id                — обновление (status, config, ...)
//   GET    /api/team/tools/:id/manifest       — содержимое методички из Storage
//   GET    /api/team/agents/:agentId/tools    — инструменты агента (см. ниже —
//                                                этот роут живёт на /tools/by-agent
//                                                чтобы не конфликтовать с agents.js).
//   PUT    /api/team/agents/:agentId/tools    — полная замена привязок (см. ниже).

import { Router } from "express";
import {
  listTools,
  getToolById,
  createTool,
  updateTool,
  getToolManifest,
  getAgentTools,
  setAgentTools,
} from "../../services/team/toolService.js";
import { invalidatePromptCache } from "../../services/team/promptBuilder.js";
import { requireAuth } from "../../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

// =========================================================================
// GET /api/team/tools?type=executor|system|all
// =========================================================================
router.get("/", async (req, res) => {
  const type = String(req.query.type ?? "all");
  try {
    const tools = await listTools(type);
    return res.json({ tools });
  } catch (err) {
    console.error("[team/tools] list failed:", err);
    return res
      .status(500)
      .json({ error: err.message ?? "Не удалось получить список инструментов" });
  }
});

// =========================================================================
// POST /api/team/tools
// =========================================================================
router.post("/", async (req, res) => {
  try {
    const tool = await createTool(req.body ?? {});
    invalidatePromptCache();
    return res.status(201).json({ tool });
  } catch (err) {
    console.error("[team/tools] create failed:", err);
    return res
      .status(400)
      .json({ error: err.message ?? "Не удалось создать инструмент" });
  }
});

// =========================================================================
// GET /api/team/tools/by-agent/:agentId
// (Не вешаем на /api/team/agents/:agentId/tools — agents.js уже зарегистрирован
// раньше с своими роутами, а добавлять туда зависимость от toolService =
// циклическая. Здесь свой namespace.)
// =========================================================================
router.get("/by-agent/:agentId", async (req, res) => {
  const { agentId } = req.params;
  const onlyActive = req.query.only_active === "true";
  try {
    const tools = await getAgentTools(agentId, { onlyActive });
    return res.json({ tools });
  } catch (err) {
    console.error(`[team/tools] by-agent ${agentId} failed:`, err);
    return res
      .status(500)
      .json({ error: err.message ?? "Не удалось получить инструменты агента" });
  }
});

// =========================================================================
// PUT /api/team/tools/by-agent/:agentId
// body: { tool_ids: ["notebooklm", "web-search", ...] }
// Полная замена привязок.
// =========================================================================
router.put("/by-agent/:agentId", async (req, res) => {
  const { agentId } = req.params;
  const toolIds = Array.isArray(req.body?.tool_ids) ? req.body.tool_ids : null;
  if (!toolIds) {
    return res.status(400).json({ error: "tool_ids должен быть массивом строк." });
  }
  try {
    const saved = await setAgentTools(agentId, toolIds);
    invalidatePromptCache();
    return res.json({ tool_ids: saved });
  } catch (err) {
    console.error(`[team/tools] PUT by-agent ${agentId} failed:`, err);
    return res
      .status(400)
      .json({ error: err.message ?? "Не удалось сохранить привязки" });
  }
});

// =========================================================================
// GET /api/team/tools/:id
// =========================================================================
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const tool = await getToolById(id);
    if (!tool) return res.status(404).json({ error: "Инструмент не найден" });
    return res.json({ tool });
  } catch (err) {
    console.error(`[team/tools] get ${id} failed:`, err);
    return res
      .status(500)
      .json({ error: err.message ?? "Не удалось получить инструмент" });
  }
});

// =========================================================================
// PATCH /api/team/tools/:id
// =========================================================================
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const tool = await updateTool(id, req.body ?? {});
    invalidatePromptCache();
    return res.json({ tool });
  } catch (err) {
    console.error(`[team/tools] update ${id} failed:`, err);
    const status = /не найден/i.test(err?.message ?? "") ? 404 : 400;
    return res
      .status(status)
      .json({ error: err.message ?? "Не удалось обновить инструмент" });
  }
});

// =========================================================================
// GET /api/team/tools/:id/manifest
// =========================================================================
router.get("/:id/manifest", async (req, res) => {
  const { id } = req.params;
  try {
    const content = await getToolManifest(id);
    return res.json({ content });
  } catch (err) {
    console.error(`[team/tools] manifest ${id} failed:`, err);
    return res
      .status(500)
      .json({ error: err.message ?? "Не удалось получить методичку" });
  }
});

export default router;
