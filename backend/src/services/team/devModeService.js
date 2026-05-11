// «Тестовый режим без авторизации» (dev mode).
//
// Используется фронтом, чтобы Playwright/автотесты могли работать без OAuth
// в течение ограниченного времени (1/4/12/24 часа). Сами авто-проверки
// делает frontend middleware и /api/team-proxy — здесь только CRUD над
// записью team_settings (миграция 0020).
//
// Кеш в памяти 5 секунд: middleware читает статус на каждый запрос, идти
// в БД на каждый чих смысла нет.

import { getServiceRoleClient } from "./teamSupabase.js";

const KEY = "dev_mode";
const CACHE_TTL_MS = 5_000;
const ALLOWED_HOURS = new Set([1, 4, 12, 24]);

let cache = { value: null, fetchedAt: 0 };

export function clearDevModeCache() {
  cache = { value: null, fetchedAt: 0 };
}

// Структура {active, until, auto_disable_hours}.
//   active — true только если until не null И > now().
//   until — ISO-строка или null.
//   auto_disable_hours — последнее выбранное значение (1/4/12/24) или 12 (дефолт).
function normalize(row) {
  const auto =
    row && Number.isInteger(row.dev_mode_auto_disable_hours)
      ? row.dev_mode_auto_disable_hours
      : 12;
  const untilStr = row?.dev_mode_until ?? null;
  if (!untilStr) {
    return { active: false, until: null, auto_disable_hours: auto };
  }
  const untilMs = Date.parse(untilStr);
  if (!Number.isFinite(untilMs)) {
    return { active: false, until: null, auto_disable_hours: auto };
  }
  const active = untilMs > Date.now();
  return { active, until: untilStr, auto_disable_hours: auto };
}

export async function getDevMode() {
  const now = Date.now();
  if (cache.value && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.value;
  }
  let result = { active: false, until: null, auto_disable_hours: 12 };
  try {
    const client = getServiceRoleClient();
    const { data, error } = await client
      .from("team_settings")
      .select("dev_mode_until, dev_mode_auto_disable_hours")
      .eq("key", KEY)
      .maybeSingle();
    if (!error) {
      result = normalize(data);
    } else {
      console.warn("[devModeService] не удалось прочитать team_settings:", error.message);
    }
  } catch (err) {
    console.warn("[devModeService] исключение при чтении team_settings:", err);
  }
  cache = { value: result, fetchedAt: now };
  return result;
}

// Включение режима. hours — 1/4/12/24. Возвращает новое состояние.
export async function enableDevMode(hours) {
  const n = Number(hours);
  if (!ALLOWED_HOURS.has(n)) {
    throw new Error("hours должно быть одним из: 1, 4, 12, 24.");
  }
  const until = new Date(Date.now() + n * 60 * 60 * 1000).toISOString();
  const client = getServiceRoleClient();
  const { error } = await client.from("team_settings").upsert(
    {
      key: KEY,
      dev_mode_until: until,
      dev_mode_auto_disable_hours: n,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) {
    throw new Error(`Не удалось включить dev mode: ${error.message}`);
  }
  clearDevModeCache();
  return await getDevMode();
}

// Выключение режима — обнуляем until (auto_disable_hours оставляем для UI).
// Возвращает новое состояние.
export async function disableDevMode() {
  const client = getServiceRoleClient();
  const { error } = await client.from("team_settings").upsert(
    {
      key: KEY,
      dev_mode_until: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "key" },
  );
  if (error) {
    throw new Error(`Не удалось выключить dev mode: ${error.message}`);
  }
  clearDevModeCache();
  return await getDevMode();
}
