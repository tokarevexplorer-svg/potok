// Эндпоинты раздела «Базы» (Сессия 5 этапа 2).
//
// Read-only API над реестром team_custom_databases:
//   GET /api/team/databases               — список всех баз.
//   GET /api/team/databases/:id           — одна запись реестра.
//   GET /api/team/databases/:id/records   — содержимое таблицы (с пагинацией).
//
// Все эндпоинты под requireAuth — единый паттерн с остальными /api/team/*
// роутами (admin, instructions, tasks, ...): middleware вешается прямо в
// router.use, чтобы регистрация в app.js оставалась однострочной.

import { Router } from "express";
import {
  listDatabases,
  getDatabaseById,
  getDatabaseRecords,
} from "../../services/team/customDatabaseService.js";
import { requireAuth } from "../../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);

// =========================================================================
// GET /api/team/databases
// Возвращает массив записей реестра в порядке создания.
// =========================================================================
router.get("/", async (_req, res) => {
  try {
    const databases = await listDatabases();
    return res.json({ databases });
  } catch (err) {
    console.error("[team/databases] list failed:", err);
    return res.status(500).json({ error: err.message ?? "Не удалось получить список баз" });
  }
});

// =========================================================================
// GET /api/team/databases/:id
// 404 если запись не найдена.
// =========================================================================
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const database = await getDatabaseById(id);
    if (!database) {
      return res.status(404).json({ error: "База не найдена" });
    }
    return res.json({ database });
  } catch (err) {
    console.error(`[team/databases] get ${id} failed:`, err);
    return res.status(500).json({ error: err.message ?? "Не удалось получить базу" });
  }
});

// =========================================================================
// GET /api/team/databases/:id/records?limit=50&offset=0
// Читает table_name из реестра, потом тащит записи из этой таблицы.
// Для placeholder-баз (Конкуренты до этапа 5) возвращает isPlaceholder: true
// без обращения к Postgres.
// =========================================================================
router.get("/:id/records", async (req, res) => {
  const { id } = req.params;
  const limit = parseInt(String(req.query.limit ?? "50"), 10) || 50;
  const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;

  try {
    const database = await getDatabaseById(id);
    if (!database) {
      return res.status(404).json({ error: "База не найдена" });
    }
    const result = await getDatabaseRecords(database.table_name, { limit, offset });
    return res.json({
      database,
      records: result.records,
      total: result.total,
      isPlaceholder: Boolean(result.isPlaceholder),
      limit,
      offset,
    });
  } catch (err) {
    console.error(`[team/databases] records ${id} failed:`, err);
    return res.status(500).json({ error: err.message ?? "Не удалось получить записи" });
  }
});

export default router;
