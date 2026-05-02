// Хелперы для столбца «Хронометраж» и фильтра «Тип контента».
// ContentType приходит из Apify (см. backend/apifyService.js → extractContentType).

import type { ContentType } from "@/lib/types";

export const contentTypeLabels: Record<ContentType, string> = {
  video: "Видео",
  image: "Фото",
  carousel: "Карусель",
};

// Эмодзи для столбца «Хронометраж», когда длительности нет (фото/карусели).
export const contentTypeEmoji: Record<ContentType, string> = {
  video: "🎬",
  image: "📷",
  carousel: "🖼️",
};

// Из секунд → "0:45", "1:23", "12:07". Часы пока не нужны: Reels < 90с, дорожки
// в каруселях — короткие. Если когда-нибудь придёт пост >60 минут — выводим "h:mm:ss".
export function formatDuration(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return null;
  }
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}
