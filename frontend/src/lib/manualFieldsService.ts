// Браузерные мутации для ручных полей. RLS таблиц открыта на anon, поэтому
// можно ходить напрямую — это даёт мгновенный отклик без серверных action.

import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { safeColor, type EntityColor } from "@/lib/tagColors";
import type { MyCategory, Rating, Tag } from "@/lib/types";

function client() {
  return getSupabaseBrowserClient();
}

// ---------- Категории «Я» ----------

export async function createMyCategory(
  name: string,
  color: EntityColor,
): Promise<MyCategory> {
  const { data, error } = await client()
    .from("my_categories")
    .insert({ name: name.trim(), color })
    .select("id, name, color")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id, name: data.name, color: safeColor(data.color) };
}

export async function renameMyCategory(id: string, name: string): Promise<void> {
  const { error } = await client()
    .from("my_categories")
    .update({ name: name.trim() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setMyCategoryColor(
  id: string,
  color: EntityColor,
): Promise<void> {
  const { error } = await client()
    .from("my_categories")
    .update({ color })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteMyCategory(id: string): Promise<void> {
  const { error } = await client().from("my_categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setVideoMyCategory(
  videoId: string,
  categoryId: string | null,
): Promise<void> {
  const { error } = await client()
    .from("videos")
    .update({ my_category_id: categoryId })
    .eq("id", videoId);
  if (error) throw new Error(error.message);
}

// ---------- Теги ----------

export async function createTag(
  name: string,
  color: EntityColor,
): Promise<Tag> {
  const { data, error } = await client()
    .from("tags")
    .insert({ name: name.trim(), color })
    .select("id, name, color")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id, name: data.name, color: safeColor(data.color) };
}

export async function renameTag(id: string, name: string): Promise<void> {
  const { error } = await client()
    .from("tags")
    .update({ name: name.trim() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function setTagColor(id: string, color: EntityColor): Promise<void> {
  const { error } = await client().from("tags").update({ color }).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTag(id: string): Promise<void> {
  const { error } = await client().from("tags").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function attachTag(videoId: string, tagId: string): Promise<void> {
  const { error } = await client()
    .from("video_tags")
    .insert({ video_id: videoId, tag_id: tagId });
  // Игнорируем коллизию primary key — тег уже привязан, ничего страшного.
  if (error && error.code !== "23505") throw new Error(error.message);
}

export async function detachTag(videoId: string, tagId: string): Promise<void> {
  const { error } = await client()
    .from("video_tags")
    .delete()
    .eq("video_id", videoId)
    .eq("tag_id", tagId);
  if (error) throw new Error(error.message);
}

// ---------- Заметка ----------

export async function setVideoNote(
  videoId: string,
  note: string | null,
): Promise<void> {
  const { error } = await client()
    .from("videos")
    .update({ note })
    .eq("id", videoId);
  if (error) throw new Error(error.message);
}

// ---------- Оценка ----------

export async function setVideoRating(
  videoId: string,
  rating: Rating | null,
): Promise<void> {
  const { error } = await client()
    .from("videos")
    .update({ rating })
    .eq("id", videoId);
  if (error) throw new Error(error.message);
}

// ---------- Перенос в закладки ----------

// Копирует поля из videos в bookmarks и удаляет исходное видео.
// Транзакции из браузера через supabase-js не доступны: делаем select →
// upsert (по url, ignoreDuplicates) → delete. Если url уже есть в bookmarks —
// просто удалим из videos, не плодим дубли.
export async function moveToBookmarks(videoId: string): Promise<void> {
  const sb = client();

  const { data: video, error: selectErr } = await sb
    .from("videos")
    .select(
      "url, published_at, author, author_url, caption, thumbnail_url, views, likes, comments, shares, virality_score, ai_summary, transcript, ai_category, ai_category_suggestion, note",
    )
    .eq("id", videoId)
    .single();
  if (selectErr) throw new Error(selectErr.message);
  if (!video) throw new Error("Видео не найдено");

  const { error: insertErr } = await sb
    .from("bookmarks")
    .upsert(
      {
        url: video.url,
        published_at: video.published_at,
        author: video.author,
        author_url: video.author_url,
        caption: video.caption,
        thumbnail_url: video.thumbnail_url,
        views: video.views,
        likes: video.likes,
        comments: video.comments,
        shares: video.shares,
        virality_score: video.virality_score,
        ai_summary: video.ai_summary,
        transcript: video.transcript,
        ai_category: video.ai_category,
        ai_category_suggestion: video.ai_category_suggestion,
        user_note: video.note,
      },
      { onConflict: "url", ignoreDuplicates: true },
    );
  if (insertErr) throw new Error(insertErr.message);

  const { error: deleteErr } = await sb
    .from("videos")
    .delete()
    .eq("id", videoId);
  if (deleteErr) throw new Error(deleteErr.message);
}
