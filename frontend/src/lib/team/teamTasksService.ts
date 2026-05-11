// Чтение задач команды из team_tasks напрямую через Supabase.
//
// `team_tasks` — append-only журнал: каждое изменение состояния задачи
// = новая строка с тем же `id`. Текущее состояние задачи = последний снапшот.
// Supabase JS клиент не предоставляет DISTINCT ON — делаем dedupe на клиенте,
// сортируя по created_at desc и оставляя по одной записи на id. Для нашего
// масштаба (десятки задач) это приемлемо.
//
// fetchTeamTasks() — серверная (для server components). fetchTeamTasksFromBrowser()
// — клиентская, дёргается из useEffect-поллинга TeamWorkspace через
// getSupabaseBrowserClient().

import {
  createSupabaseServerClient,
  getSupabaseBrowserClient,
} from "@/lib/supabaseClient";
import type {
  SelfReviewResultPayload,
  SuggestedNextStep,
  TeamTask,
  TeamTaskModelChoice,
  TeamTaskPrompt,
  TeamTaskStatus,
  TeamTaskTokens,
  TeamTaskType,
} from "./types";

// snake_case строки из БД — описываем минимально, остальные поля игнорируем.
interface TeamTaskRow {
  id: string;
  type: string;
  title: string | null;
  status: string;
  params: Record<string, unknown> | null;
  model_choice: TeamTaskModelChoice | null;
  provider: string | null;
  model: string | null;
  prompt: TeamTaskPrompt | null;
  prompt_override_used: boolean | null;
  result: string | null;
  artifact_path: string | null;
  tokens: TeamTaskTokens | null;
  cost_usd: number | string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
  // Сессия 12 / 13: добавленные колонки.
  agent_id: string | null;
  parent_task_id: string | null;
  suggested_next_steps: SuggestedNextStep[] | null;
  // Сессия 16
  project_id: string | null;
  // Сессия 29
  self_review_enabled: boolean | null;
  self_review_extra_checks: string | null;
  self_review_result: SelfReviewResultPayload | null;
}

function toNumber(value: number | string | null): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapTask(row: TeamTaskRow): TeamTask {
  return {
    id: row.id,
    type: row.type as TeamTaskType,
    title: row.title,
    status: row.status as TeamTaskStatus,
    params: row.params ?? {},
    modelChoice: row.model_choice ?? null,
    provider: row.provider,
    model: row.model,
    prompt: row.prompt,
    promptOverrideUsed: row.prompt_override_used ?? false,
    result: row.result,
    artifactPath: row.artifact_path,
    tokens: row.tokens,
    costUsd: toNumber(row.cost_usd),
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    agentId: row.agent_id ?? null,
    parentTaskId: row.parent_task_id ?? null,
    suggestedNextSteps: row.suggested_next_steps ?? null,
    projectId: row.project_id ?? null,
    selfReviewEnabled: row.self_review_enabled ?? null,
    selfReviewExtraChecks: row.self_review_extra_checks ?? null,
    selfReviewResult: row.self_review_result ?? null,
  };
}

// Возвращает по одной записи на task id — самый свежий снапшот. Сортировка
// результата — по createdAt свежей задачи в начале.
function dedupeLatest(rows: TeamTaskRow[]): TeamTask[] {
  const latest = new Map<string, TeamTaskRow>();
  for (const row of rows) {
    const existing = latest.get(row.id);
    if (!existing || row.created_at > existing.created_at) {
      latest.set(row.id, row);
    }
  }
  return Array.from(latest.values())
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map(mapTask);
}

const TASK_SELECT =
  "id, type, title, status, params, model_choice, provider, model, prompt, prompt_override_used, result, artifact_path, tokens, cost_usd, error, created_at, updated_at, started_at, finished_at, agent_id, parent_task_id, suggested_next_steps, project_id, self_review_enabled, self_review_extra_checks, self_review_result";

// Все задачи (по последнему снапшоту), включая архивированные.
// Используется на главной для подсчёта статистики и в Сессии 6 как
// initial state канбана.
export async function fetchTeamTasks(): Promise<TeamTask[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("team_tasks")
    .select(TASK_SELECT)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Не удалось загрузить задачи команды: ${error.message}`);
  return dedupeLatest((data ?? []) as TeamTaskRow[]);
}

// Браузерный вариант — для useEffect-поллинга в TeamWorkspace. Дёргает тот же
// запрос через anon-клиент, RLS открыта. Возвращает все задачи (включая
// архивированные) — компонент сам решает, какие показывать.
export async function fetchTeamTasksFromBrowser(): Promise<TeamTask[]> {
  const supabase = getSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("team_tasks")
    .select(TASK_SELECT)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Не удалось загрузить задачи команды: ${error.message}`);
  return dedupeLatest((data ?? []) as TeamTaskRow[]);
}

// Вспомогательная: проверить, есть ли активные (running) задачи —
// чтобы поллинг мог пропускать тики, когда ничего не меняется. На этапе 1
// не используем (всегда поллим), оставляем готовой для оптимизации.
export function hasActiveTasks(tasks: TeamTask[]): boolean {
  return tasks.some((t) => t.status === "running");
}
