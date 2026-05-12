// Сессия 33 этапа 2 (пункт 17): API базы конкурентов.

import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  addCompetitor,
  estimateForUrl,
  getCompetitorById,
  hasApifyToken,
  listCompetitors,
  listPosts,
} from "../../services/team/competitorService.js";

const router = Router();
router.use(requireAuth);

// =========================================================================
// GET /api/team/competitors
// Список блогеров-конкурентов с метаданными (processing/last_error).
// =========================================================================
router.get("/", async (_req, res) => {
  try {
    const items = await listCompetitors();
    return res.json({ competitors: items, apify_token_present: hasApifyToken() });
  } catch (err) {
    console.error("[team/competitors] list failed:", err);
    return res.status(500).json({ error: err.message ?? "Не удалось получить список" });
  }
});

// =========================================================================
// POST /api/team/competitors/estimate
// Body: { instagram_url, results_limit? }
// Возвращает оценку стоимости запуска парсинга.
// =========================================================================
router.post("/estimate", async (req, res) => {
  const body = req.body ?? {};
  const url = typeof body.instagram_url === "string" ? body.instagram_url : "";
  const limit = Number(body.results_limit ?? 30);
  if (!url.trim()) {
    return res.status(400).json({ error: "instagram_url обязателен." });
  }
  try {
    const estimate = estimateForUrl(url, limit);
    return res.json({ ...estimate, apify_token_present: hasApifyToken() });
  } catch (err) {
    return res.status(400).json({ error: err.message ?? "Не удалось оценить" });
  }
});

// =========================================================================
// POST /api/team/competitors/add
// Body: { instagram_url, results_limit? }
// Запускает добавление конкурента + фоновый парсинг.
// =========================================================================
router.post("/add", async (req, res) => {
  const body = req.body ?? {};
  const url = typeof body.instagram_url === "string" ? body.instagram_url : "";
  const limit = Number(body.results_limit ?? 30);
  if (!url.trim()) {
    return res.status(400).json({ error: "instagram_url обязателен." });
  }
  if (!hasApifyToken()) {
    return res.status(503).json({
      error:
        "APIFY_TOKEN не задан на сервере. Добавь токен в Railway → Variables, получи на https://console.apify.com/account/integrations.",
    });
  }
  try {
    const competitor = await addCompetitor(url, { resultsLimit: limit });
    return res.status(202).json({ competitor, processing: true });
  } catch (err) {
    console.error("[team/competitors] add failed:", err);
    return res.status(400).json({ error: err.message ?? "Не удалось добавить конкурента" });
  }
});

// =========================================================================
// GET /api/team/competitors/:id
// Запись конкурента по id (uuid).
// =========================================================================
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const competitor = await getCompetitorById(id);
    if (!competitor) return res.status(404).json({ error: "Конкурент не найден." });
    return res.json({ competitor });
  } catch (err) {
    return res.status(500).json({ error: err.message ?? "Ошибка" });
  }
});

// =========================================================================
// GET /api/team/competitors/:id/posts?limit=30&offset=0
// =========================================================================
router.get("/:id/posts", async (req, res) => {
  const { id } = req.params;
  const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 30)));
  const offset = Math.max(0, Number(req.query.offset ?? 0));
  try {
    const result = await listPosts(id, { limit, offset });
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message ?? "Ошибка" });
  }
});

export default router;
