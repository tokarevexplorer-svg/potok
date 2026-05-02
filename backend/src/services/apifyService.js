import { ApifyClient } from "apify-client";
import { env } from "../config/env.js";

const apify = new ApifyClient({ token: env.apifyToken });

// Запускаем Instagram-скрапер с одной ссылкой на Reels.
// Документация актора: https://apify.com/apify/instagram-scraper
// Ждём завершения синхронно — на одну ссылку актор обычно укладывается в 30–60 секунд.
export async function fetchReelByUrl(url) {
  const input = {
    directUrls: [url],
    resultsType: "posts",
    resultsLimit: 1,
    addParentData: false,
  };

  const run = await apify.actor(env.apifyActorId).call(input, {
    // запас на случай, если скрапер будет долго стартовать
    timeout: 180,
    memory: 1024,
  });

  const { items } = await apify
    .dataset(run.defaultDatasetId)
    .listItems({ limit: 5 });

  if (!items || items.length === 0) {
    throw new Error(
      "Apify вернул пустой результат. Возможно, ссылка приватная или удалена.",
    );
  }

  // Берём первую запись с совпадающим shortcode, если несколько — или просто первую.
  return items[0];
}

// Переводим сырой ответ Apify в поля нашей таблицы videos (snake_case).
// Actor отдаёт разные форматы в зависимости от типа поста, поэтому каждое поле с фолбэками.
export function mapReelToVideoFields(raw) {
  const author = raw.ownerUsername ?? raw.ownerFullName ?? null;
  const authorUrl = author ? `https://www.instagram.com/${author}/` : null;

  const views =
    raw.videoPlayCount ??
    raw.videoViewCount ??
    raw.playsCount ??
    raw.viewsCount ??
    null;

  // Шеры доступны только у некоторых акторов (напр. apify/instagram-reel-scraper).
  // У дефолтного apify/instagram-scraper поля нет — оставим null, формула справится.
  const shares = raw.sharesCount ?? raw.shares ?? raw.reshareCount ?? null;

  const viewsInt = toIntOrNull(views);
  const likesInt = toIntOrNull(raw.likesCount);
  const commentsInt = toIntOrNull(raw.commentsCount);
  const sharesInt = toIntOrNull(shares);

  return {
    author,
    author_url: authorUrl,
    caption: raw.caption ?? null,
    thumbnail_url: raw.displayUrl ?? raw.thumbnailUrl ?? null,
    published_at: raw.timestamp ?? null,

    views: viewsInt,
    likes: likesInt,
    comments: commentsInt,
    shares: sharesInt,
    virality_score: computeVirality({
      views: viewsInt,
      likes: likesInt,
      comments: commentsInt,
      shares: sharesInt,
    }),

    // Хронометраж — только для видео. Apify отдаёт дробное число секунд
    // (например, 31.453) — округляем до целого, чтобы UI показывал "0:31".
    duration: toIntOrNull(raw.videoDuration ?? raw.duration ?? null),
    content_type: extractContentType(raw),
  };
}

// Apify Instagram Scraper отдаёт `type`: "Video" | "Image" | "Sidecar".
// Sidecar — это карусель (несколько фото/видео в одном посте).
// Маппим в наши значения; неизвестное приводим к 'video' (Reels по умолчанию).
function extractContentType(raw) {
  const type = String(raw.type ?? raw.mediaType ?? "").toLowerCase();
  if (type.includes("sidecar") || type.includes("carousel")) return "carousel";
  if (type.includes("image") || type.includes("photo")) return "image";
  if (type.includes("video") || type.includes("reel") || type.includes("clip")) {
    return "video";
  }
  // productType: "clips" — отдельный сигнал у некоторых акторов, что это Reel.
  if (String(raw.productType ?? "").toLowerCase().includes("clip")) return "video";
  return "video";
}

// Прямая ссылка на mp4-файл Reels из ответа Apify.
// В таблицу не пишем (ссылка временная) — нужна только в рамках текущей обработки
// для транскрипции.
export function extractVideoUrl(raw) {
  return raw.videoUrl ?? raw.videoUrlBackup ?? null;
}

function toIntOrNull(value) {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// Engagement Rate с весами: коммент ценнее лайка (порог входа выше),
// шер ценнее коммента (распространяет в чужой контент). Веса:
//   лайк × 1, коммент × 3, шер × 5
// Шеры публично отдаёт только apify/instagram-reel-scraper — если null,
// просто не учитываем, остальная часть формулы работает как раньше.
function computeVirality({ views, likes, comments, shares }) {
  if (!views || views <= 0) return null;
  const engagement =
    (likes ?? 0) * 1 + (comments ?? 0) * 3 + (shares ?? 0) * 5;
  return Number(((engagement / views) * 100).toFixed(2));
}
