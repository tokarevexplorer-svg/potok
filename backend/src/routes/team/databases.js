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
  createDatabase,
  addRecord,
  updateRecord,
  deleteRecord,
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

// =========================================================================
// Сессия 45: создание базы и CRUD записей.
// =========================================================================

// POST /api/team/databases
// Body: { name, description?, columns: [{ name, label?, type, options? }] }
router.post("/", async (req, res) => {
  const body = req.body ?? {};
  try {
    const created = await createDatabase({
      name: body.name,
      description: body.description ?? null,
      columns: body.columns,
    });
    return res.status(201).json({ database: created });
  } catch (err) {
    console.error("[team/databases] create failed:", err);
    return res.status(400).json({ error: err.message ?? "Не удалось создать базу" });
  }
});

// POST /api/team/databases/:id/records
// Body: { data: { <колонка>: <значение>, ... } }
router.post("/:id/records", async (req, res) => {
  const { id } = req.params;
  const body = req.body ?? {};
  try {
    const row = await addRecord(id, body.data ?? body);
    return res.status(201).json({ record: row });
  } catch (err) {
    console.error(`[team/databases] addRecord ${id} failed:`, err);
    return res.status(400).json({ error: err.message ?? "Не удалось добавить запись" });
  }
});

// PATCH /api/team/databases/:id/records/:recordId
router.patch("/:id/records/:recordId", async (req, res) => {
  const { id, recordId } = req.params;
  const body = req.body ?? {};
  try {
    const row = await updateRecord(id, recordId, body.data ?? body);
    return res.json({ record: row });
  } catch (err) {
    console.error(`[team/databases] updateRecord ${id}/${recordId} failed:`, err);
    return res.status(400).json({ error: err.message ?? "Не удалось обновить запись" });
  }
});

// DELETE /api/team/databases/:id/records/:recordId
router.delete("/:id/records/:recordId", async (req, res) => {
  const { id, recordId } = req.params;
  try {
    await deleteRecord(id, recordId);
    return res.json({ deleted: true });
  } catch (err) {
    console.error(`[team/databases] deleteRecord ${id}/${recordId} failed:`, err);
    return res.status(400).json({ error: err.message ?? "Не удалось удалить запись" });
  }
});

export default router;
