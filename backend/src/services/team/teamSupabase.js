// Supabase-клиент для всех team_* таблиц команды.
//
// Заменяет JSONL-журналы из локальной ДК Лурье (`tasks.jsonl`, `api-calls.jsonl`)
// на полноценные таблицы в БД. Логика append-only сохранена: на каждое изменение
// статуса задачи добавляется новая строка с тем же `id`. Текущее состояние —
// последняя строка с этим `id`, выбирается через DISTINCT ON (id) ORDER BY
// id, created_at DESC.
//
// Все мутации идут через service-role клиент (минует RLS), чтобы запись из
// бэкенда работала независимо от настроек RLS-политик.

import { createClient } from "@supabase/supabase-js";
import { env } from "../../config/env.js";

let cachedClient = null;

// Singleton: один клиент на процесс. service-role ключ нельзя отдавать в браузер.
export function getServiceRoleClient() {
  if (cachedClient) return cachedClient;
  cachedClient = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });
  return cachedClient;
}

// =========================================================================
// team_tasks — append-only журнал состояний задач
// =========================================================================

// Добавляет новый снапшот состояния задачи. Каждый вызов — новая строка с
// тем же `id`. Текущим состоянием задачи считается последний снапшот.
//
// snapshot — частичный объект из полей колонок team_tasks. Поля, которые мы
// не указываем, останутся null/default (например, при создании running-снапшота
// finished_at = null).
//
// Возвращает вставленную строку (с record_id и created_at).
export async function appendTaskSnapshot(snapshot) {
  const client = getServiceRoleClient();
  if (!snapshot.id || typeof snapshot.id !== "string") {
    throw new Error("appendTaskSnapshot: snapshot.id обязателен.");
  }

  const row = {
    id: snapshot.id,
    type: snapshot.type ?? null,
    title: snapshot.title ?? null,
    status: snapshot.status ?? null,
    params: snapshot.params ?? null,
    model_choice: snapshot.modelChoice ?? null,
    provider: snapshot.provider ?? null,
    model: snapshot.model ?? null,
    prompt: snapshot.prompt ?? null,
    prompt_override_used:
      typeof snapshot.promptOverrideUsed === "boolean"
        ? snapshot.promptOverrideUsed
        : null,
    result: snapshot.result ?? null,
    artifact_path: snapshot.artifactPath ?? null,
    tokens: snapshot.tokens ?? null,
    cost_usd: snapshot.costUsd ?? null,
    error: snapshot.error ?? null,
    started_at: snapshot.startedAt ?? null,
    finished_at: snapshot.finishedAt ?? null,
    // agent_id — Сессия 12. Опц.: задача может быть без агента (как в этапе 1)
    // или привязанной к конкретному исполнителю. Снимок переносит значение
    // между состояниями: оно задаётся при первом insert'е (createTask) и
    // тащится дальше через mergeSnapshot.
    agent_id: snapshot.agentId ?? null,
    // parent_task_id — Сессия 13. NULL для корневой задачи (большинство),
    // task.id родителя для handoff-цепочки. Не меняется между снапшотами.
    parent_task_id: snapshot.parentTaskId ?? null,
    // suggested_next_steps — Сессия 13. NULL до завершения; после finishTask
    // — массив [{ agent_name, suggestion }]. Парсится из ответа LLM по
    // блоку **Suggested Next Steps:** (см. handoffParser.js).
    suggested_next_steps: snapshot.suggestedNextSteps ?? null,
    // project_id — Сессия 16. Soft-ref на team_projects.id. NULL = «без проекта».
    project_id: snapshot.projectId ?? null,
    // self-review — Сессия 29. Три поля переезжают между снапшотами через
    // mergeSnapshot, чтобы append-only история сохраняла настройки + итог.
    self_review_enabled:
      typeof snapshot.selfReviewEnabled === "boolean"
        ? snapshot.selfReviewEnabled
        : null,
    self_review_extra_checks: snapshot.selfReviewExtraChecks ?? null,
    self_review_result: snapshot.selfReviewResult ?? null,
    // Сессия 31: многошаговая инфраструктура + уточнения от агента.
    step_state: snapshot.stepState ?? null,
    clarification_enabled:
      typeof snapshot.clarificationEnabled === "boolean"
        ? snapshot.clarificationEnabled
        : null,
    clarification_questions: snapshot.clarificationQuestions ?? null,
    clarification_answers: snapshot.clarificationAnswers ?? null,
    comparison_group_id: snapshot.comparisonGroupId ?? null,
  };

  const { data, error } = await client
    .from("team_tasks")
    .insert(row)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase insert team_tasks failed: ${error.message}`);
  }
  return data;
}

// Возвращает текущее состояние задачи по id (последний снапшот).
// Если задачи нет — null.
export async function getTaskById(id) {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_tasks")
    .select("*")
    .eq("id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase select team_tasks by id failed: ${error.message}`);
  }
  return data ?? null;
}

// Все id задач в статусе running. Используется при старте бэкенда для
// recovery: после рестарта залить эти id обратно в очередь.
//
// Postgres не позволяет напрямую сделать «DISTINCT ON (id) WHERE status = ...»
// без подзапроса, поэтому делаем в две стадии: тащим все running-снапшоты,
// группируем по id на стороне клиента (при обычных объёмах команды это
// единицы строк, не проблема).
export async function getActiveTaskIds() {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_tasks")
    .select("id, created_at, status")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Supabase select active team_tasks failed: ${error.message}`);
  }

  // По каждому id берём последний снапшот; включаем id если status = running.
  // Сессия 31: 'awaiting_input' НЕ заводим в очередь — ждёт ответа Влада.
  // Сессия 38: 'awaiting_resource' ЗАВОДИМ — это означает «многошаговая
  // задача в работе, упала где-то на шаге». Handler сам резюмирует с
  // current_step из step_state.
  // 'clarifying' тоже не идёт в worker-pool: воркер вызывает обычный handler,
  // а clarifying нужен отдельный путь (generateClarificationsForTask). Для
  // таких застрявших задач есть отдельный getStuckClarifyingTaskIds.
  const seen = new Set();
  const active = [];
  for (const row of data ?? []) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (row.status === "running" || row.status === "awaiting_resource") {
      active.push(row.id);
    }
  }
  return active;
}

// Сессия 31: задачи, застрявшие в clarifying — recovery вызывает для них
// generateClarificationsForTask ещё раз. Обычно это короткая операция,
// но если процесс упал между записью статуса 'clarifying' и LLM-ответом,
// задача остаётся «висеть» — нам нужно повторно её дёрнуть.
export async function getStuckClarifyingTaskIds() {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_tasks")
    .select("id, created_at, status")
    .order("created_at", { ascending: false });
  if (error) {
    throw new Error(`Supabase select clarifying team_tasks failed: ${error.message}`);
  }
  const seen = new Set();
  const stuck = [];
  for (const row of data ?? []) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (row.status === "clarifying") stuck.push(row.id);
  }
  return stuck;
}

// Все задачи (текущие состояния, по одному на id). Сортировка по created_at
// последнего снапшота — свежие сверху.
export async function getAllTasks() {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_tasks")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Supabase select all team_tasks failed: ${error.message}`);
  }

  const seen = new Set();
  const current = [];
  for (const row of data ?? []) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    current.push(row);
  }
  return current;
}

// Текущие задачи с заданным статусом (или массивом статусов).
// status — строка или массив строк.
export async function getTasksByStatus(status) {
  const all = await getAllTasks();
  const allowed = Array.isArray(status) ? new Set(status) : new Set([status]);
  return all.filter((t) => allowed.has(t.status));
}

// Прямые дочерние задачи по parent_task_id (Сессия 13, handoff-цепочка).
// Возвращает текущие состояния всех задач, у которых parent_task_id = parentId.
// Используется в getTaskChain для рекурсивного обхода вниз.
export async function getChildTasks(parentId) {
  if (!parentId || typeof parentId !== "string") return [];
  const client = getServiceRoleClient();
  // Тянем все снапшоты, у которых parent_task_id совпадает, и схлопываем
  // до последнего на каждый task id (см. логику getAllTasks).
  const { data, error } = await client
    .from("team_tasks")
    .select("*")
    .eq("parent_task_id", parentId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Supabase select team_tasks by parent failed: ${error.message}`);
  }
  const seen = new Set();
  const current = [];
  for (const row of data ?? []) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    current.push(row);
  }
  return current;
}

// =========================================================================
// team_api_calls — журнал вызовов LLM (бывший api-calls.jsonl)
// =========================================================================

// Записывает один вызов LLM (или Whisper). Возвращает вставленную строку.
//
// payload — объект:
//   provider, model — обязательные строки
//   inputTokens, outputTokens, cachedTokens — целые числа (по умолчанию 0)
//   costUsd — number, посчитан costTracker'ом
//   taskId — id задачи из team_tasks (или null, если вызов отдельный)
//   success — boolean, по умолчанию true
//   error — текст ошибки или null
//   audioMinutes — длительность аудио в минутах для Whisper, иначе null
//   agentId — slug агента или 'system' (нет FK на team_agents.id — допускаем
//             псевдо-id и вызовы для ещё-не-созданного агента, напр. test_run
//             внутри мастера); null, если вызов вне агентского контекста.
//   purpose — назначение вызова: 'role_draft', 'test_run', 'task', и т.п.
//             Используется в админке для разбора расходов по типу активности.
export async function recordApiCall(payload) {
  const client = getServiceRoleClient();
  const row = {
    timestamp: new Date().toISOString(),
    provider: payload.provider,
    model: payload.model,
    input_tokens: payload.inputTokens ?? 0,
    output_tokens: payload.outputTokens ?? 0,
    cached_tokens: payload.cachedTokens ?? 0,
    cost_usd: payload.costUsd ?? 0,
    task_id: payload.taskId ?? null,
    success: payload.success ?? true,
    error: payload.error ?? null,
    audio_minutes: payload.audioMinutes ?? null,
    agent_id: payload.agentId ?? null,
    purpose: payload.purpose ?? null,
  };

  const { data, error } = await client
    .from("team_api_calls")
    .insert(row)
    .select()
    .maybeSingle();

  if (error) {
    // Запись лога не должна валить основной поток — логируем и возвращаем null.
    console.error(`[team] recordApiCall failed: ${error.message}`);
    return null;
  }
  return data;
}

// Все вызовы, привязанные к task_id. Используется для биллинга write_text +
// AI-правок: правки фрагментов биллятся к родительской задаче, не создавая
// новых записей в team_tasks.
export async function getApiCallsByTaskId(taskId) {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_api_calls")
    .select("*")
    .eq("task_id", taskId)
    .order("timestamp", { ascending: true });

  if (error) {
    throw new Error(`Supabase select api_calls by task failed: ${error.message}`);
  }
  return data ?? [];
}

// Все вызовы. Используется агрегаторами расходов (по провайдеру, по модели).
// На больших объёмах добавим серверную агрегацию через rpc, пока — клиент.
export async function getAllApiCalls() {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_api_calls")
    .select("*")
    .order("timestamp", { ascending: false });

  if (error) {
    throw new Error(`Supabase select all api_calls failed: ${error.message}`);
  }
  return data ?? [];
}

// =========================================================================
// team_settings — пользовательские настройки команды
// =========================================================================

// Возвращает значение настройки по ключу (или null если нет).
export async function getSetting(key) {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase select team_settings (${key}) failed: ${error.message}`);
  }
  return data?.value ?? null;
}

// Записывает (или обновляет) настройку.
export async function setSetting(key, value) {
  const client = getServiceRoleClient();
  const { error } = await client
    .from("team_settings")
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );

  if (error) {
    throw new Error(`Supabase upsert team_settings (${key}) failed: ${error.message}`);
  }
}
