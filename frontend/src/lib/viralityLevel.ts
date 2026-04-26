// Уровень вирусности — текстовая оценка на основе viralityScore.
// Пороги настраиваемые: правишь LEVELS — обновляется и логика, и подписи.
// Score рассчитывается на бэкенде в computeVirality (engagement rate с весами,
// см. backend/src/services/apifyService.js).

import type { EntityColor } from "@/lib/tagColors";

export type ViralityLevelKey = "viral" | "above" | "average" | "low";

export interface ViralityLevel {
  key: ViralityLevelKey;
  label: string;
  // Минимальный score включительно. Сортировка LEVELS по убыванию minScore —
  // первая совпавшая запись и есть уровень.
  minScore: number;
  color: EntityColor;
}

export const VIRALITY_LEVELS: ViralityLevel[] = [
  { key: "viral", label: "Вирусное 🔥", minScore: 10, color: "red" },
  { key: "above", label: "Выше среднего", minScore: 5, color: "amber" },
  { key: "average", label: "Среднее", minScore: 2, color: "blue" },
  { key: "low", label: "Низкое", minScore: 0, color: "gray" },
];

export function getViralityLevel(score: number | null): ViralityLevel | null {
  if (score === null || score === undefined || !Number.isFinite(score)) return null;
  return VIRALITY_LEVELS.find((l) => score >= l.minScore) ?? null;
}
