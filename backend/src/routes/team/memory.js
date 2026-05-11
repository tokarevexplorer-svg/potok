// Эндпоинты раздела «Память агентов» (Сессия 8 этапа 2).
//
// CRUD над таблицей team_agent_memory:
//   GET    /api/team/memory/:agentId         — все записи памяти агента (фильтры ?type, ?status).
//   GET    /api/team/memory/:agentId/rules   — активные правила (для промпта и UI).
//   GET    /api/team/memory/:agentId/stats   — счётчики (rules, episodes, archived...).
//   POST   /api/team/memory/:agentId         — добавить правило или эпизод (body.type).
//   PATCH  /api/team/memory/:id              — частичное обновление (content, status, pinned).
//   DELETE /api/team/memory/:id              — мягкое удаление (status = 'archived').
//
// Все эндпоинты под requireAuth — единый паттерн с остальными /api/team/*.

import { Router } from "express";
import {
  getAllMemory,
  getRulesForAgent,
  getMemoryStats,
  addRule,
  addEpisode,
  updateMemory,
  archiveMemory,
} from "../../services/team/memoryService.js";
import { requireAuth } from "../../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

// =========================================================================
// GET /api/team/memory/:agentId
// Параметры: ?type=rule|episode|all (default all), ?status=active|archived|all (default all).
// =========================================================================
router.get("/:agentId", async (req, res) => {
  const { agentId } = req.params;
  const type = String(req.query.type ?? "all");
  const status = String(req.query.status ?? "all");
  try {
    const items = await getAllMemory(agentId, { type, status });
    return res.json({ items });
  } catch (err) {
    console.error(`[team/memory] list ${agentId} failed:`, err);
    return res.status(500).json({ error: err.message ?? "Не удалось получить память агента" });
  }
});

// =========================================================================
// GET /api/team/memory/:agentId/rules
// Только активные правила, отсортированные по created_at ASC.
// =========================================================================
router.get("/:agentId/rules", async (req, res) => {
  const { agentId } = req.params;
  try {
    const rules = await getRulesForAgent(agentId);
    return res.json({ rules });
  } catch (err) {
    console.error(`[team/memory] rules ${agentId} failed:`, err);
    return res.status(500).json({ error: err.message ?? "Не удалось получить правила" });
  }
});

// =========================================================================
// GET /api/team/memory/:agentId/stats
// =========================================================================
router.get("/:agentId/stats", async (req, res) => {
  const { agentId } = req.params;
  try {
    const stats = await getMemoryStats(agentId);
    return res.json({ stats });
  } catch (err) {
    console.error(`[team/memory] stats ${agentId} failed:`, err);
    return res.status(500).json({ error: err.message ?? "Не удалось получить статистику памяти" });
  }
});

// =========================================================================
// POST /api/team/memory/:agentId
// body: { type: 'rule'|'episode', content, source?, pinned?, score?, taskId? }
// Эпизод требует, как минимум, content; правило — тоже только content.
// =========================================================================
router.post("/:agentId", async (req, res) => {
  const { agentId } = req.params;
  const body = req.body ?? {};
  const type = body.type;
  if (type !== "rule" && type !== "episode") {
    return res.status(400).json({ error: "type должен быть 'rule' или 'episode'." });
  }

  try {
    let saved;
    if (type === "rule") {
      saved = await addRule({
        agentId,
        content: body.content,
        source: body.source ?? "manual",
        pinned: !!body.pinned,
      });
    } else {
      saved = await addEpisode({
        agentId,
        content: body.content,
        score: body.score ?? null,
        taskId: body.taskId ?? body.task_id ?? null,
        source: body.source ?? "feedback",
      });
    }
    return res.status(201).json({ item: saved });
  } catch (err) {
    console.error(`[team/memory] add ${agentId} failed:`, err);
    return res.status(400).json({ error: err.message ?? "Не удалось сохранить запись памяти" });
  }
});

// =========================================================================
// PATCH /api/team/memory/:id
// body: { content?, status?, pinned? } — хотя бы одно поле.
// =========================================================================
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const updated = await updateMemory(id, req.body ?? {});
    return res.json({ item: updated });
  } catch (err) {
    console.error(`[team/memory] update ${id} failed:`, err);
    const status = /не найдена/i.test(err?.message ?? "") ? 404 : 400;
    return res.status(status).json({ error: err.message ?? "Не удалось обновить запись памяти" });
  }
});

// =========================================================================
// DELETE /api/team/memory/:id
// Мягкое удаление: status = 'archived'.
// =========================================================================
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const archived = await archiveMemory(id);
    return res.json({ item: archived });
  } catch (err) {
    console.error(`[team/memory] archive ${id} failed:`, err);
    const status = /не найдена/i.test(err?.message ?? "") ? 404 : 500;
    return res.status(status).json({ error: err.message ?? "Не удалось архивировать запись памяти" });
  }
});

export default router;
