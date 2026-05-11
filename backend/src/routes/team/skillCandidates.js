// Эндпоинты экрана «Кандидаты в навыки» (Сессия 27 этапа 2, пункт 10).
//
//   GET    /api/team/skill-candidates                    — список (?status=pending|all, ?agent_id)
//   PATCH  /api/team/skill-candidates/:id/approve        — принять с опц. правками
//                                                          body: { skill_name?, when_to_apply?, what_to_do?, why_it_works? }
//                                                          Создаёт реальный skill-файл через skillService.
//   PATCH  /api/team/skill-candidates/:id/reject         — отклонить
//                                                          body: { vlad_comment? }
//
// Все за requireAuth.

import { Router } from "express";
import { getServiceRoleClient } from "../../services/team/teamSupabase.js";
import { createSkillFile } from "../../services/team/skillService.js";
import { invalidatePromptCache } from "../../services/team/promptBuilder.js";
import { requireAuth } from "../../middleware/requireAuth.js";

const TABLE = "team_skill_candidates";

const router = Router();
router.use(requireAuth);

// =========================================================================
// GET /api/team/skill-candidates
// ?status=pending (default) | approved | rejected | all
// ?agent_id=<id> — фильтр по агенту
// =========================================================================
router.get("/", async (req, res) => {
  const status =
    typeof req.query.status === "string" && req.query.status.trim()
      ? req.query.status.trim()
      : "pending";
  const agentId =
    typeof req.query.agent_id === "string" && req.query.agent_id.trim()
      ? req.query.agent_id.trim()
      : null;
  const limit = Math.max(1, Math.min(parseInt(String(req.query.limit ?? "100"), 10) || 100, 500));

  try {
    const client = getServiceRoleClient();
    let query = client
      .from(TABLE)
      .select(
        "*, agent:team_agents!inner(id, display_name, role_title, avatar_url, department, status)",
      )
      .order("created_at", { ascending: false })
      .limit(limit);
    if (status !== "all") {
      query = query.eq("status", status);
    }
    if (agentId) {
      query = query.eq("agent_id", agentId);
    }
    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }
    return res.json({ candidates: data ?? [] });
  } catch (err) {
    console.error("[team/skill-candidates] list failed:", err);
    return res
      .status(500)
      .json({ error: err.message ?? "Не удалось получить кандидатов в навыки" });
  }
});

// =========================================================================
// PATCH /api/team/skill-candidates/:id/approve
// body: { skill_name?, when_to_apply?, what_to_do?, why_it_works? }
// =========================================================================
router.patch("/:id/approve", async (req, res) => {
  const { id } = req.params;
  const overrides = req.body ?? {};
  const client = getServiceRoleClient();

  try {
    const { data: candidate, error: getErr } = await client
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (getErr) throw new Error(getErr.message);
    if (!candidate) {
      return res.status(404).json({ error: "Кандидат не найден" });
    }
    if (candidate.status !== "pending") {
      return res
        .status(400)
        .json({ error: `Нельзя одобрить кандидата в статусе «${candidate.status}».` });
    }

    // Создаём skill-файл в Storage. createSkillFile перезапишет, если slug
    // совпадёт; имя нового файла — slug из skill_name. UI должен дать
    // Владу понятную обратную связь при коллизии (Сессия 27 показывает
    // только новые pending — повторного применения через UI быть не должно).
    const skill = await createSkillFile(candidate.agent_id, {
      skill_name:
        (overrides.skill_name ?? candidate.skill_name)?.toString().trim() ||
        candidate.skill_name,
      when_to_apply:
        (overrides.when_to_apply ?? candidate.when_to_apply)?.toString().trim() ||
        candidate.when_to_apply,
      what_to_do:
        (overrides.what_to_do ?? candidate.what_to_do)?.toString().trim() ||
        candidate.what_to_do,
      why_it_works:
        (overrides.why_it_works ?? candidate.why_it_works)?.toString().trim() ||
        candidate.why_it_works,
      task_id: candidate.task_id,
      status: "active",
    });

    const { data: updated, error: updErr } = await client
      .from(TABLE)
      .update({
        status: "approved",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .maybeSingle();
    if (updErr) throw new Error(updErr.message);

    invalidatePromptCache();
    return res.json({ candidate: updated, skill });
  } catch (err) {
    console.error(`[team/skill-candidates] approve ${id} failed:`, err);
    return res
      .status(500)
      .json({ error: err.message ?? "Не удалось одобрить кандидата" });
  }
});

// =========================================================================
// PATCH /api/team/skill-candidates/:id/reject
// body: { vlad_comment? }
// =========================================================================
router.patch("/:id/reject", async (req, res) => {
  const { id } = req.params;
  const vladComment =
    typeof req.body?.vlad_comment === "string" ? req.body.vlad_comment.trim() : null;
  try {
    const client = getServiceRoleClient();
    const { data, error } = await client
      .from(TABLE)
      .update({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        vlad_comment: vladComment,
      })
      .eq("id", id)
      .eq("status", "pending")
      .select()
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      return res
        .status(404)
        .json({ error: "Кандидат не найден или уже отрецензирован." });
    }
    return res.json({ candidate: data });
  } catch (err) {
    console.error(`[team/skill-candidates] reject ${id} failed:`, err);
    return res
      .status(500)
      .json({ error: err.message ?? "Не удалось отклонить кандидата" });
  }
});

export default router;
