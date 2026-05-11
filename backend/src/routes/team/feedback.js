// Эндпоинты обратной связи (Сессия 14 этапа 2, пункт 9).
//
//   POST   /api/team/feedback                  — записать эпизод (оценка + комментарий)
//                                                 с автоматической нейтрализацией через LLM.
//   GET    /api/team/feedback/:agentId         — список эпизодов агента.
//   GET    /api/team/feedback/:agentId/count   — счётчик эпизодов (для триггера Curator'а).
//   PATCH  /api/team/feedback/:id/dismiss      — мягкое отклонение (status='dismissed').
//
// Все маршруты — за requireAuth. Эпизоды НЕ попадают в промпт агента
// (см. promptBuilder.loadMemoryRules — он читает только type='rule' из
// team_agent_memory, а эпизоды живут в отдельной team_feedback_episodes
// после миграции 0022).

import { Router } from "express";
import {
  parseAndSave,
  getEpisodes,
  getEpisodeCount,
  dismissEpisode,
} from "../../services/team/feedbackParserService.js";
import { requireAuth } from "../../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

// =========================================================================
// POST /api/team/feedback
// body: { agent_id, task_id?, channel?, score, comment }
// score — целое 0-5; comment — строка (может быть пустой при score=5).
// channel — task_card (default) | telegram | edit_diff.
// =========================================================================
router.post("/", async (req, res) => {
  const body = req.body ?? {};
  const agentId = typeof body.agent_id === "string" ? body.agent_id.trim() : "";
  const taskId =
    typeof body.task_id === "string" && body.task_id.trim() ? body.task_id.trim() : null;
  const channel = typeof body.channel === "string" && body.channel ? body.channel : "task_card";
  const comment = typeof body.comment === "string" ? body.comment : "";

  let score = null;
  if (body.score !== null && body.score !== undefined && body.score !== "") {
    const n = Number(body.score);
    if (!Number.isInteger(n) || n < 0 || n > 5) {
      return res.status(400).json({ error: "score должен быть целым числом 0–5." });
    }
    score = n;
  }

  if (!agentId) {
    return res.status(400).json({ error: "agent_id обязателен." });
  }

  try {
    const episode = await parseAndSave({
      agentId,
      taskId,
      channel,
      score,
      rawInput: comment,
    });
    return res.status(201).json({ episode });
  } catch (err) {
    console.error(`[team/feedback] save ${agentId} failed:`, err);
    return res
      .status(400)
      .json({ error: err.message ?? "Не удалось сохранить обратную связь" });
  }
});

// =========================================================================
// GET /api/team/feedback/:agentId
// ?status=active|all (default active), ?limit=50, ?offset=0.
// =========================================================================
router.get("/:agentId", async (req, res) => {
  const { agentId } = req.params;
  const status = String(req.query.status ?? "active");
  const limit = parseInt(String(req.query.limit ?? "50"), 10) || 50;
  const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
  try {
    const episodes = await getEpisodes(agentId, { status, limit, offset });
    return res.json({ episodes });
  } catch (err) {
    console.error(`[team/feedback] list ${agentId} failed:`, err);
    return res
      .status(500)
      .json({ error: err.message ?? "Не удалось получить эпизоды" });
  }
});

// =========================================================================
// GET /api/team/feedback/:agentId/count?status=active
// =========================================================================
router.get("/:agentId/count", async (req, res) => {
  const { agentId } = req.params;
  const status = String(req.query.status ?? "active");
  try {
    const count = await getEpisodeCount(agentId, { status });
    return res.json({ count });
  } catch (err) {
    console.error(`[team/feedback] count ${agentId} failed:`, err);
    return res
      .status(500)
      .json({ error: err.message ?? "Не удалось посчитать эпизоды" });
  }
});

// =========================================================================
// PATCH /api/team/feedback/:id/dismiss
// Мягкое отклонение эпизода. Используется UI Кандидатов (Сессия 15).
// =========================================================================
router.patch("/:id/dismiss", async (req, res) => {
  const { id } = req.params;
  try {
    const episode = await dismissEpisode(id);
    return res.json({ episode });
  } catch (err) {
    console.error(`[team/feedback] dismiss ${id} failed:`, err);
    const status = /не найден/i.test(err?.message ?? "") ? 404 : 500;
    return res
      .status(status)
      .json({ error: err.message ?? "Не удалось отклонить эпизод" });
  }
});

export default router;
