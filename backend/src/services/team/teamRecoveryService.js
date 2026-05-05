// При старте бэкенда сканируем team_tasks на статус running и кладём такие
// id обратно в очередь команды. Без этого после рестарта Railway/локального
// процесса задачи, которые были в полёте, останутся в running навсегда —
// teamWorkerPool их не подхватит, потому что состояние очереди только в памяти.
//
// Логика 1-в-1 с recoveryService.js Потока, только источник id'шников
// другой (team_tasks вместо videos) и пул другой (teamWorkerPool вместо workerPool).

import { enqueueTeamTasks } from "../../queue/teamWorkerPool.js";
import { getActiveTaskIds } from "./teamSupabase.js";

export async function recoverUnfinishedTeamTasks() {
  try {
    const ids = await getActiveTaskIds();
    if (ids.length === 0) {
      console.log("[team-recovery] незавершённых задач нет");
      return;
    }
    const added = enqueueTeamTasks(ids);
    console.log(`[team-recovery] поставлено в очередь: ${added} (из ${ids.length})`);
  } catch (err) {
    // Recovery не должен ронять старт сервера — лучше отдельные логи.
    console.error("[team-recovery] не удалось восстановить очередь:", err);
  }
}
