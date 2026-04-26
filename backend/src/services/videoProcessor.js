import { analyzeVideo } from "./aiAnalysisService.js";
import {
  extractVideoUrl,
  fetchReelByUrl,
  mapReelToVideoFields,
} from "./apifyService.js";
import {
  getVideoById,
  markAiProcessing,
  markTranscriptProcessing,
  markVideoProcessing,
  saveAiError,
  saveAiSkipped,
  saveAiSuccess,
  saveTranscriptError,
  saveTranscriptNoSpeech,
  saveTranscriptSuccess,
  saveVideoError,
  saveVideoSuccess,
} from "./supabaseService.js";
import { transcribeFromUrl } from "./transcriptionService.js";

// Оркестратор. По id строки:
//   1. Apify → справочные поля + статистика
//   2. Whisper → транскрипция (либо «без речи»)
//   3. OpenAI gpt-4o-mini → саммари + категория
//
// Запускается из роутера fire-and-forget. Каждый шаг изолирован своим статусом
// (processing_status / transcript_status / ai_status), чтобы падение позднего
// шага не обнуляло данные ранних.
export async function processVideoById(id) {
  const video = await getVideoById(id);
  if (!video) {
    console.warn(`[processor] видео ${id} не найдено — пропускаем`);
    return;
  }
  if (video.processing_status === "done") {
    console.log(`[processor] ${id}: пропуск, уже done`);
    return;
  }
  if (video.processing_status === "processing") {
    // Дубли в рамках одного процесса отсекает workerPool по in-memory Set.
    // Если в БД статус processing, а воркер реально не работает — это «застрявшая»
    // строка после рестарта бэкенда (Railway перезапустил контейнер посреди задачи).
    // Запускаем заново.
    console.log(`[processor] ${id}: статус processing считаем застрявшим, перезапускаем`);
  }

  let videoMediaUrl = null;
  let captionForAi = null;
  let transcriptForAi = null;

  // --- Шаг 1: Apify ---
  try {
    await markVideoProcessing(id);
    console.log(`[processor] ${id}: старт Apify для ${video.url}`);

    const raw = await fetchReelByUrl(video.url);
    const fields = mapReelToVideoFields(raw);
    videoMediaUrl = extractVideoUrl(raw);
    captionForAi = fields.caption;

    await saveVideoSuccess(id, fields);
    console.log(
      `[processor] ${id}: Apify готов, автор=${fields.author}, просмотров=${fields.views}`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[processor] ${id}: ошибка Apify — ${message}`);
    await saveVideoError(id, message);
    return; // без Apify дальше идти бессмысленно
  }

  // --- Шаг 2: транскрипция ---
  if (!videoMediaUrl) {
    const message =
      "Apify не вернул прямую ссылку на видео — транскрипцию выполнить нельзя.";
    console.warn(`[processor] ${id}: ${message}`);
    await saveTranscriptError(id, message);
  } else {
    try {
      await markTranscriptProcessing(id);
      console.log(`[processor] ${id}: старт Whisper`);

      const result = await transcribeFromUrl(videoMediaUrl);
      if (result.status === "no_speech") {
        await saveTranscriptNoSpeech(id);
        console.log(`[processor] ${id}: Whisper — речи нет`);
      } else {
        transcriptForAi = result.text;
        await saveTranscriptSuccess(id, result.text);
        console.log(
          `[processor] ${id}: Whisper готов, символов=${result.text.length}`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[processor] ${id}: ошибка Whisper — ${message}`);
      await saveTranscriptError(id, message);
      // не выходим — у AI могут быть данные из caption
    }
  }

  // --- Шаг 3: AI-анализ ---
  // Запускаем даже если транскрипция не получилась — caption обычно есть.
  try {
    await markAiProcessing(id);
    console.log(`[processor] ${id}: старт AI-анализа`);

    const result = await analyzeVideo({
      caption: captionForAi,
      transcript: transcriptForAi,
    });

    if (result.status === "skipped") {
      await saveAiSkipped(id);
      console.log(`[processor] ${id}: AI пропущен (нет ни caption, ни транскрипции)`);
      return;
    }

    await saveAiSuccess(id, {
      summary: result.summary,
      category: result.category,
      categorySuggestion: result.categorySuggestion,
    });
    console.log(
      `[processor] ${id}: AI готов, категория=${result.category}` +
        (result.categorySuggestion ? ` (${result.categorySuggestion})` : ""),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[processor] ${id}: ошибка AI — ${message}`);
    await saveAiError(id, message);
  }
}
