import { Router } from "express";
import {
  deleteManyThumbnails,
  isEnabled as isDriveEnabled,
  uploadThumbnail,
} from "../services/googleDriveService.js";
import {
  clearStaleThumbnail,
  getVideosForThumbnailMigration,
  saveThumbnailUploadResult,
} from "../services/supabaseService.js";

const router = Router();

// POST /api/thumbnails/delete  { driveIds: ["...", "..."] }
// Удаляет файлы с Google Drive. Используется фронтом перед удалением видео из
// БД, чтобы не оставлять «сирот» на Drive.
//
// Best effort: если Drive не настроен или вернул ошибку — отвечаем 200 с
// нулевым счётчиком и не ломаем поток удаления видео в браузере.
router.post("/delete", async (req, res) => {
  const { driveIds } = req.body ?? {};

  if (!Array.isArray(driveIds)) {
    return res.status(400).json({ error: "driveIds должен быть массивом строк" });
  }
  if (driveIds.length === 0) {
    return res.json({ deleted: 0 });
  }
  if (driveIds.length > 5000) {
    return res.status(400).json({ error: "максимум 5000 id за раз" });
  }

  // Фильтруем мусор и пустые строки.
  const valid = driveIds.filter((id) => typeof id === "string" && id.length > 0);
  if (valid.length === 0) return res.json({ deleted: 0 });

  if (!isDriveEnabled()) {
    return res.json({ deleted: 0, skipped: valid.length, reason: "drive disabled" });
  }

  const deleted = await deleteManyThumbnails(valid);
  return res.json({ deleted, requested: valid.length });
});

// POST /api/thumbnails/migrate  { limit?: number }
// Проходит по существующим видео, у которых превью ещё на Instagram CDN, и
// перезаливает их на Drive. По умолчанию 50 за вызов — Drive API в free-tier
// это переваривает спокойно. Запускать можно несколько раз подряд, пока в
// ответе `migrated > 0` или `failed > 0` — пока есть что обрабатывать.
//
// Для протухших ссылок (Instagram отдаёт 403/404) thumbnail_url обнуляется,
// чтобы UI показывал placeholder вместо битой картинки. Эти видео в
// следующий вызов уже не попадут (фильтр `not is null`).
router.post("/migrate", async (req, res) => {
  if (!isDriveEnabled()) {
    return res
      .status(503)
      .json({ error: "Google Drive не настроен — миграция невозможна" });
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
      const { url, fileId } = await uploadThumbnail(
        row.thumbnail_url,
        `${filenameBase}-${Date.now()}`,
      );
      await saveThumbnailUploadResult(row.id, { url, driveId: fileId });
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
