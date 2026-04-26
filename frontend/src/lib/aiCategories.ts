import type { AiCategory } from "@/lib/types";

// Человекочитаемые названия категорий. Ключи синхронизированы со списком в
// backend/src/services/aiAnalysisService.js — менять одновременно.
export const aiCategoryLabels: Record<AiCategory, string> = {
  "vibe-coding": "Вайб-кодинг",
  history: "История",
  culture: "Культура",
  spb: "Санкт-Петербург",
  humor: "Юмор",
  lifestyle: "Лайфстайл",
  business: "Бизнес",
  travel: "Путешествия",
  food: "Еда",
  motivation: "Мотивация",
  tech: "Технологии",
  education: "Образование",
  other: "Другое",
};

export function formatAiCategory(
  category: AiCategory | null,
  suggestion: string | null,
): string | null {
  if (!category) return null;
  const base = aiCategoryLabels[category] ?? category;
  // Если AI вернул "other" с подсказкой — показываем подсказку, чтобы не было голого «Другое».
  if (category === "other" && suggestion) {
    return `${base}: ${suggestion}`;
  }
  return base;
}
