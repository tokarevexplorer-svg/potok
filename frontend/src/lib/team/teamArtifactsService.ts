// Чтение файлов и папок team-database из браузера. Записи и удаления —
// через teamBackendClient (требуют service-role на стороне бэкенда).
//
// Bucket team-database приватный, но anon-ключ Supabase авторизован читать
// его через RLS storage.objects (политика `team_*_public_all` создана
// миграцией 0012). Для чтения этого достаточно.
//
// Чтение текстовых файлов (md/json/txt) идёт через storage.download() →
// .text(). Бинарь (PDF в sources/) этим путём корректно скачается, но мы
// не используем его как текст — для просмотра PDF делаем signed URL.

import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const BUCKET = "team-database";
const SIGNED_URL_TTL_SECONDS = 60 * 10; // 10 минут — достаточно для просмотра.

export interface ArtifactEntry {
  // Имя файла или подпапки (относительно prefix запроса).
  name: string;
  // Полный путь в bucket'е (prefix + name). Удобно для всех операций.
  path: string;
  // Если запись — папка, isFolder=true (Supabase помечает их metadata=null +
  // id=null). Файлы — false.
  isFolder: boolean;
  size: number | null;
  updatedAt: string | null;
  contentType: string | null;
}

// Список файлов и подпапок в указанном prefix. Прячет служебный плейсхолдер
// `.keep` (его создаёт бэкенд при создании пустой папки) — пользователю он
// не нужен.
export async function listArtifacts(prefix = ""): Promise<ArtifactEntry[]> {
  const supabase = getSupabaseBrowserClient();
  const normalizedPrefix = prefix.replace(/^\/+/, "").replace(/\/+$/, "");
  const { data, error } = await supabase.storage.from(BUCKET).list(normalizedPrefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) {
    throw new Error(`Не удалось прочитать список ${BUCKET}/${normalizedPrefix}: ${error.message}`);
  }
  const items = (data ?? [])
    .filter((entry) => entry.name && entry.name !== ".keep")
    .map((entry): ArtifactEntry => {
      // У папок Supabase возвращает id = null и metadata = null. Это
      // единственный надёжный способ отличить папку от файла.
      const isFolder = entry.id === null;
      const path = normalizedPrefix
        ? `${normalizedPrefix}/${entry.name}`
        : entry.name;
      const md = (entry.metadata ?? null) as
        | { size?: number; mimetype?: string }
        | null;
      return {
        name: entry.name,
        path,
        isFolder,
        size: md?.size ?? null,
        updatedAt: entry.updated_at ?? null,
        contentType: md?.mimetype ?? null,
      };
    });
  return items;
}

// Читает текстовый файл (md/json/txt). Бросает ошибку, если файл не найден
// или не удалось прочитать.
export async function readArtifactText(path: string): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw new Error(`Не удалось скачать ${path}: ${error.message}`);
  if (!data) throw new Error(`Файл ${path} пуст или не существует`);
  return await data.text();
}

// Подписанная ссылка на скачивание (для PDF и прочей бинарной нагрузки в
// sources/). 10 минут — достаточно для немедленного открытия в новой вкладке.
export async function signedUrlForArtifact(path: string): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    throw new Error(`Не удалось получить ссылку на ${path}: ${error?.message ?? "пустой ответ"}`);
  }
  return data.signedUrl;
}
