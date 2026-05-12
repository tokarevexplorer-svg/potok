// Сессия 39 этапа 2 (пункт 20): cron для Telegram-очереди.
//
// Каждые 5 минут: проверяем, не закончился ли тихий час, и если да —
// flushQueue отправляет отложенные сообщения. Внутри flushQueue ещё раз
// проверяется isQuietHours (на случай гонки).

import cron from "node-cron";
import { flushQueue, getSystemBotToken } from "../services/team/telegramService.js";

const TZ = "Etc/UTC";

let started = false;

export function startTelegramCron() {
  if (started) return;
  // Если системный токен не задан — cron бессмысленен, выходим.
  if (!getSystemBotToken()) {
    console.log("[telegram-cron] TELEGRAM_SYSTEM_BOT_TOKEN не задан — cron не запускается");
    return;
  }
  started = true;

  cron.schedule(
    "*/5 * * * *",
    async () => {
      try {
        const result = await flushQueue();
        if (result.sent > 0 || result.failed > 0) {
          console.log(
            `[telegram-cron] flush: sent ${result.sent}, failed ${result.failed ?? 0}`,
          );
        }
      } catch (err) {
        console.error("[telegram-cron] flush failed:", err);
      }
    },
    { timezone: TZ },
  );

  console.log("[telegram-cron] started: flush queue every 5 min");
}
