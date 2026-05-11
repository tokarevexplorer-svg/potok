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
