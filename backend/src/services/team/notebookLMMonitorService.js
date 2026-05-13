// Сессия 50 этапа 2 (пункт 1, этап 7): мониторинг локального NotebookLM-воркера.
//
// Воркер живёт на машине Влада и обрабатывает задачи NotebookLM (см. этап 5
// пункт 17). Шлёт heartbeat'ы в team_notebooklm_heartbeat раз в ~30 сек.
// UI Админки показывает статус 🟢/🟡/🔴 на основе давности последнего heartbeat.

import { getServiceRoleClient } from "./teamSupabase.js";

const GREEN_THRESHOLD_MS = 60 * 1000; // <1 минуты — онлайн
const YELLOW_THRESHOLD_MS = 5 * 60 * 1000; // 1–5 минут — возможно занят
// >5 минут — офлайн (red)

export async function getStatus() {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_notebooklm_heartbeat")
    .select("id, status, version, last_task_id, last_task_name, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return {
      status: "unknown",
      message: `Не удалось прочитать heartbeat: ${error.message}`,
    };
  }
  if (!data) {
    return {
      status: "unknown",
      message: "Воркер ни разу не отправлял heartbeat.",
    };
  }

  const createdAt = new Date(data.created_at);
  const age = Date.now() - createdAt.getTime();
  let status;
  if (age < GREEN_THRESHOLD_MS) status = "green";
  else if (age < YELLOW_THRESHOLD_MS) status = "yellow";
  else status = "red";

  return {
    status,
    age_ms: age,
    lastSeen: data.created_at,
    workerStatus: data.status,
    version: data.version ?? null,
    lastTask: data.last_task_name
      ? { id: data.last_task_id, name: data.last_task_name }
      : null,
  };
}

// Ставит фиктивную задачу в очередь для проверки, что воркер реально
// отвечает. Возвращает { queued: true, taskId }.
export async function queueTestTask() {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_notebooklm_queue")
    .insert({
      type: "health_check",
      payload: { test: true, requested_at: new Date().toISOString() },
      status: "queued",
    })
    .select("id")
    .maybeSingle();
  if (error) {
    throw new Error(`Не удалось поставить тестовую задачу: ${error.message}`);
  }
  return { queued: true, taskId: data?.id ?? null };
}

// Проверяет статус тестовой задачи. Возвращает:
//   { completed: false }                                    — ещё в работе
//   { completed: true, result }                             — успешно
//   { completed: true, error }                              — ошибка
export async function getTestResult(taskId) {
  if (!taskId) throw new Error("taskId обязателен.");
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_notebooklm_queue")
    .select("status, result, error, created_at, completed_at")
    .eq("id", taskId)
    .maybeSingle();
  if (error) {
    throw new Error(`Не удалось прочитать тестовую задачу: ${error.message}`);
  }
  if (!data) {
    return { completed: true, error: "Задача не найдена." };
  }
  if (data.status === "queued" || data.status === "running") {
    return { completed: false, status: data.status };
  }
  if (data.status === "done") {
    return { completed: true, status: "done", result: data.result ?? null };
  }
  if (data.status === "error") {
    return { completed: true, status: "error", error: data.error ?? "Воркер вернул ошибку." };
  }
  return { completed: true, status: data.status };
}
