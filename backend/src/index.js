import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { configureWorkerPool } from "./queue/workerPool.js";
import { processVideoById } from "./services/videoProcessor.js";
import { recoverUnfinishedQueue } from "./services/recoveryService.js";
import { configureTeamWorkerPool } from "./queue/teamWorkerPool.js";
import { runTaskInBackground } from "./services/team/taskRunner.js";
import { recoverUnfinishedTeamTasks } from "./services/team/teamRecoveryService.js";
import { startAutonomyCron } from "./cron/autonomyCron.js";
import { startTelegramCron } from "./cron/telegramCron.js";
import { startBatchCron } from "./cron/batchCron.js";

// Настраиваем пул до старта сервера: процессор и конкурентность.
configureWorkerPool({
  concurrency: env.workerConcurrency,
  process: processVideoById,
});

// Отдельный пул для задач команды: длиннее и дороже видео-обработки,
// параллельность ниже по дефолту.
configureTeamWorkerPool({
  concurrency: env.teamWorkerConcurrency,
  process: runTaskInBackground,
});

const app = createApp();

app.listen(env.port, () => {
  console.log(`potok-backend слушает http://localhost:${env.port}`);
  console.log(`  CORS origins: ${env.frontendOrigins.join(", ")}`);
  console.log(`  Apify actor : ${env.apifyActorId}`);
  console.log(`  Worker pool : concurrency=${env.workerConcurrency}`);
  console.log(`  Team pool   : concurrency=${env.teamWorkerConcurrency}`);

  // Подхватываем «недоделанные» строки из БД. Делаем после listen, чтобы
  // health-чек Railway успевал ответить, пока мы сканируем.
  recoverUnfinishedQueue();
  recoverUnfinishedTeamTasks();

  // Сессия 24: cron-задачи автономности. Сами проверяют
  // autonomy_enabled_globally — стартуем их безусловно, а флаг рулит
  // фактическим выполнением.
  startAutonomyCron();

  // Сессия 39: cron Telegram-очереди. Сам проверит наличие
  // TELEGRAM_SYSTEM_BOT_TOKEN и переменных, иначе не запустится.
  startTelegramCron();

  // Сессия 44: cron Anthropic Batch poll. Тикает раз в 5 мин, внутри
  // проверяет anthropic_batch_enabled — без флага молчит.
  startBatchCron();
});
