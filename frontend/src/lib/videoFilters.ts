// Чистые функции фильтрации/сортировки. UI-состояние держит React,
// сюда передаёт фильтры → получает отсортированный массив видео.

import type { AiCategory, Rating, Video } from "@/lib/types";

export type SortKey = "createdAt" | "publishedAt" | "views" | "likes" | "virality";
export type TranscriptFilter = "any" | "with" | "without";
// «none» — только не оценённые. Иначе — конкретная оценка или «any».
export type RatingFilter = "any" | "none" | Rating;

export interface FilterState {
  search: string;
  aiCategory: AiCategory | "any";
  myCategoryId: string | "any";
  // Пустой массив = «любые». Множественный выбор: видео должно содержать ВСЕ
  // выбранные теги (intersection — Notion-стиль).
  tagIds: string[];
  author: string | "any";
  transcript: TranscriptFilter;
  rating: RatingFilter;
  sortBy: SortKey;
  // true = по возрастанию. По умолчанию false (свежее/больше — выше).
  sortAsc: boolean;
}

export const initialFilterState: FilterState = {
  search: "",
  aiCategory: "any",
  myCategoryId: "any",
  tagIds: [],
  author: "any",
  transcript: "any",
  rating: "any",
  sortBy: "createdAt",
  sortAsc: false,
};

function matchesSearch(v: Video, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const haystack = [v.transcript, v.aiSummary, v.caption, v.note]
    .filter((x): x is string => Boolean(x))
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

function matchesTags(v: Video, wantedIds: string[]): boolean {
  if (wantedIds.length === 0) return true;
  const have = new Set(v.tagIds);
  return wantedIds.every((id) => have.has(id));
}

function matchesTranscript(v: Video, mode: TranscriptFilter): boolean {
  if (mode === "any") return true;
  const has = Boolean(v.transcript) && v.transcriptStatus === "done";
  return mode === "with" ? has : !has;
}

function matchesRating(v: Video, mode: RatingFilter): boolean {
  if (mode === "any") return true;
  if (mode === "none") return v.ratings.length === 0;
  return v.ratings.includes(mode);
}

function compare(a: Video, b: Video, key: SortKey): number {
  switch (key) {
    case "createdAt":
      return a.createdAt.localeCompare(b.createdAt);
    case "publishedAt": {
      const av = a.publishedAt ?? "";
      const bv = b.publishedAt ?? "";
      return av.localeCompare(bv);
    }
    case "views":
      return (a.views ?? -1) - (b.views ?? -1);
    case "likes":
      return (a.likes ?? -1) - (b.likes ?? -1);
    case "virality":
      return (a.viralityScore ?? -1) - (b.viralityScore ?? -1);
  }
}

export function applyFilters(videos: Video[], f: FilterState): Video[] {
  const filtered = videos.filter((v) => {
    if (f.aiCategory !== "any" && v.aiCategory !== f.aiCategory) return false;
    if (f.myCategoryId !== "any" && v.myCategoryId !== f.myCategoryId) return false;
    if (f.author !== "any" && v.author !== f.author) return false;
    if (!matchesTags(v, f.tagIds)) return false;
    if (!matchesTranscript(v, f.transcript)) return false;
    if (!matchesRating(v, f.rating)) return false;
    if (!matchesSearch(v, f.search.trim())) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => compare(a, b, f.sortBy));
  return f.sortAsc ? sorted : sorted.reverse();
}

// Уникальные авторы, отсортированные по алфавиту — для выпадайки фильтра.
export function uniqueAuthors(videos: Video[]): string[] {
  const set = new Set<string>();
  for (const v of videos) if (v.author) set.add(v.author);
  return Array.from(set).sort((a, b) => a.localeCompare(b, "ru"));
}
