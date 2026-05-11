// REST-эндпоинты предложений и дневника (Сессия 22 этапа 2, пункт 15).
//
//   GET    /api/team/proposals                          — список (?agent_id, ?status, ?limit, ?offset)
//   GET    /api/team/proposals/:id                      — одна запись
//   PATCH  /api/team/proposals/:id/accept               — принять (тело: { brief?, task_type?, title?, project_id? })
//   PATCH  /api/team/proposals/:id/reject               — отклонить
//   GET    /api/team/proposals/by-agent/:agentId/diary  — дневник пропусков такта 1
//
// Все за requireAuth.

import { Router } from "express";
import {
  acceptProposal,
  getDiary,
  getProposalById,
  listProposals,
  rejectProposal,
} from "../../services/team/proposalService.js";
import { requireAuth } from "../../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

// =========================================================================
// GET /api/team/proposals
// =========================================================================
router.get("/", async (req, res) => {
  const agentId =
    typeof req.query.agent_id === "string" && req.query.agent_id.trim()
      ? req.query.agent_id.trim()
      : null;
  const status =
    typeof req.query.status === "string" && req.query.status.trim()
      ? req.query.status.trim()
      : null;
  const limit = parseInt(String(req.query.limit ?? "50"), 10) || 50;
  const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
  try {
    const proposals = await listProposals({ agentId, status, limit, offset });
    return res.json({ proposals });
  } catch (err) {
    console.error("[team/proposals] list failed:", err);
    return res
      .status(400)
      .json({ error: err.message ?? "Не удалось получить список предложений" });
  }
});

// =========================================================================
// GET /api/team/proposals/by-agent/:agentId/diary
// (Объявлен ДО /:id, иначе Express матчит «by-agent» как id.)
// =========================================================================
router.get("/by-agent/:agentId/diary", async (req, res) => {
  const { agentId } = req.params;
  const limit = parseInt(String(req.query.limit ?? "100"), 10) || 100;
  const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
  try {
    const entries = await getDiary(agentId, { limit, offset });
    return res.json({ entries });
  } catch (err) {
    console.error(`[team/proposals] diary ${agentId} failed:`, err);
    return res
      .status(400)
      .json({ error: err.message ?? "Не удалось получить дневник" });
  }
});

// =========================================================================
// PATCH /api/team/proposals/:id/accept
// body: { brief?, task_type?, title?, project_id? } — overrides
// =========================================================================
router.patch("/:id/accept", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await acceptProposal(id, req.body ?? {});
    return res.json(result);
  } catch (err) {
    console.error(`[team/proposals] accept ${id} failed:`, err);
    const status = /не найдено/i.test(err?.message ?? "") ? 404 : 400;
    return res
      .status(status)
      .json({ error: err.message ?? "Не удалось принять предложение" });
  }
});

// =========================================================================
// PATCH /api/team/proposals/:id/reject
// =========================================================================
router.patch("/:id/reject", async (req, res) => {
  const { id } = req.params;
  try {
    const proposal = await rejectProposal(id);
    return res.json({ proposal });
  } catch (err) {
    console.error(`[team/proposals] reject ${id} failed:`, err);
    const status = /не найдено/i.test(err?.message ?? "") ? 404 : 400;
    return res
      .status(status)
      .json({ error: err.message ?? "Не удалось отклонить предложение" });
  }
});

// =========================================================================
// GET /api/team/proposals/:id
// =========================================================================
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const proposal = await getProposalById(id);
    if (!proposal) {
      return res.status(404).json({ error: "Предложение не найдено" });
    }
    return res.json({ proposal });
  } catch (err) {
    console.error(`[team/proposals] get ${id} failed:`, err);
    return res
      .status(500)
      .json({ error: err.message ?? "Не удалось получить предложение" });
  }
});

export default router;
