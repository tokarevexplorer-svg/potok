// Сессия 39+: smoke-тест Telegram-интеграции.
//
// 1. Отправка тестового сообщения от системного бота.
// 2. Отправка тестового сообщения от каждого агентского бота.
// 3. Принудительный flush очереди — проверить, что cron-логика работает.
//
// Запуск: node scripts/smoke-test-telegram.js

import "dotenv/config";
import {
  flushQueue,
  getAgentBots,
  getTelegramSettings,
  isQuietHours,
  sendMessageFromAgent,
  sendMessageFromSystem,
} from "../src/services/team/telegramService.js";

async function main() {
  const settings = await getTelegramSettings();
  const quiet = await isQuietHours();
  console.log("Telegram settings:");
  console.log(`  enabled=${settings.enabled}  chat_id="${settings.chatId}"`);
  console.log(`  daily_report=${settings.dailyReportTime}`);
  console.log(
    `  quiet_hours=${settings.quietHours.start_hour}-${settings.quietHours.end_hour} ${settings.quietHours.timezone}  (currently in quiet=${quiet})`,
  );

  console.log("\n[1] Системный бот");
  const sysResult = await sendMessageFromSystem(
    "🧪 <b>Smoke test</b>\nСистемный бот работает.",
  );
  console.log(`  result: ${JSON.stringify(sysResult)}`);

  console.log("\n[2] Агентские боты");
  const bots = await getAgentBots();
  for (const bot of bots) {
    const result = await sendMessageFromAgent(
      bot.agent_id,
      `👋 <b>Smoke test</b>\nЯ — бот агента <i>${bot.agent_id}</i> (@${bot.bot_username}).`,
    );
    console.log(`  ${bot.agent_id} (@${bot.bot_username}): ${JSON.stringify(result)}`);
  }

  console.log("\n[3] Flush очереди");
  const flush = await flushQueue();
  console.log(`  result: ${JSON.stringify(flush)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
