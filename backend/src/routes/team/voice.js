// REST-эндпоинт для голосовой транскрипции в команде.
//
// Используется голосовым вводом в формах TaskRunnerModal и в любых других
// textarea команды (заметки, инструкции, доп.вопросы). UI пишет аудио через
// MediaRecorder API → отправляет multipart → бэкенд прогоняет через Whisper
// и возвращает текст.
//
// Биллинг идёт через costTracker.recordCall — Whisper биллится по минутам
// аудио, costTracker сам поднимет ставку из pricing.json.

import { Router } from "express";
import multer from "multer";
import { transcribeFromBuffer } from "../../services/transcriptionService.js";
import { recordCall } from "../../services/team/costTracker.js";
import { env } from "../../config/env.js";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // лимит Whisper — 25 МБ
    files: 1,
  },
});

// =========================================================================
// POST /api/team/voice/transcribe
// multipart/form-data: audio (обязательно)
// Возвращает { text, durationSeconds, costUsd }
// =========================================================================

router.post("/transcribe", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "audio обязателен (multipart/form-data, поле 'audio')" });
  }
  if (!req.file.size) {
    return res.status(400).json({ error: "Пустой аудиофайл" });
  }

  try {
    const { text, durationSeconds } = await transcribeFromBuffer(
      req.file.buffer,
      req.file.originalname || "audio.webm",
    );

    // Пишем в team_api_calls — даже если text пустой (Whisper не услышал
    // речь), вызов был сделан и его стоимость нужно учесть.
    const audioMinutes = durationSeconds ? durationSeconds / 60 : 0;
    const apiEntry = await recordCall({
      provider: "openai",
      model: env.whisperModel || "whisper-1",
      audioMinutes,
      taskId: null,
      success: true,
    });

    return res.json({
      text,
      durationSeconds,
      costUsd: Number(apiEntry?.cost_usd ?? 0),
    });
  } catch (err) {
    console.error("[team] voice transcribe failed:", err);
    // Журналим неудачный вызов — для статистики падений Whisper.
    try {
      await recordCall({
        provider: "openai",
        model: env.whisperModel || "whisper-1",
        success: false,
        error: err.message ?? String(err),
      });
    } catch {
      // ignore — логирование вторично
    }
    return res.status(500).json({ error: err.message ?? "Не удалось транскрибировать" });
  }
});

router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Файл слишком большой (лимит 25 МБ)" });
    }
    return res.status(400).json({ error: `Ошибка загрузки: ${err.message}` });
  }
  if (err) {
    console.error("[team] voice unhandled:", err);
    return res.status(500).json({ error: err.message ?? "Ошибка обработки" });
  }
  return _next();
});

export default router;
