// Сервис превью на Supabase Storage. Заменил googleDriveService после того,
// как выяснилось, что Service Account-ы Google не имеют собственной storage
// quota и не могут писать в обычные папки Drive (только в Shared Drive, что
// требует Google Workspace).
//
// Supabase Storage — встроенное в проект хранилище, ключ доступа
// (SUPABASE_SERVICE_ROLE_KEY) уже прокинут. На бесплатном плане 1 ГБ места
// и 2 ГБ исходящего трафика в месяц — для нашего масштаба запас огромный.
//
// Авторизация: service-role клиент Supabase минует RLS, может писать/удалять
// в любой bucket. Bucket нужно создать вручную из Dashboard (см. ENV_GUIDE).

import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

const supabase = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

// Готов ли сервис к работе. Если bucket-имя не задано — заливка превью
// пропускается, в БД остаётся оригинальный URL Instagram CDN. Это
// «выключенный» режим — бэкенд при этом продолжает работать как раньше,
// просто превью протухают через сутки.
let warnedAboutDisabled = false;
export function isEnabled() {
  if (env.storageBucket) return true;
  if (!warnedAboutDisabled) {
    console.warn(
      "[storage] SUPABASE_STORAGE_BUCKET не задан — заливка превью отключена.",
    );
    warnedAboutDisabled = true;
  }
  return false;
}

// Скачивает картинку по imageUrl и заливает в bucket. Возвращает
// {url, path}: url — публичный (CDN-friendly) для встраивания в <img>,
// path — относительный путь в bucket'е, нужен для удаления.
//
// imageUrl — ссылка с Instagram CDN (или любая другая публичная картинка).
// filename — имя файла без пути; добавим .jpg если нет расширения.
export async function uploadThumbnail(imageUrl, filename) {
  if (!isEnabled()) {
    throw new Error("Supabase Storage не настроен (SUPABASE_STORAGE_BUCKET).");
  }

  const safeName = filename.endsWith(".jpg") ? filename : `${filename}.jpg`;

  // Скачиваем без Referer — Instagram отдаёт картинку только в этом случае.
  const response = await fetch(imageUrl, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      accept: "image/avif,image/webp,image/*,*/*;q=0.8",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(
      `Не удалось скачать превью (${response.status} ${response.statusText}).`,
    );
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const buffer = Buffer.from(await response.arrayBuffer());

  // upsert: true — если по каким-то причинам имя файла совпало (timestamp в
  // имени защищает, но retry или гонка возможны), перезаписываем без ошибки.
  const { error: uploadError } = await supabase.storage
    .from(env.storageBucket)
    .upload(safeName, buffer, {
      contentType,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  // Публичный URL — формируется на основе ServiceRoleKey, но сам URL
  // отдаётся CDN'ом Supabase без авторизации (если bucket public).
  const { data: publicData } = supabase.storage
    .from(env.storageBucket)
    .getPublicUrl(safeName);

  return { url: publicData.publicUrl, path: safeName };
}

// Удаление файла. Best effort: ошибки логируются, но не пробрасываются —
// удаление видео из БД не должно блокироваться очисткой Storage.
export async function deleteThumbnail(path) {
  if (!isEnabled()) {
    console.warn("[storage] deleteThumbnail: сервис выключен, пропускаем");
    return false;
  }
  if (!path) return false;

  const { error } = await supabase.storage
    .from(env.storageBucket)
    .remove([path]);

  if (error) {
    console.warn(`[storage] не удалось удалить ${path}: ${error.message}`);
    return false;
  }
  return true;
}

// Массовое удаление — Supabase API принимает массив path'ов одним запросом.
// Если по какому-то path файла нет — Supabase молча пропустит, не ошибка.
export async function deleteManyThumbnails(paths) {
  if (!isEnabled()) return 0;
  const valid = paths.filter((p) => typeof p === "string" && p.length > 0);
  if (valid.length === 0) return 0;

  const { data, error } = await supabase.storage
    .from(env.storageBucket)
    .remove(valid);

  if (error) {
    console.warn(`[storage] массовое удаление: ${error.message}`);
    return 0;
  }
  return data?.length ?? 0;
}
