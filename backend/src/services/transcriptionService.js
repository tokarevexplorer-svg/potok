import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import ffmpegPath from "ffmpeg-static";
import OpenAI from "openai";
import { toFile } from "openai/uploads";
import { env } from "../config/env.js";

const openai = new OpenAI({ apiKey: env.openaiApiKey });

// Whisper принимает файлы до 25 МБ. Видео (mp4) часто этот лимит превышает —
// Reels на ~30 секундах уже могут весить 30–40 МБ. Поэтому перед отправкой
// извлекаем только аудиодорожку в mp3 64 kbps моно: для распознавания речи
// этого с запасом, а размер падает в 20–50 раз (минута речи ≈ 0.5 МБ).
const MAX_BYTES = 25 * 1024 * 1024;

// Скачиваем mp4 во временный файл. Без Referer — Instagram CDN на Referer от
// «не своего» источника отвечает 403 (та же история, что с превью).
async function downloadVideoToFile(url, filePath) {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Не удалось скачать видео из Instagram (HTTP ${response.status}). ` +
        "Скорее всего, ссылка протухла — Instagram CDN отдаёт временные URL.",
    );
  }
  if (!response.body) {
    throw new Error("Instagram CDN вернул пустой ответ.");
  }

  // Пишем потоково на диск, чтобы не держать весь mp4 в памяти.
  await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath));
}

// Извлекаем аудиодорожку через ffmpeg. mp3, 64 kbps, моно, 16 kHz —
// это рекомендованный для Whisper компромисс по качеству/размеру.
function extractAudio(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) {
      reject(new Error("ffmpeg-static не нашёл бинарь ffmpeg."));
      return;
    }

    const args = [
      "-y", // перезаписывать без вопросов
      "-i", inputPath,
      "-vn", // без видео
      "-ac", "1", // моно
      "-ar", "16000", // 16 kHz — нативная частота Whisper
      "-b:a", "64k", // 64 kbps — речь чисто слышно
      "-f", "mp3",
      outputPath,
    ];

    const ff = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    ff.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    ff.on("error", (err) => reject(new Error(`ffmpeg failed to start: ${err.message}`)));
    ff.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        // stderr ffmpeg многословный, обрезаем хвост.
        reject(
          new Error(
            `ffmpeg вышел с кодом ${code}. Последние строки stderr: ${stderr.slice(-500)}`,
          ),
        );
      }
    });
  });
}

// Эвристика «нет речи»: Whisper иногда возвращает пустую строку, иногда «[музыка]»,
// «♪», «Subtitles by...». Считаем, что речи нет, если после очистки осталось <4 символов.
function isLikelyNoSpeech(text) {
  if (!text) return true;
  const cleaned = text
    .replace(/\[.*?\]/g, "")
    .replace(/[♪♫🎵🎶]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length < 4;
}

// Главная функция: качаем mp4, выдёргиваем аудио, шлём в Whisper, чистим временные файлы.
//
// Возвращает один из объектов:
//   { status: "done",      text: "..." }
//   { status: "no_speech", text: null  }
//
// Любая ошибка (сеть, ffmpeg, API) бросается наружу — её ловит videoProcessor.
export async function transcribeFromUrl(videoUrl) {
  const id = randomUUID();
  const videoPath = join(tmpdir(), `potok-${id}.mp4`);
  const audioPath = join(tmpdir(), `potok-${id}.mp3`);

  try {
    await downloadVideoToFile(videoUrl, videoPath);
    await extractAudio(videoPath, audioPath);

    const audioStat = await stat(audioPath);
    if (audioStat.size === 0) {
      throw new Error("ffmpeg выдал пустой аудиофайл — видимо, в видео нет звуковой дорожки.");
    }
    if (audioStat.size > MAX_BYTES) {
      // На практике 64 kbps mp3 в этот лимит влезает с запасом — но мало ли длинный пост.
      throw new Error(
        `Аудио всё равно слишком большое для Whisper (${(audioStat.size / 1024 / 1024).toFixed(1)} МБ).`,
      );
    }

    const buffer = await readFile(audioPath);
    const file = await toFile(buffer, "audio.mp3", { type: "audio/mpeg" });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: env.whisperModel,
      // Подсказка ускоряет работу и улучшает качество для русского.
      // Английская речь всё равно распознаётся — language это hint, не constraint.
      language: "ru",
      response_format: "text",
    });

    const text =
      typeof transcription === "string" ? transcription : transcription?.text ?? "";
    const trimmed = text.trim();

    if (isLikelyNoSpeech(trimmed)) {
      return { status: "no_speech", text: null };
    }
    return { status: "done", text: trimmed };
  } finally {
    // Чистим оба временных файла независимо от исхода.
    await rm(videoPath, { force: true }).catch(() => {});
    await rm(audioPath, { force: true }).catch(() => {});
  }
}

// Транскрибирует аудио из in-memory буфера (например, multipart upload от
// MediaRecorder в браузере). В отличие от transcribeFromUrl, ничего не качает
// — пишет буфер во временный файл, прогоняет через ffmpeg для нормализации
// формата (входной webm/ogg/wav/m4a → mp3 64 kbps моно), отправляет в Whisper.
//
// originalName — имя файла как пришло от клиента (для расширения и логов).
// Если расширение неизвестно или missing — ffmpeg сам определит формат по содержимому.
//
// Возвращает { text, durationSeconds } — для команды нужен ещё хронометраж
// аудио, чтобы costTracker мог посчитать стоимость Whisper по минутам.
//
// Бросает наружу любые ошибки (не возвращает no_speech-объект — для голосовой
// заметки команда хочет получить текст или явную ошибку, а не молчаливое «нет речи»).
export async function transcribeFromBuffer(buffer, originalName = "audio") {
  if (!buffer || !buffer.length) {
    throw new Error("Пустой аудио-буфер");
  }

  const id = randomUUID();
  const ext = guessAudioExt(originalName);
  const inputPath = join(tmpdir(), `potok-voice-${id}${ext}`);
  const audioPath = join(tmpdir(), `potok-voice-${id}.mp3`);

  try {
    await writeFile(inputPath, buffer);
    await extractAudio(inputPath, audioPath);

    const audioStat = await stat(audioPath);
    if (audioStat.size === 0) {
      throw new Error("ffmpeg выдал пустой аудиофайл — в загруженном файле нет звуковой дорожки.");
    }
    if (audioStat.size > MAX_BYTES) {
      throw new Error(
        `Аудио слишком большое для Whisper (${(audioStat.size / 1024 / 1024).toFixed(1)} МБ).`,
      );
    }

    const durationSeconds = await getMediaDurationSeconds(inputPath);

    const audioBuffer = await readFile(audioPath);
    const file = await toFile(audioBuffer, "audio.mp3", { type: "audio/mpeg" });

    const transcription = await openai.audio.transcriptions.create({
      file,
      model: env.whisperModel,
      language: "ru",
      response_format: "text",
    });

    const text =
      typeof transcription === "string" ? transcription : transcription?.text ?? "";
    return {
      text: text.trim(),
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
    };
  } finally {
    await rm(inputPath, { force: true }).catch(() => {});
    await rm(audioPath, { force: true }).catch(() => {});
  }
}

function guessAudioExt(name) {
  const lower = (name || "").toLowerCase();
  for (const ext of [".webm", ".ogg", ".oga", ".mp3", ".m4a", ".aac", ".wav", ".flac", ".mp4"]) {
    if (lower.endsWith(ext)) return ext;
  }
  return ".bin";
}

// Запускает ffprobe-подобный режим ffmpeg для получения длительности.
// ffmpeg-static включает только ffmpeg (без ffprobe), поэтому парсим stderr
// — он печатает «Duration: 00:01:23.45» при чтении входного файла.
function getMediaDurationSeconds(filePath) {
  return new Promise((resolve) => {
    if (!ffmpegPath) {
      resolve(0);
      return;
    }
    const ff = spawn(ffmpegPath, ["-i", filePath], { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    ff.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    ff.on("error", () => resolve(0));
    ff.on("close", () => {
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!match) {
        resolve(0);
        return;
      }
      const h = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      const s = parseFloat(match[3]);
      resolve(h * 3600 + m * 60 + s);
    });
  });
}
