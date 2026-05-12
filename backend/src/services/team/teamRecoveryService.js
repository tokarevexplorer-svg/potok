// При старте бэкенда сканируем team_tasks на статус running и кладём такие
// id обратно в очередь команды. Без этого после рестарта Railway/локального
// процесса задачи, которые были в полёте, останутся в running навсегда —
// teamWorkerPool их не подхватит, потому что состояние очереди только в памяти.
//
// Логика 1-в-1 с recoveryService.js Потока, только источник id'шников
// другой (team_tasks вместо videos) и пул другой (teamWorkerPool вместо workerPool).

import { enqueueTeamTasks } from "../../queue/teamWorkerPool.js";
import { getActiveTaskIds, getStuckClarifyingTaskIds } from "./teamSupabase.js";

export async function recoverUnfinishedTeamTasks() {
  try {
    const ids = await getActiveTaskIds();
    if (ids.length === 0) {
      console.log("[team-recovery] незавершённых задач нет");
    } else {
      const added = enqueueTeamTasks(ids);
      console.log(`[team-recovery] поставлено в очередь: ${added} (из ${ids.length})`);
    }

    // Сессия 31: clarifying-задачи — отдельный путь. После рестарта
    // повторно вызываем генерацию уточнений; если LLM-вызов повторится с
    // тем же результатом — пользователь увидит те же вопросы. Это
    // безопасно (нет идемпотентного maker'а в БД, но в худшем случае —
    // двойной счёт расходов, что отображается в team_api_calls).
    const stuck = await getStuckClarifyingTaskIds();
    if (stuck.length > 0) {
      console.log(
        `[team-recovery] обнаружено ${stuck.length} задач в clarifying — повторно запускаю генерацию вопросов`,
      );
      // Импорт ленивый, чтобы избежать циклической зависимости с taskRunner.
      const { generateClarificationsForStuckTask } = await import("./taskRunner.js");
      for (const id of stuck) {
        setImmediate(() => {
          void generateClarificationsForStuckTask(id).catch((err) => {
            console.warn(
              `[team-recovery] clarification ${id} failed:`,
              err?.message ?? err,
            );
          });
        });
      }
    }
  } catch (err) {
    // Recovery не должен ронять старт сервера — лучше отдельные логи.
    console.error("[team-recovery] не удалось восстановить очередь:", err);
  }
}
