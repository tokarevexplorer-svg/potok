import { Router } from "express";
import { reclassifyIsReference } from "../services/aiAnalysisService.js";
import {
  getVideosForReferenceReprocessing,
  setVideoIsReference,
} from "../services/supabaseService.js";

const router = Router();

// POST /api/reprocess-references  { limit?: number, before?: ISO-строка }
// Одноразовая операция (Сессия 21): пересчитать is_reference для уже
// обработанных видео по обновлённому промпту. Не трогает саммари и категорию.
//
// Keyset pagination по created_at desc:
//   1. Первый вызов — без `before`, обработает limit самых свежих видео.
//   2. В ответе придёт `nextCursor` (created_at последнего обработанного).
//   3. Следующий вызов — передаёшь `before: nextCursor`, обрабатывает следующую пачку.
//   4. Когда `nextCursor` === null или вернулось 0 — всё, прошли весь список.
//
// Запускать из DevTools браузера:
//   fetch('https://<host>/api/reprocess-references', { method: 'POST',
//     headers: {'Content-Type':'application/json'},
//     body: JSON.stringify({limit:50}) }).then(r=>r.json()).then(console.log)
//
// Между видео — пауза 200мс, чтобы не упереться в OpenAI rate-limit.
router.post("/api/reprocess-references", async (req, res) => {
  const body = req.body ?? {};

  const limit = Math.min(
    Math.max(Number.parseInt(body.limit ?? "50", 10) || 50, 1),
    200,
  );

  const before = typeof body.before === "string" && body.before ? body.before : null;

  let pending;
  try {
    pending = await getVideosForReferenceReprocessing({ limit, before });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }

  if (pending.length === 0) {
    return res.json({
      requested: 0,
      processed: 0,
      changed: 0,
      unchanged: 0,
      skipped: 0,
      failed: 0,
      nextCursor: null,
      remainingHint: "Обработка завершена — больше видео нет.",
      changes: [],
      errors: [],
    });
  }

  let processed = 0;
  let changed = 0;
  let unchanged = 0;
  let skipped = 0;
  let failed = 0;
  const changes = [];
  const errors = [];

  for (const row of pending) {
    try {
      const result = await reclassifyIsReference({
        caption: row.caption,
        transcript: row.transcript,
        summary: row.ai_summary,
      });

      if (result.status === "skipped" || result.isReference === null) {
        skipped += 1;
      } else if (result.isReference === row.is_reference) {
        unchanged += 1;
      } else {
        await setVideoIsReference(row.id, result.isReference);
        changed += 1;
        changes.push({
          id: row.id,
          from: row.is_reference,
          to: result.isReference,
        });
      }
      processed += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[reprocess-references] ${row.id}: ${message}`);
      failed += 1;
      errors.push({ id: row.id, message: message.slice(0, 200) });
    }

    // Лёгкая пауза — OpenAI rate-limit на gpt-4o-mini щедрый, но 5 RPS не повредит.
    await sleep(200);
  }

  // Курсор для следующего вызова — created_at самой старой строки в текущей пачке.
  // pending уже отсортирован desc, так что это последний элемент.
  const nextCursor =
    pending.length === limit ? pending[pending.length - 1].created_at : null;

  return res.json({
    requested: pending.length,
    processed,
    changed,
    unchanged,
    skipped,
    failed,
    nextCursor,
    remainingHint: nextCursor
      ? "Есть ещё. Передай это значение в `before` следующего вызова."
      : "Похоже, прошли весь список — `nextCursor` пустой.",
    // Возвращаем только первые 50 изменений и 10 ошибок, чтобы ответ не разрастался.
    changes: changes.slice(0, 50),
    errors: errors.slice(0, 10),
  });
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default router;
