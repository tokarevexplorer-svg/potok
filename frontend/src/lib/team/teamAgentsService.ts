// Клиент раздела «Сотрудники» (Сессия 9 этапа 2).
//
// Все вызовы идут через тот же прокси /api/team-proxy/<...>, что и
// остальные клиентские модули команды — см. teamBackendClient.ts.

export type AgentStatus = "active" | "paused" | "archived";
export type AgentDepartment = "analytics" | "preproduction" | "production";

// Поля совпадают со схемой team_agents (миграция 0017 + 0018). Все опц.
// поля приходят с бэкенда null'ом — оставлено как есть для прозрачности.
export interface TeamAgent {
  id: string;
  display_name: string;
  role_title: string | null;
  department: AgentDepartment | null;
  avatar_url: string | null;
  biography: string | null;
  status: AgentStatus;
  database_access: unknown[];
  available_tools: string[];
  allowed_task_templates: string[];
  orchestration_mode: boolean;
  autonomy_level: number;
  default_model: string | null;
  // Поля из миграции 0018 — обязательны при создании через мастер.
  // В промпт не идут, нужны для самоконтроля «зачем нужен агент».
  purpose: string | null;
  success_criteria: string | null;
  created_at: string;
  updated_at: string;
}

// Сжатый ростер для Awareness — только базовые поля.
export interface TeamAgentRosterEntry {
  id: string;
  display_name: string;
  role_title: string | null;
  department: AgentDepartment | null;
  status: AgentStatus;
}

export interface TeamAgentHistoryEntry {
  id: string;
  agent_id: string;
  change_type: string;
  old_value: string | null;
  new_value: string | null;
  comment: string | null;
  created_at: string;
}

// Локальный мини-fetch — копия паттерна из teamBackendClient, чтобы не
// тянуть туда новые типы и оставить раздел «агенты» в своём файле.
async function fetchAgents(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<unknown> {
  const url = `/api/team-proxy/agents${path.startsWith("/") ? path : `/${path}`}`;
  const { timeoutMs = 30_000, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    throw new Error(`Бэкенд не отвечает: ${message}`);
  }
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Не JSON — оставляем null, ниже отрапортуем по статусу.
    }
  }
  if (!response.ok) {
    const errorMsg =
      parsed && typeof parsed === "object" && parsed !== null && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new Error(errorMsg);
  }
  return parsed;
}

// =========================================================================
// Чтение
// =========================================================================

export async function listAgents(
  status: AgentStatus | "all" = "active",
): Promise<TeamAgent[]> {
  const qs = `?status=${encodeURIComponent(status)}`;
  const data = await fetchAgents(qs, { method: "GET" });
  const obj = (data ?? {}) as { agents?: TeamAgent[] };
  return obj.agents ?? [];
}

export async function getAgent(id: string): Promise<TeamAgent> {
  const data = await fetchAgents(`/${encodeURIComponent(id)}`, { method: "GET" });
  const obj = (data ?? {}) as { agent?: TeamAgent };
  if (!obj.agent) {
    throw new Error("Бэкенд не вернул агента");
  }
  return obj.agent;
}

export async function fetchAgentRoster(): Promise<TeamAgentRosterEntry[]> {
  const data = await fetchAgents("/roster", { method: "GET" });
  const obj = (data ?? {}) as { roster?: TeamAgentRosterEntry[] };
  return obj.roster ?? [];
}

export async function fetchAgentHistory(
  id: string,
  limit = 50,
): Promise<TeamAgentHistoryEntry[]> {
  const data = await fetchAgents(
    `/${encodeURIComponent(id)}/history?limit=${limit}`,
    { method: "GET" },
  );
  const obj = (data ?? {}) as { history?: TeamAgentHistoryEntry[] };
  return obj.history ?? [];
}

// =========================================================================
// Мутации (используются мастером в пункте 12 — здесь оставлено для CLI/curl
// тестов и чтобы покрыть API целиком).
// =========================================================================

export interface CreateAgentInput {
  id: string;
  display_name: string;
  role_title?: string | null;
  department?: AgentDepartment | null;
  biography?: string | null;
  avatar_url?: string | null;
  default_model?: string | null;
  database_access?: unknown[];
  available_tools?: string[];
  allowed_task_templates?: string[];
  orchestration_mode?: boolean;
  autonomy_level?: 0 | 1;
  comment?: string | null;
  // Сессия 10 — поля мастера создания.
  purpose?: string | null;
  success_criteria?: string | null;
  // Опц.: текст Role-файла (мастер передаёт — бэкенд сохранит в Storage).
  role_content?: string | null;
  // Опц.: массив seed-правил (одно правило — одна строка). Бэкенд добавит в
  // team_agent_memory с source='seed'.
  seed_rules?: string[];
}

export async function createAgent(input: CreateAgentInput): Promise<TeamAgent> {
  const data = await fetchAgents("/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const obj = (data ?? {}) as { agent?: TeamAgent };
  if (!obj.agent) throw new Error("Бэкенд не вернул агента");
  return obj.agent;
}

export interface UpdateAgentInput {
  display_name?: string;
  role_title?: string | null;
  department?: AgentDepartment | null;
  avatar_url?: string | null;
  biography?: string | null;
  database_access?: unknown[];
  available_tools?: string[];
  allowed_task_templates?: string[];
  orchestration_mode?: boolean;
  autonomy_level?: 0 | 1;
  default_model?: string | null;
  purpose?: string | null;
  success_criteria?: string | null;
  comment?: string | null;
}

export async function updateAgent(id: string, input: UpdateAgentInput): Promise<TeamAgent> {
  const data = await fetchAgents(`/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const obj = (data ?? {}) as { agent?: TeamAgent };
  if (!obj.agent) throw new Error("Бэкенд не вернул агента");
  return obj.agent;
}

export async function archiveAgent(id: string, comment?: string): Promise<TeamAgent> {
  const data = await fetchAgents(`/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: comment ? JSON.stringify({ comment }) : undefined,
  });
  const obj = (data ?? {}) as { agent?: TeamAgent };
  if (!obj.agent) throw new Error("Бэкенд не вернул агента");
  return obj.agent;
}

// =========================================================================
// Role-файл (Сессия 11)
// =========================================================================

export async function fetchAgentRole(id: string): Promise<string | null> {
  const data = await fetchAgents(`/${encodeURIComponent(id)}/role`, {
    method: "GET",
  });
  const obj = (data ?? {}) as { content?: string | null };
  return obj.content ?? null;
}

export async function saveAgentRole(
  id: string,
  content: string,
  comment?: string | null,
): Promise<{ content: string; changed: boolean }> {
  const body: Record<string, unknown> = { content };
  if (comment) body.comment = comment;
  const data = await fetchAgents(`/${encodeURIComponent(id)}/role`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const obj = (data ?? {}) as { content?: string; changed?: boolean };
  return { content: obj.content ?? content, changed: !!obj.changed };
}

export async function restoreAgent(id: string, comment?: string): Promise<TeamAgent> {
  const data = await fetchAgents(`/${encodeURIComponent(id)}/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: comment ? JSON.stringify({ comment }) : undefined,
  });
  const obj = (data ?? {}) as { agent?: TeamAgent };
  if (!obj.agent) throw new Error("Бэкенд не вернул агента");
  return obj.agent;
}

export async function pauseAgent(id: string, comment?: string): Promise<TeamAgent> {
  const data = await fetchAgents(`/${encodeURIComponent(id)}/pause`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: comment ? JSON.stringify({ comment }) : undefined,
  });
  const obj = (data ?? {}) as { agent?: TeamAgent };
  if (!obj.agent) throw new Error("Бэкенд не вернул агента");
  return obj.agent;
}

// =========================================================================
// Мастер создания (Сессия 10)
// =========================================================================

export interface DraftRoleMessage {
  role: "user" | "assistant";
  content: string;
}

export interface DraftRoleResult {
  response: string;
  tokens?: { input: number; output: number; cached: number };
}

// Чат с LLM для черновика Role на шаге 2 мастера. Сервер собирает системный
// промпт сам — фронт передаёт только историю диалога и метаданные агента.
export async function draftRole(input: {
  messages: DraftRoleMessage[];
  display_name: string;
  role_title?: string;
}): Promise<DraftRoleResult> {
  const data = await fetchAgents("/draft-role", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    timeoutMs: 60_000,
  });
  return (data ?? {}) as DraftRoleResult;
}

export interface TestRunResult {
  response: string;
  tokens?: { input: number; output: number; cached: number };
}

// Тестовый полигон на шаге 3 мастера. Прогон НЕ записывается в team_tasks —
// это разовый sanity-check. Расход уходит в team_api_calls с purpose='test_run'.
export async function testRunAgent(input: {
  role: string;
  seed_rules: string[];
  model: string;
  provider?: string;
  query: string;
}): Promise<TestRunResult> {
  const data = await fetchAgents("/test-run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    timeoutMs: 60_000,
  });
  return (data ?? {}) as TestRunResult;
}

// =========================================================================
// UI-хелперы
// =========================================================================

export const DEPARTMENT_LABELS: Record<AgentDepartment, string> = {
  analytics: "Аналитика",
  preproduction: "Предпродакшн",
  production: "Продакшн",
};

export const STATUS_LABELS: Record<AgentStatus, string> = {
  active: "Активен",
  paused: "На паузе",
  archived: "В архиве",
};
