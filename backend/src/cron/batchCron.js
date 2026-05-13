// Сессия 44 этапа 2 (пункт 22): cron для Anthropic Batch poll-сервиса.
//
// Каждые 5 минут вызывает tickBatchPoll(). Запускается только если
// anthropic_batch_enabled=true в team_settings. На старте проверяем
// настройку один раз; смена флага на лету подтянется через 30 сек
// (settingsCache в anthropicBatchEnabled() short-lived).
//
// Решение «cron всегда крутится, но молчит при выключенном флаге» против
// «cron вообще не запускается»: первое проще — не нужно перезапускать
// процесс при смене настройки.

import cron from "node-cron";
import { tickBatchPoll } from "../jobs/batchPollService.js";
import { getServiceRoleClient } from "../services/team/teamSupabase.js";

const TZ = "Etc/UTC";

let started = false;
let settingsCache = { value: null, expiresAt: 0 };
const SETTINGS_TTL_MS = 30_000;

async function isBatchEnabled() {
  const now = Date.now();
  if (settingsCache.value !== null && settingsCache.expiresAt > now) {
    return settingsCache.value;
  }
  const client = getServiceRoleClient();
  let enabled = false;
  try {
    const { data, error } = await client
      .from("team_settings")
      .select("value")
      .eq("key", "anthropic_batch_enabled")
      .maybeSingle();
    if (!error && data && (data.value === true || data.value === "true")) {
      enabled = true;
    }
  } catch (err) {
    console.warn(`[batch-cron] settings query failed: ${err?.message ?? err}`);
  }
  settingsCache = { value: enabled, expiresAt: now + SETTINGS_TTL_MS };
  return enabled;
}

export function startBatchCron() {
  if (started) return;
  started = true;

  cron.schedule(
    "*/5 * * * *",
    async () => {
      try {
        if (!(await isBatchEnabled())) return;
        const result = await tickBatchPoll();
        if (result.checked > 0) {
          console.log(
            `[batch-cron] poll: checked ${result.checked}, completed ${result.completed}, errored ${result.errored}`,
          );
        }
      } catch (err) {
        console.error("[batch-cron] poll failed:", err);
      }
    },
    { timezone: TZ },
  );

  console.log("[batch-cron] started: poll every 5 min");
}
