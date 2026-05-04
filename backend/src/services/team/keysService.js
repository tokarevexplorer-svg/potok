// Чтение/запись ключей моделей в team_api_keys.
//
// В ДК Лурье ключи хранились в .env. Для команды храним в БД — Влад
// меняет их через UI Админки без передеплоя. Решение задокументировано
// в STAGE1_ARCHITECTURE_v2.md (раздел 3.3).
//
// На уровне БД ключи лежат в открытом виде — RLS закрыта, читать может
// только service-role. Шифрование добавим, если будет нужно (через
// pgsodium); пока этого достаточно для личного инструмента.

import { getServiceRoleClient } from "./teamSupabase.js";

// Поддерживаемые провайдеры. Если добавим новый — расширить здесь и в
// llmClient.js одновременно.
const SUPPORTED_PROVIDERS = new Set(["anthropic", "openai", "google"]);

// Кеш ключей в памяти процесса. TTL 30 секунд — компромисс между
// «свежестью при смене ключа в Админке» и «не дёргать БД на каждом вызове LLM».
// Для одного процесса бэкенда этого достаточно; на нескольких репликах кеш
// рассогласуется максимум на 30 сек, что приемлемо.
const KEY_CACHE_TTL_MS = 30_000;
const cache = new Map(); // provider → { value, expiresAt }

function ensureProvider(provider) {
  if (!SUPPORTED_PROVIDERS.has(provider)) {
    throw new Error(
      `Неизвестный провайдер: "${provider}". Допустимые: anthropic, openai, google.`,
    );
  }
}

// Возвращает ключ провайдера. Если ключа в БД нет — возвращает null
// (не бросает). Решение «есть ключ или нет» отдаётся caller'у — он сам
// формулирует пользовательское сообщение об ошибке (например, llmClient.js
// бросит «Не задан API-ключ для провайдера X. Добавь его в Админке.»).
export async function getApiKey(provider) {
  ensureProvider(provider);

  const cached = cache.get(provider);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_api_keys")
    .select("key_value")
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    throw new Error(`Не удалось прочитать ключ "${provider}": ${error.message}`);
  }

  const value = data?.key_value ?? null;
  cache.set(provider, { value, expiresAt: Date.now() + KEY_CACHE_TTL_MS });
  return value;
}

// Сохраняет (или обновляет) ключ. Сбрасывает кеш — следующий getApiKey
// прочитает свежее значение из БД.
export async function setApiKey(provider, key) {
  ensureProvider(provider);
  if (typeof key !== "string" || !key.trim()) {
    throw new Error("Ключ не может быть пустым.");
  }

  const client = getServiceRoleClient();
  const { error } = await client.from("team_api_keys").upsert(
    {
      provider,
      key_value: key.trim(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "provider" },
  );

  if (error) {
    throw new Error(`Не удалось сохранить ключ "${provider}": ${error.message}`);
  }
  cache.delete(provider);
}

// Удаляет ключ провайдера. Сбрасывает кеш.
export async function deleteApiKey(provider) {
  ensureProvider(provider);

  const client = getServiceRoleClient();
  const { error } = await client.from("team_api_keys").delete().eq("provider", provider);

  if (error) {
    throw new Error(`Не удалось удалить ключ "${provider}": ${error.message}`);
  }
  cache.delete(provider);
}

// Возвращает статус всех известных провайдеров: подключён ключ или нет.
// Используется в UI Админки для отображения «🟢 anthropic / 🔴 google».
export async function getAllKeysStatus() {
  const client = getServiceRoleClient();
  const { data, error } = await client.from("team_api_keys").select("provider, key_value");

  if (error) {
    throw new Error(`Не удалось прочитать статус ключей: ${error.message}`);
  }

  const status = { anthropic: false, openai: false, google: false };
  for (const row of data ?? []) {
    if (row.provider in status && typeof row.key_value === "string" && row.key_value.length > 0) {
      status[row.provider] = true;
    }
  }
  return status;
}

// Сброс in-memory кеша (для тестов или ручного обновления).
export function clearKeyCache() {
  cache.clear();
}
