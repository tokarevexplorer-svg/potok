// Тестовый скрипт для проверки TaskRunner и TASK_HANDLERS (Сессия 26 / Сессия 3 roadmap'а команды).
//
// Запуск (PowerShell, из backend/):
//   & "C:\Program Files\nodejs\node.exe" scripts/testTeamTask.js
//
// Что делает:
//   1. Создаёт задачу типа `ideas_free` с тестовым вводом через taskRunner.createTask.
//      Это пишет первый снапшот running в team_tasks и кладёт id в очередь
//      (teamWorkerPool с дефолтной concurrency=1).
//   2. Конфигурирует пул process-функцией runTaskInBackground (без поднятия
//      Express-сервера — нам не нужен HTTP, только сама очередь).
//   3. Поллит статус задачи каждые 2 секунды через teamSupabase.getTaskById,
//      пока не дождётся `done` или `error`.
//   4. Печатает финальный результат: статус, токены, стоимость, путь до артефакта.
//
// До запуска:
//   - Применены миграции 0012 (Сессия 24) — таблицы и buckets команды
//   - В team-prompts/ideas-free.md лежит шаблон промпта
//   - В team-database/context.md лежит хотя бы пустой/тестовый контекст
//   - В team-config/pricing.json и presets.json лежат рабочие конфиги
//   - В team_api_keys есть anthropic ключ (или какой провайдер задаётся ниже)
//
// Скрипт пишет 2 строки в team_tasks (running + done) и 1 строку в team_api_calls.
// Артефакт ложится в team-database/ideas/. Удалить можно вручную через Dashboard.

import { configureTeamWorkerPool } from "../src/queue/teamWorkerPool.js";
import {
  createTask,
  runTaskInBackground,
} from "../src/services/team/taskRunner.js";
import { getTaskById } from "../src/services/team/teamSupabase.js";
import { env } from "../src/config/env.js";

// Можно переопределить пресет/модель: node scripts/testTeamTask.js fast
const preset = process.argv[2] ?? "balanced";

const TEST_INPUT =
  "Придумай 3 идеи коротких видео-сюжетов про необычные истории Санкт-Петербурга XIX века.";
const POLL_INTERVAL_MS = 2_000;
const MAX_WAIT_MS = 5 * 60 * 1_000; // 5 минут

async function main() {
  console.log(`[test] preset=${preset}, concurrency=${env.teamWorkerConcurrency}`);

  // Конфигурируем пул: без HTTP-сервера, нам нужна только сама очередь.
  configureTeamWorkerPool({
    concurrency: env.teamWorkerConcurrency,
    process: runTaskInBackground,
  });

  console.log("[test] создаю задачу ideas_free...");
  let taskId;
  try {
    taskId = await createTask({
      taskType: "ideas_free",
      params: { user_input: TEST_INPUT },
      modelChoice: { preset },
    });
  } catch (err) {
    console.error(`[test] не удалось создать задачу: ${err.message ?? err}`);
    process.exit(1);
  }
  console.log(`[test] task id = ${taskId}`);
  console.log("[test] жду завершения (опрос каждые 2 сек)...");

  const startedAt = Date.now();
  let task = null;
  let lastStatus = null;
  while (Date.now() - startedAt < MAX_WAIT_MS) {
    await sleep(POLL_INTERVAL_MS);
    try {
      task = await getTaskById(taskId);
    } catch (err) {
      console.warn(`[test] поллинг упал: ${err.message ?? err}`);
      continue;
    }
    if (!task) continue;
    if (task.status !== lastStatus) {
      console.log(`  [poll] status=${task.status}`);
      lastStatus = task.status;
    }
    if (["done", "error", "archived", "marked_done"].includes(task.status)) break;
  }

  if (!task) {
    console.error("[test] задача не найдена после ожидания");
    process.exit(1);
  }

  console.log("\n=== Результат ===");
  console.log(`status:        ${task.status}`);
  console.log(`provider/model: ${task.provider}/${task.model}`);
  console.log(`tokens:        ${JSON.stringify(task.tokens)}`);
  console.log(`cost_usd:      $${(task.cost_usd ?? 0).toFixed?.(6) ?? task.cost_usd}`);
  console.log(`artifact_path: ${task.artifact_path || "(нет)"}`);
  if (task.error) {
    console.log(`error:         ${task.error}`);
  }

  console.log("\n=== Текст ответа (первые 500 символов) ===");
  const text = task.result || "";
  console.log(text.length > 500 ? text.slice(0, 500) + "…" : text || "(пусто)");

  if (task.status !== "done") {
    process.exit(2);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("[test] неожиданная ошибка:", err);
  process.exit(1);
});
