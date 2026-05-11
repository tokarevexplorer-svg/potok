// Клиент Supabase Storage для team-* buckets команды.
//
// Три bucket'а используются для разных типов данных:
//   - team-database: артефакты задач (research/, texts/, ideas/, sources/) и
//     базы content/concept (context.md, concept.md в корне). Заменяет
//     /database/ из ДК Лурье.
//   - team-prompts:  шаблоны промптов (ideas-free.md и т.д.). Заменяет /prompts/.
//   - team-config:   pricing.json, presets.json. Заменяет /config/.
//
// Все три — приватные (доступ только через service-role). На фронте чтение
// идёт через server-компоненты Next.js с серверным supabase-клиентом или
// через бэкенд-эндпоинты — в браузер service-role не светим.
//
// Все методы возвращают строки/булевы/массивы и кидают понятные русские
// ошибки. Текстовые файлы (md, json) читаются как UTF-8 строки.

import { getServiceRoleClient } from "./teamSupabase.js";

// Загружает файл в bucket. content — string (текст) или Buffer (бинарь).
// path — путь внутри bucket'а (без ведущего слэша). Например, "context.md"
// или "research/2026-05-04-spb.md".
//
// Если файл уже есть — перезаписывает (upsert). Возвращает true.
export async function uploadFile(bucket, path, content) {
  if (!bucket) throw new Error("uploadFile: bucket обязателен.");
  if (!path) throw new Error("uploadFile: path обязателен.");

  const client = getServiceRoleClient();

  // Угадываем content-type по расширению — Supabase отдаст его в заголовке
  // при будущей выдаче, но это и не критично для приватных bucket'ов.
  const contentType = guessContentType(path);

  // String → Buffer, чтобы Storage принял правильный размер.
  const body = typeof content === "string" ? Buffer.from(content, "utf-8") : content;

  // cacheControl: '0' — без CDN-кеша. По умолчанию Supabase Storage держит
  // ответ в smart-CDN 1 час, и хотя upsert триггерит инвалидацию, на практике
  // браузер всё равно может ещё какое-то время отдавать старую версию
  // (наблюдалось при перезаписи strategy/mission.md в Сессии 7). Файлы здесь
  // маленькие, экономия от кеша незначительна — отдаём свежее.
  const { error } = await client.storage
    .from(bucket)
    .upload(path, body, { contentType, upsert: true, cacheControl: "0" });

  if (error) {
    throw new Error(
      `Не удалось загрузить файл "${path}" в bucket "${bucket}": ${error.message}`,
    );
  }
  return true;
}

// Скачивает файл и возвращает его содержимое как UTF-8 строку.
// Если файла нет — кидает ошибку с понятным сообщением.
export async function downloadFile(bucket, path) {
  if (!bucket) throw new Error("downloadFile: bucket обязателен.");
  if (!path) throw new Error("downloadFile: path обязателен.");

  const client = getServiceRoleClient();
  const { data, error } = await client.storage.from(bucket).download(path);

  if (error) {
    // Supabase возвращает ошибку «Object not found» когда файла нет —
    // прокидываем как есть, ловить пусть будет caller.
    throw new Error(
      `Не удалось скачать "${path}" из bucket "${bucket}": ${error.message}`,
    );
  }
  if (!data) {
    throw new Error(`Файл "${path}" в bucket "${bucket}" пуст или не существует.`);
  }
  // Blob → text. Storage SDK на Node 20+ возвращает Blob (Web API).
  return await data.text();
}

// Возвращает true если файл существует, false — если нет. Других ошибок
// не бросает (для проверок «загружать или нет»).
export async function fileExists(bucket, path) {
  try {
    await downloadFile(bucket, path);
    return true;
  } catch {
    return false;
  }
}

// Список файлов в bucket по префиксу (папке). prefix может быть пустым —
// тогда листаются файлы корня bucket'а.
//
// Возвращает массив `{name, id, updated_at, created_at, metadata}` —
// то, что отдаёт Supabase Storage list().
export async function listFiles(bucket, prefix = "") {
  if (!bucket) throw new Error("listFiles: bucket обязателен.");

  const client = getServiceRoleClient();
  const { data, error } = await client.storage.from(bucket).list(prefix, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });

  if (error) {
    throw new Error(
      `Не удалось получить список файлов в "${bucket}/${prefix}": ${error.message}`,
    );
  }
  return data ?? [];
}

// Удаляет файл. Best effort: если файла нет — Supabase молча проглотит, не
// ошибка. Возвращает true при успехе, false при ошибке (ошибку логируем).
export async function deleteFile(bucket, path) {
  if (!bucket || !path) return false;
  const client = getServiceRoleClient();
  const { error } = await client.storage.from(bucket).remove([path]);
  if (error) {
    console.warn(
      `[team-storage] не удалось удалить "${path}" в bucket "${bucket}": ${error.message}`,
    );
    return false;
  }
  return true;
}

// =========================================================================
// helpers
// =========================================================================

function guessContentType(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".md") || lower.endsWith(".markdown")) return "text/markdown";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".txt")) return "text/plain";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}
