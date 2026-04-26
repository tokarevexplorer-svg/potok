import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { configureWorkerPool } from "./queue/workerPool.js";
import { processVideoById } from "./services/videoProcessor.js";
import { recoverUnfinishedQueue } from "./services/recoveryService.js";

// Настраиваем пул до старта сервера: процессор и конкурентность.
configureWorkerPool({
  concurrency: env.workerConcurrency,
  process: processVideoById,
});

const app = createApp();

app.listen(env.port, () => {
  console.log(`potok-backend слушает http://localhost:${env.port}`);
  console.log(`  CORS origins: ${env.frontendOrigins.join(", ")}`);
  console.log(`  Apify actor : ${env.apifyActorId}`);
  console.log(`  Worker pool : concurrency=${env.workerConcurrency}`);

  // Подхватываем «недоделанные» строки из БД. Делаем после listen, чтобы
  // health-чек Railway успевал ответить, пока мы сканируем.
  recoverUnfinishedQueue();
});
