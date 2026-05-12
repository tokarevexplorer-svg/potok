// Сессия 40 review: тестируем push-уведомление о done-задаче и daily report.
//
// 1. pushTaskDoneNotification — отправляет ✅ от агентского бота.
// 2. tickDailyReports — симулируем срабатывание (сбрасываем last_report_date,
//    подменяем время через monkeypatch settings → reportTime = текущая минута).
//
// Запуск: node scripts/test-telegram-session-40.js

import "dotenv/config";
import {
  pushTaskDoneNotification,
  tickDailyReports,
} from "../src/jobs/dailyReportsJob.js";
import { getServiceRoleClient } from "../src/services/team/teamSupabase.js";
import {
  updateTelegramSettings,
  clearTelegramSettingsCache,
  getTelegramSettings,
} from "../src/services/team/telegramService.js";

async function main() {
  const sb = getServiceRoleClient();

  // ===== 1. pushTaskDoneNotification =====
  console.log("\n[1] pushTaskDoneNotification");
  const fakeTask = {
    id: "tsk_test_session40_001",
    agent_id: "igor",
    title: "Тестовая задача (Сессия 40 review)",
    type: "analyze_competitor",
    result:
      "Это пример короткого результата задачи, который должен попасть в push-сообщение как preview-текст. " +
      "Длинный текст обрезается до 200 символов, и в конце добавляется многоточие. " +
      "Этот результат — выдумка для smoke-теста.",
  };
  const pushResult = await pushTaskDoneNotification(fakeTask);
  console.log(`  result: ${JSON.stringify(pushResult)}`);

  // ===== 2. tickDailyReports =====
  console.log("\n[2] tickDailyReports — подгоняем время и запускаем");

  const now = new Date();
  const tz = "Europe/Moscow";
  const hh = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  })
    .formatToParts(now)
    .filter((p) => p.type === "hour" || p.type === "minute")
    .map((p) => p.value)
    .join(":");
  console.log(`  Текущее ${tz} время: ${hh}`);

  // Сохраняем оригинальное reportTime, ставим текущее, сбрасываем last_report_date.
  const before = await getTelegramSettings();
  await updateTelegramSettings({ dailyReportTime: hh });
  clearTelegramSettingsCache();

  await sb.from("team_settings").delete().eq("key", "telegram_last_report_date");

  // Создаём фиктивную задачу для igor (чтобы отчёт не был пустой).
  const today = new Date();
  const taskId = `tsk_test_report_${Date.now()}`;
  await sb.from("team_tasks").insert({
    id: taskId,
    agent_id: "igor",
    type: "analyze_competitor",
    title: "Smoke-задача для теста ежедневного отчёта",
    status: "done",
    result:
      "Краткий результат тестовой задачи — это нужно, чтобы отчёт не вернул «нет задач сегодня».",
    created_at: today.toISOString(),
    user_id: "00000000-0000-0000-0000-000000000000",
    params: {},
  });

  const report = await tickDailyReports();
  console.log(`  result: ${JSON.stringify(report, null, 2).slice(0, 600)}`);

  // Cleanup: возвращаем reportTime и удаляем фейковую задачу.
  await updateTelegramSettings({ dailyReportTime: before.dailyReportTime });
  clearTelegramSettingsCache();
  await sb.from("team_settings").delete().eq("key", "telegram_last_report_date");
  await sb.from("team_tasks").delete().eq("id", taskId);
  console.log("  cleanup: dailyReportTime восстановлен, тестовая задача удалена");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
