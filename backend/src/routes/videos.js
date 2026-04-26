import { Router } from "express";
import { enqueue, enqueueMany, getQueueStats } from "../queue/workerPool.js";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const router = Router();

// POST /api/videos/process  { videoId: "<uuid>" }
// Кладёт id в очередь и сразу отвечает 202. Сам процесс обработки запустит воркер
// — в зависимости от загрузки пула, может начаться сразу или подождать.
router.post("/process", (req, res) => {
  const { videoId } = req.body ?? {};

  if (typeof videoId !== "string" || !UUID_REGEX.test(videoId)) {
    return res.status(400).json({ error: "videoId должен быть uuid" });
  }

  const added = enqueue(videoId);
  return res.status(202).json({ status: "accepted", videoId, added });
});

// POST /api/videos/process-batch  { videoIds: ["<uuid>", ...] }
// Массовое добавление в очередь. Воркер-пул сам разрулит конкурентность,
// поэтому даже на 1000 id не страшно — параллельно пойдёт workerConcurrency штук.
router.post("/process-batch", (req, res) => {
  const { videoIds } = req.body ?? {};

  if (!Array.isArray(videoIds)) {
    return res.status(400).json({ error: "videoIds должен быть массивом uuid" });
  }
  // Лимит на размер запроса — чтобы один кривой клиент не положил процесс.
  // Фронт сам делит большие пачки на куски при insert в Supabase, но запрос
  // на бэкенд может прийти один и большой.
  if (videoIds.length > 5000) {
    return res.status(400).json({ error: "максимум 5000 id за раз" });
  }

  const valid = [];
  for (const id of videoIds) {
    if (typeof id === "string" && UUID_REGEX.test(id)) valid.push(id);
  }

  const added = enqueueMany(valid);
  return res.status(202).json({
    status: "accepted",
    received: videoIds.length,
    queued: added,
    skipped: videoIds.length - added,
  });
});

// GET /api/videos/queue/status — для отладки. Фронту прогресс не отсюда брать
// (статус отдельного видео — в самой строке videos), но полезно посмотреть,
// сколько сейчас в работе всего.
router.get("/queue/status", (_req, res) => {
  res.json(getQueueStats());
});

export default router;
