// Очередь обработки видео.
//
// Зачем нужен этот модуль:
// - Apify, Whisper и OpenAI стоят денег и имеют rate-limit. Если пользователь
//   добавит 1000 ссылок и мы запустим 1000 параллельных Promise — спалим лимиты
//   и кошелёк за минуту.
// - Поэтому держим пул из N воркеров (по умолчанию 2). Очередь — обычный массив
//   id-шников, в неё кладут и единичные добавления, и батчи.
// - Дедуп через Set: если id уже в очереди или обрабатывается — повторно не пускаем.
// - Состояние очереди только в памяти. Само состояние «обработать ли видео»
//   живёт в БД (processing_status), поэтому при рестарте бэкенда recoveryService
//   просто пересканирует БД и заполнит очередь заново.

const queue = [];
const enqueued = new Set(); // всё, что либо ждёт в очереди, либо сейчас обрабатывается

let activeWorkers = 0;
let concurrency = 2;
let processFn = null;

export function configureWorkerPool({ concurrency: c, process }) {
  if (typeof c === "number" && c > 0) concurrency = c;
  if (typeof process === "function") processFn = process;
}

// Вернёт true, если id реально добавлен (не дубль).
export function enqueue(videoId) {
  if (typeof videoId !== "string" || !videoId) return false;
  if (enqueued.has(videoId)) return false;
  enqueued.add(videoId);
  queue.push(videoId);
  pump();
  return true;
}

// Пакетное добавление. Возвращает количество реально добавленных.
export function enqueueMany(ids) {
  let added = 0;
  for (const id of ids) {
    if (enqueue(id)) added += 1;
  }
  return added;
}

export function getQueueStats() {
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
      // processFn должен сам сохранять ошибки в БД. Сюда долетают только баги.
      console.error(`[workerPool] необработанная ошибка для ${id}:`, err);
    })
    .finally(() => {
      activeWorkers -= 1;
      enqueued.delete(id);
      pump();
    });
}
