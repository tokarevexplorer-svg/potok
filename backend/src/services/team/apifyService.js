// Сессия 33 этапа 2 (пункт 17): обёртка над Apify-клиентом для парсинга
// Instagram-аккаунтов конкурентов.
//
// Apify Actor `apify/instagram-scraper` принимает массив `directUrls` или
// `usernames` и возвращает массив постов. Минимально нам нужно:
//   - shortCode, caption, likesCount, commentsCount, timestamp, type, url,
//     videoUrl (если reel/видео).
//
// Авторизация — переменная окружения APIFY_TOKEN (требуется в Railway).
// Если токен не задан — сервис бросает понятную ошибку, чтобы код
// поверх (competitorService) перевёл задачу в error со ссылкой на Админку.

import { ApifyClient } from "apify-client";

const ACTOR_ID = "apify/instagram-scraper";
const DEFAULT_RESULTS_LIMIT = 30;

function getClient() {
  const token = process.env.APIFY_TOKEN;
  if (!token || !token.trim()) {
    throw new Error(
      "Не задан APIFY_TOKEN. Добавь токен в Railway → Variables (или в backend/.env локально). Получить токен: https://console.apify.com/account/integrations",
    );
  }
  return new ApifyClient({ token });
}

// Извлекает username из Instagram URL или принимает голый username.
// Допустимые формы: "https://instagram.com/<user>", "instagram.com/<user>/",
// "@<user>", "<user>".
export function extractInstagramUsername(input) {
  if (typeof input !== "string") {
    throw new Error("Передай ссылку или @username Instagram-аккаунта.");
  }
  const trimmed = input.trim();
  if (!trimmed) throw new Error("Пустой ввод.");
  // Если это URL — попробуем распарсить.
  let candidate = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const url = new URL(trimmed);
      candidate = url.pathname;
    } catch {
      // Падать не будем — попробуем как есть.
    }
  }
  // Срезаем @, начальные/конечные слэши.
  candidate = candidate.replace(/^\/?@?/, "").replace(/\/+$/, "");
  // Возможны пути вроде `instagram.com/<user>/reel/...` — берём первый сегмент.
  const seg = candidate.split("/")[0];
  if (!/^[A-Za-z0-9_.]+$/.test(seg)) {
    throw new Error(`Не получилось извлечь username из «${input}». Дай ссылку формата https://instagram.com/<username>.`);
  }
  return seg;
}

// =========================================================================
// estimateCost — грубая оценка стоимости запуска.
// Apify pricing: Instagram Scraper ~$2.30/1000 results. На N постов
// получится ~$0.0023*N. Возвращаем округлённую оценку.
// =========================================================================
export function estimateCost(resultsLimit = DEFAULT_RESULTS_LIMIT) {
  const limit = Math.min(Math.max(Number(resultsLimit) || DEFAULT_RESULTS_LIMIT, 1), 200);
  const perResultUsd = 0.0023;
  const usd = Math.round(limit * perResultUsd * 1000) / 1000;
  return {
    estimated_posts: limit,
    estimated_usd: usd,
  };
}

// =========================================================================
// parseInstagramAccount — запускает Actor и ждёт завершения.
//
// При обычном объёме (30-50 постов) Actor отрабатывает 30-90 секунд. Мы
// блокирующе ждём результат — это OK для backend-обработчика, который
// уже работает в воркер-пуле.
// =========================================================================
export async function parseInstagramAccount(username, options = {}) {
  const cleanUsername = extractInstagramUsername(username);
  const resultsLimit = Math.min(
    Math.max(Number(options.resultsLimit) || DEFAULT_RESULTS_LIMIT, 1),
    200,
  );
  const client = getClient();

  const input = {
    directUrls: [`https://www.instagram.com/${cleanUsername}/`],
    resultsType: "posts",
    resultsLimit,
    searchType: "user",
    addParentData: false,
  };

  let run;
  try {
    run = await client.actor(ACTOR_ID).call(input, { timeout: 240, memory: 1024 });
  } catch (err) {
    throw new Error(`Apify Actor ${ACTOR_ID} упал: ${err?.message ?? err}`);
  }

  if (!run?.defaultDatasetId) {
    throw new Error("Apify не вернул датасет — что-то странное в run-объекте.");
  }

  const ds = client.dataset(run.defaultDatasetId);
  let items;
  try {
    const { items: pageItems } = await ds.listItems();
    items = pageItems;
  } catch (err) {
    throw new Error(`Не удалось забрать датасет Apify: ${err?.message ?? err}`);
  }

  return {
    username: cleanUsername,
    run_id: run.id,
    actor_id: ACTOR_ID,
    posts: normalizePosts(items),
  };
}

// Нормализуем посты Apify до нашего формата.
function normalizePosts(items) {
  if (!Array.isArray(items)) return [];
  const out = [];
  for (const it of items) {
    if (!it || typeof it !== "object") continue;
    const shortCode = String(it.shortCode ?? it.id ?? "").trim();
    if (!shortCode) continue;
    out.push({
      external_id: shortCode,
      url: String(it.url ?? it.displayUrl ?? "").trim() || null,
      type: normalizeType(it.type),
      caption: typeof it.caption === "string" ? it.caption : null,
      likes_count: Number.isFinite(it.likesCount) ? Number(it.likesCount) : null,
      comments_count: Number.isFinite(it.commentsCount) ? Number(it.commentsCount) : null,
      video_url: typeof it.videoUrl === "string" && it.videoUrl ? it.videoUrl : null,
      posted_at: parseTimestamp(it.timestamp),
    });
  }
  return out;
}

function normalizeType(raw) {
  const v = String(raw ?? "").toLowerCase();
  if (v.includes("video") || v === "reel") return "reel";
  if (v.includes("image")) return "image";
  if (v.includes("sidecar") || v.includes("carousel")) return "sidecar";
  if (!v) return null;
  return v;
}

function parseTimestamp(raw) {
  if (!raw) return null;
  const t = new Date(raw);
  if (Number.isNaN(t.getTime())) return null;
  return t.toISOString();
}

// =========================================================================
// hasToken — пробник для UI (Админка → Apify card).
// =========================================================================
export function hasApifyToken() {
  return Boolean(process.env.APIFY_TOKEN && String(process.env.APIFY_TOKEN).trim());
}
