// Очередь задач команды.
//
// Структура копирует существующий workerPool.js Потока, но это отдельный пул:
// видео-обработка и команда не должны блокировать друг друга. У команды по
// дефолту concurrency=1 (задачи длиннее и дороже видео — параллельный запуск
// быстрее упрётся в rate-limit Anthropic/OpenAI и стоит непропорционально).
//
// Дедуп через Set: если task id уже в очереди или обрабатывается — повторно
// не пускаем (recoveryService может попытаться поставить тот же id).
// Состояние очереди только в памяти. Сами задачи живут в team_tasks с
// `status='running'`, поэтому при рестарте teamRecoveryService пересканирует
// БД и заполнит очередь заново.

const queue = [];
const enqueued = new Set();

let activeWorkers = 0;
let concurrency = 1;
let processFn = null;

export function configureTeamWorkerPool({ concurrency: c, process }) {
  if (typeof c === "number" && c > 0) concurrency = c;
  if (typeof process === "function") processFn = process;
}

// Кладёт task id в очередь команды. Возвращает true, если реально добавлен.
export function enqueueTeamTask(taskId) {
  if (typeof taskId !== "string" || !taskId) return false;
  if (enqueued.has(taskId)) return false;
  enqueued.add(taskId);
  queue.push(taskId);
  pump();
  return true;
}

// Пакетное добавление. Возвращает количество реально добавленных.
export function enqueueTeamTasks(ids) {
  let added = 0;
  for (const id of ids) {
    if (enqueueTeamTask(id)) added += 1;
  }
  return added;
}

export function getTeamQueueStats() {
  return {
    queued: queue.length,
    active: activeWorkers,
    total: enqueued.size,
    concurrency,
  };
}

function pump() {
  if (!processFn) return;
  while (activeWorkers < concurrency && queue.length > 0) {
    const id = queue.shift();
    activeWorkers += 1;
    runOne(id);
  }
}

function runOne(id) {
  Promise.resolve()
    .then(() => processFn(id))
    .catch((err) => {
      // processFn (runTaskInBackground) сам пишет ошибки в team_tasks.
      // Сюда долетает только баг внутри самого пула.
      console.error(`[team-pool] необработанная ошибка для ${id}:`, err);
    })
    .finally(() => {
      activeWorkers -= 1;
      enqueued.delete(id);
      pump();
    });
}
