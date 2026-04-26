// Конфиг оценок видео — единый источник правды для эмодзи и подписей.
// Меняешь подпись или эмодзи здесь — обновляется и в таблице, и в фильтре.

import type { Rating } from "@/lib/types";

export interface RatingMeta {
  emoji: string;
  label: string;
}

export const RATINGS: Record<Rating, RatingMeta> = {
  verified: { emoji: "✅", label: "Верифицировано" },
  super: { emoji: "🔥", label: "Супер" },
  repeat: { emoji: "🔄", label: "Повторить" },
};

// Порядок отображения в поповере и фильтре — тот же, что в CLAUDE.md.
export const RATING_ORDER: Rating[] = ["verified", "super", "repeat"];
