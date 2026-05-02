// Удаление видео из браузера. video_tags каскадятся на стороне БД
// (см. supabase/migrations/0005_manual_fields.sql), отдельно их чистить не надо.
//
// Превью на Google Drive чистим через `/api/thumbnails-delete` (Next API-route,
// проксирует на бэкенд) ДО собственно удаления записи. Если что-то упало —
// логируем и всё равно удаляем видео: файл-сирота на Drive не страшнее, чем
// пропавшая запись из таблицы.

import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

function client() {
  return getSupabaseBrowserClient();
}

async function purgeThumbnails(driveIds: string[]): Promise<void> {
  const ids = driveIds.filter((id): id is string => Boolean(id));
  if (ids.length === 0) return;

  try {
    await fetch("/api/thumbnails-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ driveIds: ids }),
      // Если бэкенд тормозит — не блокируем удаление надолго.
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    // Не пробрасываем — best effort.
    console.warn("[videoDelete] не удалось очистить превью на Drive:", err);
  }
}

export async function deleteVideo(
  id: string,
  driveId: string | null = null,
): Promise<void> {
  if (driveId) await purgeThumbnails([driveId]);
  const { error } = await client().from("videos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Supabase допускает delete с .in() — отправляем одним запросом, не циклом.
// driveIds — массив (может быть с null, отфильтруем внутри purgeThumbnails).
export async function deleteVideos(
  ids: string[],
  driveIds: (string | null)[] = [],
): Promise<void> {
  if (ids.length === 0) return;
  await purgeThumbnails(driveIds.filter((id): id is string => Boolean(id)));
  const { error } = await client().from("videos").delete().in("id", ids);
  if (error) throw new Error(error.message);
}
