import { createSupabaseServerClient } from "@/lib/supabaseClient";
import { safeColor } from "@/lib/tagColors";
import type {
  AiCategory,
  AiStatus,
  ContentType,
  MyCategory,
  ProcessingStatus,
  Rating,
  Tag,
  TranscriptStatus,
  Video,
} from "@/lib/types";

interface VideoRow {
  id: string;
  url: string;
  published_at: string | null;
  author: string | null;
  author_url: string | null;
  caption: string | null;
  thumbnail_url: string | null;
  thumbnail_storage_path: string | null;
  duration: number | null;
  content_type: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  virality_score: number | null;
  ai_summary: string | null;
  transcript: string | null;
  ai_category: string | null;
  ai_category_suggestion: string | null;
  is_reference: boolean | null;
  my_category_id: string | null;
  note: string | null;
  ratings: string[] | null;
  processing_status: string | null;
  processing_error: string | null;
  processed_at: string | null;
  transcript_status: string | null;
  transcript_error: string | null;
  ai_status: string | null;
  ai_error: string | null;
  created_at: string;
  updated_at: string;
  video_tags: { tag_id: string }[] | null;
}

interface MyCategoryRow {
  id: string;
  name: string;
  color: string;
}

interface TagRow {
  id: string;
  name: string;
  color: string;
}

const VALID_RATINGS = new Set<Rating>(["verified", "super", "repeat"]);
function isRating(x: unknown): x is Rating {
  return typeof x === "string" && VALID_RATINGS.has(x as Rating);
}

const VALID_CONTENT_TYPES = new Set<ContentType>(["video", "image", "carousel"]);
function safeContentType(x: string | null): ContentType {
  return x && VALID_CONTENT_TYPES.has(x as ContentType) ? (x as ContentType) : "video";
}

function mapVideo(row: VideoRow): Video {
  return {
    id: row.id,
    url: row.url,
    publishedAt: row.published_at,
    author: row.author,
    authorUrl: row.author_url,
    caption: row.caption,
    thumbnailUrl: row.thumbnail_url,
    thumbnailStoragePath: row.thumbnail_storage_path,
    duration: row.duration,
    contentType: safeContentType(row.content_type),
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    viralityScore: row.virality_score,
    aiSummary: row.ai_summary,
    transcript: row.transcript,
    aiCategory: (row.ai_category as AiCategory | null) ?? null,
    aiCategorySuggestion: row.ai_category_suggestion,
    isReference: row.is_reference,
    myCategoryId: row.my_category_id,
    tagIds: (row.video_tags ?? []).map((t) => t.tag_id),
    note: row.note,
    ratings: ((row.ratings ?? []) as Rating[]).filter(isRating),
    processingStatus: (row.processing_status as ProcessingStatus | null) ?? "pending",
    processingError: row.processing_error,
    processedAt: row.processed_at,
    transcriptStatus: (row.transcript_status as TranscriptStatus | null) ?? "pending",
    transcriptError: row.transcript_error,
    aiStatus: (row.ai_status as AiStatus | null) ?? "pending",
    aiError: row.ai_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchVideos(): Promise<Video[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("videos")
    .select("*, video_tags(tag_id)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Не удалось загрузить видео: ${error.message}`);
  return (data ?? []).map((row) => mapVideo(row as VideoRow));
}

export async function fetchMyCategories(): Promise<MyCategory[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("my_categories")
    .select("id, name, color")
    .order("name", { ascending: true });

  if (error) throw new Error(`Не удалось загрузить категории: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: (r as MyCategoryRow).id,
    name: (r as MyCategoryRow).name,
    color: safeColor((r as MyCategoryRow).color),
  }));
}

export async function fetchTags(): Promise<Tag[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tags")
    .select("id, name, color")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Не удалось загрузить теги: ${error.message}`);
  return (data ?? []).map((r) => ({
    id: (r as TagRow).id,
    name: (r as TagRow).name,
    color: safeColor((r as TagRow).color),
  }));
}
