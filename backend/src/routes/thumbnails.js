import { Router } from "express";
import {
  deleteManyThumbnails,
  isEnabled as isStorageEnabled,
  uploadThumbnail,
} from "../services/supabaseStorageService.js";
import {
  clearStaleThumbnail,
  getVideosForThumbnailMigration,
  saveThumbnailUploadResult,
} from "../services/supabaseService.js";

const router = Router();

// POST /api/thumbnails/delete  { storagePaths: ["...", "..."] }
// Удаляет файлы из Supabase Storage. Используется фронтом перед удалением
// видео из БД, чтобы не оставлять «сирот» в bucket'е.
//
// Best effort: если Storage не настроен или вернул ошибку — отвечаем 200 с
// нулевым счётчиком и не ломаем поток удаления видео в браузере.
//
// Также принимает legacy-имя поля `driveIds` — если фронт ещё не обновился
// до нового деплоя на Vercel. Можно убрать через несколько недель.
router.post("/delete", async (req, res) => {
  const body = req.body ?? {};
  const raw = body.storagePaths ?? body.driveIds;

  if (!Array.isArray(raw)) {
    return res
      .status(400)
      .json({ error: "storagePaths должен быть массивом строк" });
  }
  if (raw.length === 0) {
    return res.json({ deleted: 0 });
  }
  if (raw.length > 5000) {
    return res.status(400).json({ error: "максимум 5000 path за раз" });
  }

  // Фильтруем мусор и пустые строки.
  const valid = raw.filter((p) => typeof p === "string" && p.length > 0);
  if (valid.length === 0) return res.json({ deleted: 0 });

  if (!isStorageEnabled()) {
    return res.json({
      deleted: 0,
      skipped: valid.length,
      reason: "storage disabled",
    });
  }

  const deleted = await deleteManyThumbnails(valid);
  return res.json({ deleted, requested: valid.length });
});

// POST /api/thumbnails/migrate  { limit?: number }
// Проходит по существующим видео, у которых превью ещё на Instagram CDN, и
// перезаливает их на Supabase Storage. По умолчанию 50 за вызов. Запускать
// можно несколько раз подряд, пока в ответе `migrated > 0` или `failed > 0`
// — пока есть что обрабатывать.
//
// Для протухших ссылок (Instagram отдаёт 403/404) thumbnail_url обнуляется,
// чтобы UI показывал placeholder вместо битой картинки. Эти видео в
// следующий вызов уже не попадут (фильтр `not is null`).
router.post("/migrate", async (req, res) => {
  if (!isStorageEnabled()) {
    return res
      .status(503)
      .json({ error: "Supabase Storage не настроен — миграция невозможна" });
  }

  const limit = Math.min(
    Math.max(Number.parseInt(req.body?.limit ?? "50", 10) || 50, 1),
    200,
  );

  let pending;
  try {
    pending = await getVideosForThumbnailMigration(limit);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  let migrated = 0;
  let staled = 0;
  let failed = 0;
  const errors = [];

  for (const row of pending) {
    try {
      const filenameBase = extractShortcode(row.url) ?? row.id;
      const { url, path } = await uploadThumbnail(
        row.thumbnail_url,
        `${filenameBase}-${Date.now()}`,
      );
      await saveThumbnailUploadResult(row.id, { url, storagePath: path });
      migrated += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // 403/404 — ссылка протухла. Обнуляем, чтобы не ловить её снова.
      if (/403|404/.test(message)) {
        await clearStaleThumbnail(row.id);
        staled += 1;
      } else {
        failed += 1;
        errors.push({ id: row.id, message: message.slice(0, 200) });
      }
    }
  }

  return res.json({
    requested: pending.length,
    migrated,
    staled,
    failed,
    remainingHint:
      pending.length === limit
        ? "Похоже, осталось ещё — вызови ещё раз."
        : "Если осталось 0 — миграция завершена.",
    errors: errors.slice(0, 10),
  });
});

function extractShortcode(url) {
  const match = url.match(/instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i);
  return match ? match[1] : null;
}

export default router;
