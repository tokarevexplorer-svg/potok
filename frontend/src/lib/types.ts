import type { EntityColor } from "@/lib/tagColors";

export type ProcessingStatus = "pending" | "processing" | "done" | "error";

export type TranscriptStatus =
  | "pending"
  | "processing"
  | "done"
  | "no_speech"
  | "error";

export type AiStatus =
  | "pending"
  | "processing"
  | "done"
  | "skipped"
  | "error";

// Оценка пользователя — три уровня + null (не оценено).
//   verified — видео просмотрено и подтверждено как полезное (✅)
//   super    — выдающееся, вернуться первым (🔥)
//   repeat   — снять такое же видео слово в слово (🔄)
export type Rating = "verified" | "super" | "repeat";

export type AiCategory =
  | "vibe-coding"
  | "history"
  | "culture"
  | "spb"
  | "humor"
  | "lifestyle"
  | "business"
  | "travel"
  | "food"
  | "motivation"
  | "tech"
  | "education"
  | "other";

// Категория «Я» и тег — пользовательские сущности (как в Notion).
// Хранятся в отдельных таблицах, имеют цвет.
export interface MyCategory {
  id: string;
  name: string;
  color: EntityColor;
}

export interface Tag {
  id: string;
  name: string;
  color: EntityColor;
}

export interface Video {
  id: string;
  url: string;
  publishedAt: string | null;
  author: string | null;
  authorUrl: string | null;
  caption: string | null;
  thumbnailUrl: string | null;

  views: number | null;
  likes: number | null;
  comments: number | null;
  viralityScore: number | null;

  aiSummary: string | null;
  transcript: string | null;
  aiCategory: AiCategory | null;
  aiCategorySuggestion: string | null;

  // Ручные поля
  myCategoryId: string | null;
  tagIds: string[];
  note: string | null;
  // Можно проставить несколько одновременно: например, видео и
  // «верифицировано», и «супер». Пустой массив = не оценено.
  ratings: Rating[];

  processingStatus: ProcessingStatus;
  processingError: string | null;
  processedAt: string | null;

  transcriptStatus: TranscriptStatus;
  transcriptError: string | null;

  aiStatus: AiStatus;
  aiError: string | null;

  createdAt: string;
  updatedAt: string;
}
