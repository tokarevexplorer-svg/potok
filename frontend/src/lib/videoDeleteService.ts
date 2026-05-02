// Удаление видео из браузера. video_tags каскадятся на стороне БД
// (см. supabase/migrations/0005_manual_fields.sql), отдельно их чистить не надо.
//
// Превью в Supabase Storage чистим через `/api/thumbnails-delete` (Next API-route,
// проксирует на бэкенд) ДО собственно удаления записи. Если что-то упало —
// логируем и всё равно удаляем видео: файл-сирота в bucket'е не страшнее, чем
// пропавшая запись из таблицы.

import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

function client() {
  return getSupabaseBrowserClient();
}

async function purgeThumbnails(storagePaths: string[]): Promise<void> {
  const paths = storagePaths.filter((p): p is string => Boolean(p));
  if (paths.length === 0) return;

  try {
    await fetch("/api/thumbnails-delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storagePaths: paths }),
      // Если бэкенд тормозит — не блокируем удаление надолго.
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    // Не пробрасываем — best effort.
    console.warn("[videoDelete] не удалось очистить превью в Storage:", err);
  }
}

export async function deleteVideo(
  id: string,
  storagePath: string | null = null,
): Promise<void> {
  if (storagePath) await purgeThumbnails([storagePath]);
  const { error } = await client().from("videos").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Supabase допускает delete с .in() — отправляем одним запросом, не циклом.
// storagePaths — массив (может быть с null, отфильтруем внутри purgeThumbnails).
export async function deleteVideos(
  ids: string[],
  storagePaths: (string | null)[] = [],
): Promise<void> {
  if (ids.length === 0) return;
  await purgeThumbnails(storagePaths.filter((p): p is string => Boolean(p)));
  const { error } = await client().from("videos").delete().in("id", ids);
  if (error) throw new Error(error.message);
}
