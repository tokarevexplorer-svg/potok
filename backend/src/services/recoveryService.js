import { enqueueMany } from "../queue/workerPool.js";
import { getUnfinishedVideoIds } from "./supabaseService.js";

// При старте бэкенда подхватываем всё, что не доделано:
//   - pending — ещё не запускалось
//   - processing — застряло, потому что нас перезапустили посреди обработки
//
// Без этой функции после рестарта Railway пользователь сидит и ждёт,
// а ничего не происходит. Особенно болезненно для батчей на 1000 ссылок.
export async function recoverUnfinishedQueue() {
  try {
    const ids = await getUnfinishedVideoIds();
    if (ids.length === 0) {
      console.log("[recovery] незавершённых задач нет");
      return;
    }
    const added = enqueueMany(ids);
    console.log(`[recovery] поставлено в очередь: ${added} (из ${ids.length})`);
  } catch (err) {
    // Recovery не должен ронять старт сервера — лучше отдельные логи.
    console.error("[recovery] не удалось восстановить очередь:", err);
  }
}
