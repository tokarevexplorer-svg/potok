// Эндпоинты проектов команды (Сессия 16 этапа 2, пункт 14).
//
//   GET    /api/team/projects        — список (?status=active|archived|all)
//   POST   /api/team/projects        — создание ({ name, description? })
//   GET    /api/team/projects/:id    — одна запись
//   PATCH  /api/team/projects/:id    — обновление ({ name?, description?, status? })
//
// Все за requireAuth.

import { Router } from "express";
import {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
} from "../../services/team/projectService.js";
import { requireAuth } from "../../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

// =========================================================================
// GET /api/team/projects?status=active|archived|all
// =========================================================================
router.get("/", async (req, res) => {
  const status = String(req.query.status ?? "active");
  try {
    const projects = await listProjects(status);
    return res.json({ projects });
  } catch (err) {
    console.error("[team/projects] list failed:", err);
    return res
      .status(500)
      .json({ error: err.message ?? "Не удалось получить список проектов" });
  }
});

// =========================================================================
// POST /api/team/projects
// body: { id?, name, description? }
// =========================================================================
router.post("/", async (req, res) => {
  const body = req.body ?? {};
  try {
    const project = await createProject({
      id: typeof body.id === "string" && body.id.trim() ? body.id.trim() : null,
      name: body.name,
      description: body.description,
    });
    return res.status(201).json({ project });
  } catch (err) {
    console.error("[team/projects] create failed:", err);
    return res
      .status(400)
      .json({ error: err.message ?? "Не удалось создать проект" });
  }
});

// =========================================================================
// GET /api/team/projects/:id
// =========================================================================
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const project = await getProjectById(id);
    if (!project) return res.status(404).json({ error: "Проект не найден" });
    return res.json({ project });
  } catch (err) {
    console.error(`[team/projects] get ${id} failed:`, err);
    return res
      .status(500)
      .json({ error: err.message ?? "Не удалось получить проект" });
  }
});

// =========================================================================
// PATCH /api/team/projects/:id
// body: { name?, description?, status? }
// =========================================================================
router.patch("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const project = await updateProject(id, req.body ?? {});
    return res.json({ project });
  } catch (err) {
    console.error(`[team/projects] update ${id} failed:`, err);
    const status = /не найден/i.test(err?.message ?? "") ? 404 : 400;
    return res
      .status(status)
      .json({ error: err.message ?? "Не удалось обновить проект" });
  }
});

export default router;
