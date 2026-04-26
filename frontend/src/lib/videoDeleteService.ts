// Удаление видео из браузера. video_tags каскадятся на стороне БД
// (см. supabase/migrations/0005_manual_fields.sql), отдельно их чистить не надо.

import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

function client() {
  return getSupabaseBrowserClient();
}

export async function deleteVideo(id: string): Promise<void> {
  const { error } = await client().from("videos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Supabase допускает delete с .in() — отправляем одним запросом, не циклом.
export async function deleteVideos(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await client().from("videos").delete().in("id", ids);
  if (error) throw new Error(error.message);
}
