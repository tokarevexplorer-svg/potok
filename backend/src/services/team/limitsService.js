// Чтение и запись жёстких лимитов расходов из team_settings (запись key='limits').
//
// Используется costTracker.checkDailyLimit / checkTaskLimit (для проверок) и
// routes/team/admin.js (для GET/PATCH /api/team/admin/limits). Чтения кешируются
// в памяти на 10 секунд — лимиты меняются редко (Влад вручную через админку),
// дёргать БД на каждом LLM-вызове бессмысленно.
//
// Хранение — в единственной строке с key='limits' (тот же паттерн, что у
// whitelistService с key='security'). team_settings — изначально key-value
// таблица, но миграция 0014 добавила к ней именованные колонки для лимитов.

import { getServiceRoleClient } from "./teamSupabase.js";

const LIMITS_KEY = "limits";
const CACHE_TTL_MS = 10_000;

let cache = { value: null, fetchedAt: 0 };

export function clearLimitsCache() {
  cache = { value: null, fetchedAt: 0 };
}

// Дефолтные значения на случай, если миграция ещё не накатилась (поля null)
// или строка key='limits' отсутствует. Те же дефолты, что в SQL миграции —
// если поменяешь здесь, поменяй и в 0014_team_hard_limits.sql.
const DEFAULTS = {
  daily_limit_usd: 5.0,
  task_limit_usd: 1.0,
  daily_enabled: true,
  task_enabled: true,
};

function normalize(row) {
  if (!row) return { ...DEFAULTS };
  const dailyLimit = Number(row.hard_daily_limit_usd);
  const taskLimit = Number(row.hard_task_limit_usd);
  return {
    daily_limit_usd: Number.isFinite(dailyLimit) ? dailyLimit : DEFAULTS.daily_limit_usd,
    task_limit_usd: Number.isFinite(taskLimit) ? taskLimit : DEFAULTS.task_limit_usd,
    daily_enabled:
      typeof row.hard_daily_limit_enabled === "boolean"
        ? row.hard_daily_limit_enabled
        : DEFAULTS.daily_enabled,
    task_enabled:
      typeof row.hard_task_limit_enabled === "boolean"
        ? row.hard_task_limit_enabled
        : DEFAULTS.task_enabled,
  };
}

export async function getLimits() {
  const now = Date.now();
  if (cache.value && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.value;
  }
  let result = { ...DEFAULTS };
  try {
    const client = getServiceRoleClient();
    const { data, error } = await client
      .from("team_settings")
      .select(
        "hard_daily_limit_usd, hard_task_limit_usd, hard_daily_limit_enabled, hard_task_limit_enabled",
      )
      .eq("key", LIMITS_KEY)
      .maybeSingle();
    if (!error) {
      result = normalize(data);
    } else {
      console.warn("[limitsService] не удалось прочитать team_settings:", error.message);
    }
  } catch (err) {
    console.warn("[limitsService] исключение при чтении team_settings:", err);
  }
  cache = { value: result, fetchedAt: now };
  return result;
}

// patch — { daily_limit_usd?, daily_enabled?, task_limit_usd?, task_enabled? }.
// Возвращает новое (нормализованное) состояние лимитов. Бросает при ошибке.
export async function updateLimits(patch) {
  const row = { key: LIMITS_KEY, updated_at: new Date().toISOString() };
  if (typeof patch.daily_limit_usd === "number" && Number.isFinite(patch.daily_limit_usd)) {
    row.hard_daily_limit_usd = patch.daily_limit_usd;
  }
  if (typeof patch.task_limit_usd === "number" && Number.isFinite(patch.task_limit_usd)) {
    row.hard_task_limit_usd = patch.task_limit_usd;
  }
  if (typeof patch.daily_enabled === "boolean") {
    row.hard_daily_limit_enabled = patch.daily_enabled;
  }
  if (typeof patch.task_enabled === "boolean") {
    row.hard_task_limit_enabled = patch.task_enabled;
  }
  const client = getServiceRoleClient();
  const { error } = await client
    .from("team_settings")
    .upsert(row, { onConflict: "key" });
  if (error) {
    throw new Error(`Не удалось сохранить лимиты: ${error.message}`);
  }
  clearLimitsCache();
  return await getLimits();
}
