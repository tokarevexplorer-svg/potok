// REST-эндпоинты навыков агентов (Сессия 25 этапа 2, пункт 10).
//
//   GET    /api/team/skills/:agentId                  — список карточек (с frontmatter)
//   POST   /api/team/skills/:agentId                  — новый skill-файл
//   PUT    /api/team/skills/:agentId/:slug            — полная замена
//   PATCH  /api/team/skills/:agentId/:slug/archive    — мягкое архивирование (status='archived')
//   PATCH  /api/team/skills/:agentId/:slug/pin        — закрепление (status='pinned')
//   DELETE /api/team/skills/:agentId/:slug            — физическое удаление файла из Storage
//
// Все за requireAuth. Изменение skill-файла дёргает invalidatePromptCache
// (skills попадают в Awareness-блок Role, кешируемый).

import { Router } from "express";
import {
  getSkillsForAgent,
  createSkillFile,
  updateSkillFile,
  archiveSkill,
  deleteSkillFile,
} from "../../services/team/skillService.js";
import { invalidatePromptCache } from "../../services/team/promptBuilder.js";
import { requireAuth } from "../../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

// =========================================================================
// GET /api/team/skills/:agentId
// ?statuses=active,pinned (default) | all
// =========================================================================
router.get("/:agentId", async (req, res) => {
  const { agentId } = req.params;
  const raw = String(req.query.statuses ?? "active,pinned");
  const statuses =
    raw === "all" ? ["active", "pinned", "archived"] : raw.split(",").map((s) => s.trim()).filter(Boolean);
  try {
    const skills = await getSkillsForAgent(agentId, { statuses });
    return res.json({ skills });
  } catch (err) {
    console.error(`[team/skills] list ${agentId} failed:`, err);
    return res
      .status(400)
      .json({ error: err.message ?? "Не удалось получить навыки агента" });
  }
});

// =========================================================================
// POST /api/team/skills/:agentId
// body: { skill_name, when_to_apply, what_to_do, why_it_works?, task_id?, status? }
// =========================================================================
router.post("/:agentId", async (req, res) => {
  const { agentId } = req.params;
  try {
    const skill = await createSkillFile(agentId, req.body ?? {});
    invalidatePromptCache();
    return res.status(201).json({ skill });
  } catch (err) {
    console.error(`[team/skills] create ${agentId} failed:`, err);
    return res
      .status(400)
      .json({ error: err.message ?? "Не удалось создать навык" });
  }
});

// =========================================================================
// PUT /api/team/skills/:agentId/:slug
// body: { skill_name?, when_to_apply?, what_to_do?, why_it_works?, status? }
// =========================================================================
router.put("/:agentId/:slug", async (req, res) => {
  const { agentId, slug } = req.params;
  try {
    const skill = await updateSkillFile(agentId, slug, req.body ?? {});
    invalidatePromptCache();
    return res.json({ skill });
  } catch (err) {
    console.error(`[team/skills] update ${agentId}/${slug} failed:`, err);
    const status = /не найден/i.test(err?.message ?? "") ? 404 : 400;
    return res
      .status(status)
      .json({ error: err.message ?? "Не удалось обновить навык" });
  }
});

// =========================================================================
// PATCH /api/team/skills/:agentId/:slug/archive
// =========================================================================
router.patch("/:agentId/:slug/archive", async (req, res) => {
  const { agentId, slug } = req.params;
  try {
    const skill = await archiveSkill(agentId, slug);
    invalidatePromptCache();
    return res.json({ skill });
  } catch (err) {
    console.error(`[team/skills] archive ${agentId}/${slug} failed:`, err);
    const status = /не найден/i.test(err?.message ?? "") ? 404 : 400;
    return res
      .status(status)
      .json({ error: err.message ?? "Не удалось архивировать навык" });
  }
});

// =========================================================================
// PATCH /api/team/skills/:agentId/:slug/pin
// =========================================================================
router.patch("/:agentId/:slug/pin", async (req, res) => {
  const { agentId, slug } = req.params;
  try {
    const skill = await updateSkillFile(agentId, slug, { status: "pinned" });
    invalidatePromptCache();
    return res.json({ skill });
  } catch (err) {
    console.error(`[team/skills] pin ${agentId}/${slug} failed:`, err);
    const status = /не найден/i.test(err?.message ?? "") ? 404 : 400;
    return res
      .status(status)
      .json({ error: err.message ?? "Не удалось закрепить навык" });
  }
});

// =========================================================================
// DELETE /api/team/skills/:agentId/:slug
// =========================================================================
router.delete("/:agentId/:slug", async (req, res) => {
  const { agentId, slug } = req.params;
  try {
    await deleteSkillFile(agentId, slug);
    invalidatePromptCache();
    return res.json({ ok: true });
  } catch (err) {
    console.error(`[team/skills] delete ${agentId}/${slug} failed:`, err);
    return res
      .status(400)
      .json({ error: err.message ?? "Не удалось удалить навык" });
  }
});

export default router;
