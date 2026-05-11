// Эндпоинты Inbox внимания (Сессия 18 этапа 2, пункт 14).
//
//   GET    /api/team/notifications              — список (?type, ?is_read, ?limit, ?offset)
//   GET    /api/team/notifications/summary      — сводка непрочитанных + by_type
//   PATCH  /api/team/notifications/:id/read     — пометить одну прочитанной
//   PATCH  /api/team/notifications/read-all     — все (?type=... — только этого типа)
//
// Создание нотификаций идёт ИЗ кода (sevices/scripts) через notificationsService.createNotification —
// внешний POST не нужен.

import { Router } from "express";
import {
  getNotifications,
  getUnreadSummary,
  markAsRead,
  markAllAsRead,
} from "../../services/team/notificationsService.js";
import { requireAuth } from "../../middleware/requireAuth.js";

const router = Router();
router.use(requireAuth);

// =========================================================================
// GET /api/team/notifications/summary
// =========================================================================
router.get("/summary", async (_req, res) => {
  try {
    const summary = await getUnreadSummary();
    return res.json(summary);
  } catch (err) {
    console.error("[team/notifications] summary failed:", err);
    return res
      .status(500)
      .json({ error: err.message ?? "Не удалось получить сводку" });
  }
});

// =========================================================================
// GET /api/team/notifications
// ?type=rule_candidate|... ?is_read=true|false ?limit=50 ?offset=0
// =========================================================================
router.get("/", async (req, res) => {
  const type = typeof req.query.type === "string" && req.query.type ? req.query.type : null;
  const isReadRaw = req.query.is_read;
  const isRead =
    isReadRaw === "true" ? true : isReadRaw === "false" ? false : null;
  const limit = parseInt(String(req.query.limit ?? "50"), 10) || 50;
  const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;
  try {
    const items = await getNotifications({ type, isRead, limit, offset });
    return res.json({ notifications: items });
  } catch (err) {
    console.error("[team/notifications] list failed:", err);
    return res
      .status(400)
      .json({ error: err.message ?? "Не удалось получить нотификации" });
  }
});

// =========================================================================
// PATCH /api/team/notifications/read-all
// body: { type?: 'rule_candidate' | ... }
// (Объявлен ДО /:id/read, иначе Express матчит «read-all» как id.)
// =========================================================================
router.patch("/read-all", async (req, res) => {
  const type =
    typeof req.body?.type === "string" && req.body.type ? req.body.type : null;
  try {
    const updated = await markAllAsRead({ type });
    return res.json({ updated });
  } catch (err) {
    console.error("[team/notifications] read-all failed:", err);
    return res
      .status(400)
      .json({ error: err.message ?? "Не удалось пометить прочитанными" });
  }
});

// =========================================================================
// PATCH /api/team/notifications/:id/read
// =========================================================================
router.patch("/:id/read", async (req, res) => {
  const { id } = req.params;
  try {
    const note = await markAsRead(id);
    return res.json({ notification: note });
  } catch (err) {
    console.error(`[team/notifications] read ${id} failed:`, err);
    const status = /не найдена/i.test(err?.message ?? "") ? 404 : 500;
    return res
      .status(status)
      .json({ error: err.message ?? "Не удалось обновить нотификацию" });
  }
});

export default router;
