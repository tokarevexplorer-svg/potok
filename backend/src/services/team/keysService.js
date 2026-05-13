// Чтение/запись ключей моделей в team_api_keys.
//
// В ДК Лурье ключи хранились в .env. Для команды храним в БД — Влад
// меняет их через UI Админки без передеплоя. Решение задокументировано
// в STAGE1_ARCHITECTURE_v2.md (раздел 3.3).
//
// На уровне БД ключи лежат в открытом виде — RLS закрыта, читать может
// только service-role. Шифрование добавим, если будет нужно (через
// pgsodium); пока этого достаточно для личного инструмента.
//
// Сессия 48: схема team_api_keys расширена под произвольных провайдеров
// (DeepSeek, Groq, и т.п.) через base_url + is_openai_compatible. Старые
// SUPPORTED_PROVIDERS-валидации сняты — теперь любой непустой slug допустим.

import { getServiceRoleClient } from "./teamSupabase.js";
import { PROVIDER_PRESETS } from "../../config/providerPresets.js";

// Нативно обрабатываемые провайдеры (специальные адаптеры в llmClient).
// Всё остальное — через универсальный sendOpenAICompatibleRequest.
const NATIVE_PROVIDERS = new Set(["anthropic", "openai", "google"]);

// Допустимое имя провайдера: латиница, цифры, дефисы, подчёркивания.
const PROVIDER_RE = /^[a-z][a-z0-9_-]{0,40}$/;

// Кеш ключей в памяти процесса. TTL 30 секунд — компромисс между
// «свежестью при смене ключа в Админке» и «не дёргать БД на каждом вызове LLM».
// Для одного процесса бэкенда этого достаточно; на нескольких репликах кеш
// рассогласуется максимум на 30 сек, что приемлемо.
const KEY_CACHE_TTL_MS = 30_000;
const cache = new Map(); // provider → { value, expiresAt }

function ensureProvider(provider) {
  if (typeof provider !== "string" || !PROVIDER_RE.test(provider)) {
    throw new Error(
      `Неверный slug провайдера: "${provider}". Допустимы латиница нижнего регистра, цифры, дефисы и подчёркивания (1–40).`,
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
//
// Сессия 48: принимает либо строку (legacy: только ключ), либо объект
// с расширенными полями. Если передан только ключ и provider есть в
// PROVIDER_PRESETS — дозаполняем base_url/display_name/is_openai_compatible
// из пресета. Если объект — caller сам отвечает за валидность полей.
export async function setApiKey(provider, keyOrFields) {
  ensureProvider(provider);

  let row;
  if (typeof keyOrFields === "string") {
    const key = keyOrFields.trim();
    if (!key) throw new Error("Ключ не может быть пустым.");
    const preset = PROVIDER_PRESETS[provider];
    row = {
      provider,
      key_value: key,
      updated_at: new Date().toISOString(),
    };
    if (preset) {
      row.display_name = preset.display_name;
      row.base_url = preset.base_url ?? null;
      row.is_openai_compatible = preset.is_openai_compatible ?? false;
      row.models = preset.models ?? [];
    }
  } else if (keyOrFields && typeof keyOrFields === "object") {
    const key = String(keyOrFields.key_value ?? keyOrFields.key ?? "").trim();
    if (!key) throw new Error("Ключ не может быть пустым.");
    row = {
      provider,
      key_value: key,
      display_name:
        typeof keyOrFields.display_name === "string" && keyOrFields.display_name.trim()
          ? keyOrFields.display_name.trim()
          : PROVIDER_PRESETS[provider]?.display_name ?? provider,
      base_url:
        typeof keyOrFields.base_url === "string" && keyOrFields.base_url.trim()
          ? keyOrFields.base_url.trim()
          : PROVIDER_PRESETS[provider]?.base_url ?? null,
      is_openai_compatible:
        typeof keyOrFields.is_openai_compatible === "boolean"
          ? keyOrFields.is_openai_compatible
          : PROVIDER_PRESETS[provider]?.is_openai_compatible ?? !NATIVE_PROVIDERS.has(provider),
      models: Array.isArray(keyOrFields.models)
        ? keyOrFields.models.map((m) => String(m))
        : PROVIDER_PRESETS[provider]?.models ?? [],
      updated_at: new Date().toISOString(),
    };
  } else {
    throw new Error("setApiKey: передай строку-ключ или объект { key_value, ...поля }.");
  }

  const client = getServiceRoleClient();
  const { error } = await client.from("team_api_keys").upsert(row, { onConflict: "provider" });

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
//
// Сессия 48: возвращаем статус для всех зарегистрированных провайдеров
// (включая custom), а не только трёх нативных. Для обратной совместимости
// гарантируем, что anthropic/openai/google всегда в ответе (даже если нет
// в БД, ставим false).
export async function getAllKeysStatus() {
  const client = getServiceRoleClient();
  const { data, error } = await client.from("team_api_keys").select("provider, key_value");

  if (error) {
    throw new Error(`Не удалось прочитать статус ключей: ${error.message}`);
  }

  const status = { anthropic: false, openai: false, google: false };
  for (const row of data ?? []) {
    if (typeof row.provider === "string" && row.provider) {
      status[row.provider] =
        typeof row.key_value === "string" && row.key_value.length > 0;
    }
  }
  return status;
}

// Сброс in-memory кеша (для тестов или ручного обновления).
export function clearKeyCache() {
  cache.clear();
}

// =========================================================================
// Сессия 48: расширенный API для UI Админки.
// =========================================================================

// Возвращает все строки team_api_keys с метаданными провайдеров (без самого
// ключа — UI получает только маску `••••<last4>`).
export async function listKeysFull() {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_api_keys")
    .select(
      "provider, key_value, display_name, base_url, is_openai_compatible, models, updated_at",
    )
    .order("provider", { ascending: true });
  if (error) {
    throw new Error(`Не удалось получить список ключей: ${error.message}`);
  }
  return (data ?? []).map((row) => ({
    provider: row.provider,
    display_name: row.display_name ?? row.provider,
    base_url: row.base_url ?? null,
    is_openai_compatible: row.is_openai_compatible ?? false,
    models: Array.isArray(row.models) ? row.models : [],
    has_key: typeof row.key_value === "string" && row.key_value.length > 0,
    key_preview:
      typeof row.key_value === "string" && row.key_value.length > 4
        ? `••••${row.key_value.slice(-4)}`
        : null,
    updated_at: row.updated_at ?? null,
  }));
}

// Тестирует ключ провайдера. Возвращает { success: boolean, error?: string }.
// Для anthropic — лёгкий messages.create с 1 токеном.
// Для openai-compatible — GET /models через тот же SDK.
// Для google — лёгкий getGenerativeModel + countTokens.
export async function testKey(provider) {
  ensureProvider(provider);
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_api_keys")
    .select(
      "key_value, base_url, is_openai_compatible, display_name",
    )
    .eq("provider", provider)
    .maybeSingle();
  if (error) {
    return { success: false, error: error.message };
  }
  if (!data || !data.key_value) {
    return { success: false, error: "Ключ не задан." };
  }

  // Динамические импорты SDK — чтобы не тащить openai/anthropic в каждый
  // вызов keysService (большой бандл инициализации).
  try {
    if (provider === "anthropic") {
      const { default: Anthropic } = await import("@anthropic-ai/sdk");
      const ac = new Anthropic({ apiKey: data.key_value });
      // Минимальный пинг: запросим 1 токен на самой дешёвой модели.
      await ac.messages.create({
        model: "claude-haiku-4-5",
        max_tokens: 1,
        messages: [{ role: "user", content: "ping" }],
      });
      return { success: true };
    }
    if (provider === "google") {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const g = new GoogleGenerativeAI(data.key_value);
      const model = g.getGenerativeModel({ model: "gemini-2.5-flash" });
      await model.countTokens("ping");
      return { success: true };
    }
    // OpenAI и любой OpenAI-compatible — GET /models.
    if (data.is_openai_compatible || provider === "openai") {
      const { default: OpenAI } = await import("openai");
      const base_url =
        data.base_url ?? (provider === "openai" ? "https://api.openai.com/v1" : null);
      if (!base_url) {
        return {
          success: false,
          error: "base_url не указан для OpenAI-compatible провайдера.",
        };
      }
      const oc = new OpenAI({ apiKey: data.key_value, baseURL: base_url });
      // models.list — стандартный «проверка ключа» эндпоинт у большинства
      // OpenAI-compatible провайдеров.
      await oc.models.list();
      return { success: true };
    }
    return {
      success: false,
      error: `Провайдер ${provider} не поддерживает автотест ключа.`,
    };
  } catch (err) {
    return { success: false, error: err?.message ?? String(err) };
  }
}
