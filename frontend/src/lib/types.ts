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
