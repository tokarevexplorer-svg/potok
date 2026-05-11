// Клиент раздела «Память агентов» (Сессия 11 этапа 2).
//
// CRUD над team_agent_memory через /api/team-proxy/memory/* — карточка
// сотрудника использует это для вкладок «Правила» и «Эпизоды».

export type MemoryType = "rule" | "episode";
export type MemoryStatus = "active" | "archived" | "rejected" | "candidate";
export type MemorySource = "manual" | "seed" | "feedback" | "curator";

export interface TeamMemoryItem {
  id: string;
  agent_id: string;
  type: MemoryType;
  content: string;
  source: MemorySource;
  status: MemoryStatus;
  pinned: boolean;
  score: number | null;
  task_id: string | null;
  source_episode_ids: string[] | null;
  created_at: string;
  updated_at: string | null;
  reviewed_at: string | null;
}

async function fetchMemory(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<unknown> {
  const url = `/api/team-proxy/memory${path.startsWith("/") ? path : `/${path}`}`;
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
      // не JSON
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

// Активные правила агента, отсортированные по дате (старые → новые).
export async function fetchRules(agentId: string): Promise<TeamMemoryItem[]> {
  const data = await fetchMemory(`/${encodeURIComponent(agentId)}/rules`, {
    method: "GET",
  });
  const obj = (data ?? {}) as { rules?: TeamMemoryItem[] };
  return obj.rules ?? [];
}

// Эпизоды агента (read-only до Сессии 14 — там парсер заполнит таблицу).
export async function fetchEpisodes(
  agentId: string,
  { status = "active", limit = 100 }: { status?: MemoryStatus | "all"; limit?: number } = {},
): Promise<TeamMemoryItem[]> {
  const params = new URLSearchParams({ type: "episode", status });
  if (limit) params.set("limit", String(limit));
  const data = await fetchMemory(
    `/${encodeURIComponent(agentId)}?${params.toString()}`,
    { method: "GET" },
  );
  const obj = (data ?? {}) as { items?: TeamMemoryItem[] };
  return obj.items ?? [];
}

export async function addRule(
  agentId: string,
  content: string,
  { source = "manual", pinned = false }: { source?: MemorySource; pinned?: boolean } = {},
): Promise<TeamMemoryItem> {
  const data = await fetchMemory(`/${encodeURIComponent(agentId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "rule", content, source, pinned }),
  });
  const obj = (data ?? {}) as { item?: TeamMemoryItem };
  if (!obj.item) throw new Error("Бэкенд не вернул правило");
  return obj.item;
}

export async function updateMemoryItem(
  id: string,
  patch: { content?: string; status?: MemoryStatus; pinned?: boolean },
): Promise<TeamMemoryItem> {
  const data = await fetchMemory(`/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  const obj = (data ?? {}) as { item?: TeamMemoryItem };
  if (!obj.item) throw new Error("Бэкенд не вернул запись памяти");
  return obj.item;
}

export async function archiveMemoryItem(id: string): Promise<TeamMemoryItem> {
  const data = await fetchMemory(`/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  const obj = (data ?? {}) as { item?: TeamMemoryItem };
  if (!obj.item) throw new Error("Бэкенд не вернул запись памяти");
  return obj.item;
}

// =========================================================================
// Сессия 15: кандидаты в правила (status='candidate')
// =========================================================================

// Кандидат + развёрнутая ссылка на агента (PostgREST join'ит team_agents
// под ключ `agent` — см. memoryService.getCandidates).
export interface CandidateAgentRef {
  id: string;
  display_name: string;
  role_title: string | null;
  avatar_url: string | null;
  department: string | null;
  status: string;
}

export type MemoryCandidate = TeamMemoryItem & {
  agent: CandidateAgentRef;
};

export async function fetchCandidates(
  { pendingOnly = true }: { pendingOnly?: boolean } = {},
): Promise<MemoryCandidate[]> {
  const qs = pendingOnly ? "" : "?pending=false";
  const data = await fetchMemory(`/candidates${qs}`, { method: "GET" });
  const obj = (data ?? {}) as { candidates?: MemoryCandidate[] };
  return obj.candidates ?? [];
}
