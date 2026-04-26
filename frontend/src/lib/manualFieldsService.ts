// Браузерные мутации для ручных полей. RLS таблиц открыта на anon, поэтому
// можно ходить напрямую — это даёт мгновенный отклик без серверных action.

import { getSupabaseBrowserClient } from "@/lib/supabaseClient";
import { safeColor, type EntityColor } from "@/lib/tagColors";
import type { MyCategory, Tag } from "@/lib/types";

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
