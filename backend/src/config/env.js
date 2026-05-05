import "dotenv/config";

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Не задана переменная окружения ${name}. Проверь backend/.env (см. .env.example).`,
    );
  }
  return value;
}

export const env = {
  port: Number.parseInt(process.env.PORT ?? "3001", 10),
  frontendOrigins: (process.env.FRONTEND_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),

  apifyToken: required("APIFY_API_TOKEN"),
  apifyActorId: process.env.APIFY_ACTOR_ID ?? "apify/instagram-scraper",

  supabaseUrl: required("SUPABASE_URL"),
  supabaseServiceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),

  // OpenAI: используется и для Whisper (транскрипция), и для саммари/категории.
  openaiApiKey: required("OPENAI_API_KEY"),
  whisperModel: process.env.OPENAI_WHISPER_MODEL ?? "whisper-1",
  // gpt-4o-mini — дешёвый и достаточный для коротких саммари и категоризации.
  analysisModel: process.env.OPENAI_ANALYSIS_MODEL ?? "gpt-4o-mini",

  // Сколько видео обрабатывать одновременно. Apify/OpenAI имеют rate-limit и
  // стоят денег — слишком высокое число спалит лимиты на больших батчах.
  // 2 — безопасный дефолт. Можно поднять до 3–4, если Apify-план позволяет.
  workerConcurrency: Number.parseInt(process.env.WORKER_CONCURRENCY ?? "2", 10),

  // Конкурентность пула задач команды (отдельный пул от видео-обработки —
  // см. backend/src/queue/teamWorkerPool.js). По дефолту 1: задачи команды
  // длиннее (write_text может идти 30–60 сек) и дороже видео, параллельный
  // запуск быстро упрётся в rate-limit Anthropic и в плохие сюрпризы по биллингу.
  teamWorkerConcurrency: Number.parseInt(process.env.TEAM_WORKER_CONCURRENCY ?? "1", 10),

  // Supabase Storage — постоянное хранилище превью. Если не задан bucket —
  // превью остаются на Instagram CDN (временные ~24 часа), всё остальное
  // работает. Переменная ОПЦИОНАЛЬНАЯ.
  storageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? null,
};
