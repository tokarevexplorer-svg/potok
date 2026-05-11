// Клиент для бэкенд-эндпоинтов команды (`/api/team/*`) из браузера.
//
// Все вызовы идут через прокси /api/team-proxy/<path>
// (см. frontend/src/app/api/team-proxy/[...path]/route.ts), потому что
// BACKEND_URL — серверная переменная без NEXT_PUBLIC_ префикса. Прокси
// сам вытягивает email из сессии Auth.js v5 и подкладывает
// Authorization Bearer перед форвардингом на Railway.
//
// ВАЖНО: этот модуль предназначен для КЛИЕНТСКИХ компонентов. На server-
// side он будет работать только в Node-окружении Next.js (где fetch
// относительных URL резолвится против self) — но рекомендуется на сервере
// использовать `fetchBackend` из `@/lib/apiClient` напрямую (это короче
// один хоп и не требует прокси-роута). Подмешивать сюда `apiClient` через
// dynamic import нельзя — webpack включает его в клиентский bundle и
// падает на `server-only` импорте (jsonwebtoken, auth, NEXTAUTH_SECRET).

import type { ApiKeysStatus, TeamTask, TeamTaskModelChoice, TeamTaskPrompt } from "./types";

// Ошибка от backend'а с HTTP-статусом и распарсенным телом. Нужна для тех
// случаев, когда UI должен реагировать на конкретный код (например, 409 от
// эндпоинта постановки задачи — превышен дневной лимит расходов).
export class BackendApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.name = "BackendApiError";
    this.status = status;
    this.data = data;
  }
}

// Внутренний хелпер: шлёт запрос через прокси и возвращает разобранный
// JSON (или null, если ответ пустой). Бросает BackendApiError со строкой
// из {error} или с HTTP-статусом, чтобы caller всегда видел понятное
// сообщение и при необходимости — статус и тело.
async function backendFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<unknown> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!normalizedPath.startsWith("/api/team/")) {
    throw new Error(
      `backendFetch: ожидался путь с префиксом /api/team/, получено ${normalizedPath}`,
    );
  }
  const url = `/api/team-proxy/${normalizedPath.slice("/api/team/".length)}`;

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
    throw new BackendApiError(errorMsg, response.status, parsed);
  }

  return parsed;
}

// =========================================================================
// Админка: ключи и статус
// =========================================================================

export async function fetchKeysStatus(): Promise<ApiKeysStatus> {
  const data = await backendFetch("/api/team/admin/keys-status", { method: "GET" });
  const obj = (data ?? {}) as Record<string, unknown>;
  return {
    anthropic: Boolean(obj.anthropic),
    openai: Boolean(obj.openai),
    google: Boolean(obj.google),
  };
}

export async function fetchKeysStatusSafe(): Promise<ApiKeysStatus | null> {
  try {
    return await fetchKeysStatus();
  } catch (err) {
    console.warn("[teamBackendClient] keys-status недоступен:", err);
    return null;
  }
}

// =========================================================================
// Конфиг моделей: пресеты + pricing + ключи
// =========================================================================

// Сырая структура pricing.json — не конкретизируем все поля, в UI
// используется только список моделей с провайдером.
export interface PricingModel {
  id: string;
  provider?: string | null;
  label?: string | null;
  input_per_million?: number | null;
  output_per_million?: number | null;
  cached_input_per_million?: number | null;
}
export interface PricingFile {
  models?: PricingModel[];
  // Старый формат — {provider: {model_id: {...}}}. UI понимает оба.
  [provider: string]: unknown;
}

// Пресет ссылается на модель по id; per-task override приоритетнее default.
export interface ModelPreset {
  default?: string;
  ideas_free?: string;
  ideas_questions_for_research?: string;
  research_direct?: string;
  write_text?: string;
  edit_text_fragments?: string;
  // Прочие поля (label, description) — терпим.
  label?: string;
  description?: string;
  [key: string]: unknown;
}
export type PresetsFile = Record<string, ModelPreset>;

export interface ModelsConfig {
  presets: PresetsFile;
  pricing: PricingFile;
  keys: ApiKeysStatus | null;
}

export async function fetchModelsConfig(): Promise<ModelsConfig> {
  const data = await backendFetch("/api/team/admin/models-config", { method: "GET" });
  const obj = (data ?? {}) as Record<string, unknown>;
  return {
    presets: (obj.presets ?? {}) as PresetsFile,
    pricing: (obj.pricing ?? {}) as PricingFile,
    keys: (obj.keys ?? null) as ApiKeysStatus | null,
  };
}

// =========================================================================
// Задачи: запуск, превью промпта, управление
// =========================================================================

export interface TaskTemplate {
  type: string;
  title: string;
  hiddenInLog: boolean;
}

export async function fetchTaskTemplates(): Promise<TaskTemplate[]> {
  const data = await backendFetch("/api/team/tasks/templates", { method: "GET" });
  const obj = (data ?? {}) as { templates?: TaskTemplate[] };
  return obj.templates ?? [];
}

// Один из 7 слоёв многослойной сборки промпта (Сессия 6 этапа 2).
// loaded=false означает, что слой пропускается на этапе сборки — например,
// агент не указан, файл отсутствует или таблица memory пуста.
export interface PromptLayer {
  key:
    | "mission"
    | "author_profile"
    | "role"
    | "goals"
    | "memory"
    | "skills"
    | "task";
  content: string;
  cacheable: boolean;
  loaded: boolean;
}

export interface PromptLayersSummary {
  layers_loaded: string[];
  layers_skipped: string[];
  total_tokens_estimate: number;
  cache_eligible_tokens: number;
}

export interface PreviewPromptResult {
  system: string | null;
  user: string | null;
  cacheableBlocks?: unknown;
  template: string | null;
  // Поля добавлены в Сессии 6 — могут отсутствовать, если бэкенд старее.
  layers?: PromptLayer[];
  layeredPreview?: string;
  summary?: PromptLayersSummary;
}

export async function previewPrompt(
  taskType: string,
  params: Record<string, unknown>,
  agentId?: string | null,
): Promise<PreviewPromptResult> {
  // Сессия 12: agentId — top-level поле, бэкенд подмешивает в variables как
  // `agent_id`, чтобы превью отражало Role/Memory/Awareness выбранного агента.
  const body: Record<string, unknown> = { taskType, params };
  if (agentId) body.agentId = agentId;
  const data = await backendFetch("/api/team/tasks/preview-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const obj = (data ?? {}) as { prompt?: PreviewPromptResult };
  return obj.prompt ?? { system: null, user: null, cacheableBlocks: [], template: null };
}

export interface RunTaskParams {
  taskType: string;
  params: Record<string, unknown>;
  modelChoice?: TeamTaskModelChoice | null;
  promptOverride?: TeamTaskPrompt | null;
  title?: string | null;
  // Сессия 12: опц. id агента-исполнителя. С агентом промпт собирается с
  // Role + Memory + Awareness; без агента — как раньше (только Mission/Goals).
  agentId?: string | null;
  // Сессия 13: handoff. parentTaskId — id исходной задачи цепочки.
  // attachParentArtifact=true — бэкенд подмешает контент артефакта родителя
  // в params.user_input как блок «## Контекст из задачи …».
  parentTaskId?: string | null;
  attachParentArtifact?: boolean;
  // Сессия 16: проект-тег задачи. NULL = «без проекта».
  projectId?: string | null;
  // Сессия 29: чекбокс «Самопроверка». null = взять frontmatter-дефолт шаблона.
  selfReviewEnabled?: boolean | null;
  // Сессия 29: доп. пункты чек-листа от Влада. Текст по строке.
  selfReviewExtraChecks?: string | null;
}

// Сессия 29: frontmatter-дефолты шаблона задачи. Сейчас один ключ —
// self_review_default; в будущем сюда же может прийти batch_default (пункт 22).
export interface TaskTemplateDefaults {
  self_review_default?: boolean;
  [key: string]: unknown;
}

export async function fetchTaskTemplateDefaults(
  taskType: string,
): Promise<TaskTemplateDefaults> {
  const data = await backendFetch(
    `/api/team/tasks/template-defaults/${encodeURIComponent(taskType)}`,
    { method: "GET" },
  );
  const obj = (data ?? {}) as { defaults?: TaskTemplateDefaults };
  return obj.defaults ?? {};
}

export async function runTask(input: RunTaskParams): Promise<string> {
  const data = await backendFetch("/api/team/tasks/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const obj = (data ?? {}) as { taskId?: string };
  if (!obj.taskId) {
    throw new Error("Бэкенд не вернул taskId");
  }
  return obj.taskId;
}

export async function archiveTask(taskId: string): Promise<TeamTask> {
  const data = await backendFetch(`/api/team/tasks/${taskId}/archive`, { method: "POST" });
  return ((data ?? {}) as { task?: TeamTask }).task as TeamTask;
}

export async function renameTask(taskId: string, title: string): Promise<TeamTask> {
  const data = await backendFetch(`/api/team/tasks/${taskId}/rename`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  return ((data ?? {}) as { task?: TeamTask }).task as TeamTask;
}

export async function markTaskDone(taskId: string): Promise<TeamTask> {
  const data = await backendFetch(`/api/team/tasks/${taskId}/mark-done`, { method: "POST" });
  return ((data ?? {}) as { task?: TeamTask }).task as TeamTask;
}

// =========================================================================
// Сессия 13: handoff и цепочки задач
// =========================================================================

// Краткая выдержка из team_tasks для отображения связей. Эндпоинт /chain
// возвращает массив этих строк — от корневой задачи до самой свежей дочерней
// (BFS, отсортирован по created_at). Поля выровнены под snake_case ответа.
export interface TaskChainEntry {
  id: string;
  title: string | null;
  type: string;
  status: string;
  agent_id: string | null;
  parent_task_id: string | null;
  suggested_next_steps:
    | { agent_name: string; suggestion: string }[]
    | null;
  created_at: string;
}

export interface TaskChainResult {
  chain: TaskChainEntry[];
  current_index: number;
  total: number;
}

export async function fetchTaskChain(taskId: string): Promise<TaskChainResult> {
  const data = await backendFetch(`/api/team/tasks/${taskId}/chain`, { method: "GET" });
  return data as TaskChainResult;
}

// Получение одной задачи по id (без всех логов). Используется в HandoffModal,
// чтобы загрузить родительскую задачу для отображения в шапке цепочки.
export async function fetchTaskById(taskId: string): Promise<TeamTask> {
  const data = await backendFetch(`/api/team/tasks/${taskId}`, { method: "GET" });
  return ((data ?? {}) as { task?: TeamTask }).task as TeamTask;
}

// =========================================================================
// Сессия 14: обратная связь — эпизоды
// =========================================================================

export interface FeedbackEpisode {
  id: string;
  agent_id: string;
  task_id: string | null;
  channel: "task_card" | "telegram" | "edit_diff";
  score: number | null;
  raw_input: string;
  parsed_text: string | null;
  status: "active" | "compressed_to_rule" | "dismissed" | "archived";
  created_at: string;
}

// Сохранить эпизод обратной связи. comment может быть пустым при score=5.
// Backend парсит комментарий через LLM, записывая нейтрализованный
// parsed_text. Возвращает сохранённый эпизод.
export async function saveFeedback(input: {
  agentId: string;
  taskId?: string | null;
  score: number;
  comment?: string;
  channel?: "task_card" | "telegram" | "edit_diff";
}): Promise<FeedbackEpisode> {
  const data = await backendFetch("/api/team/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agent_id: input.agentId,
      task_id: input.taskId ?? null,
      score: input.score,
      comment: input.comment ?? "",
      channel: input.channel ?? "task_card",
    }),
    // LLM-вызов парсера — короткий, но дать запас на холодный старт.
    timeoutMs: 30_000,
  });
  return ((data ?? {}) as { episode?: FeedbackEpisode }).episode as FeedbackEpisode;
}

export async function fetchFeedbackEpisodes(
  agentId: string,
  options: { status?: "active" | "all"; limit?: number; offset?: number } = {},
): Promise<FeedbackEpisode[]> {
  const qs = new URLSearchParams();
  qs.set("status", options.status ?? "active");
  if (typeof options.limit === "number") qs.set("limit", String(options.limit));
  if (typeof options.offset === "number") qs.set("offset", String(options.offset));
  const data = await backendFetch(
    `/api/team/feedback/${encodeURIComponent(agentId)}?${qs.toString()}`,
    { method: "GET" },
  );
  return ((data ?? {}) as { episodes?: FeedbackEpisode[] }).episodes ?? [];
}

// =========================================================================
// Сессия 16: проекты (теги задач)
// =========================================================================

export interface TeamProject {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "archived";
  created_at: string;
}

export async function fetchProjects(
  status: "active" | "archived" | "all" = "active",
): Promise<TeamProject[]> {
  const data = await backendFetch(
    `/api/team/projects?status=${encodeURIComponent(status)}`,
    { method: "GET" },
  );
  return ((data ?? {}) as { projects?: TeamProject[] }).projects ?? [];
}

export async function createProject(input: {
  name: string;
  description?: string | null;
  id?: string;
}): Promise<TeamProject> {
  const data = await backendFetch("/api/team/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return ((data ?? {}) as { project?: TeamProject }).project as TeamProject;
}

export async function updateProject(
  id: string,
  patch: { name?: string; description?: string | null; status?: "active" | "archived" },
): Promise<TeamProject> {
  const data = await backendFetch(`/api/team/projects/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return ((data ?? {}) as { project?: TeamProject }).project as TeamProject;
}

// =========================================================================
// Сессия 20/21: инструменты команды
// =========================================================================

export type ToolType = "executor" | "system";
export type ToolStatus = "active" | "inactive" | "error";

export interface TeamTool {
  id: string;
  name: string;
  description: string | null;
  tool_type: ToolType;
  manifest_path: string | null;
  connection_config: Record<string, unknown>;
  status: ToolStatus;
  created_at: string;
  updated_at: string;
}

export async function fetchTools(type: ToolType | "all" = "all"): Promise<TeamTool[]> {
  const data = await backendFetch(
    `/api/team/tools?type=${encodeURIComponent(type)}`,
    { method: "GET" },
  );
  return ((data ?? {}) as { tools?: TeamTool[] }).tools ?? [];
}

export async function fetchTool(id: string): Promise<TeamTool> {
  const data = await backendFetch(`/api/team/tools/${encodeURIComponent(id)}`, {
    method: "GET",
  });
  return ((data ?? {}) as { tool?: TeamTool }).tool as TeamTool;
}

export async function updateTool(
  id: string,
  patch: Partial<{
    name: string;
    description: string | null;
    status: ToolStatus;
    connection_config: Record<string, unknown>;
  }>,
): Promise<TeamTool> {
  const data = await backendFetch(`/api/team/tools/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return ((data ?? {}) as { tool?: TeamTool }).tool as TeamTool;
}

export async function fetchToolManifest(id: string): Promise<string | null> {
  const data = await backendFetch(
    `/api/team/tools/${encodeURIComponent(id)}/manifest`,
    { method: "GET" },
  );
  const obj = (data ?? {}) as { content?: string | null };
  return obj.content ?? null;
}

export async function fetchAgentTools(
  agentId: string,
  options: { onlyActive?: boolean } = {},
): Promise<TeamTool[]> {
  const qs = options.onlyActive ? "?only_active=true" : "";
  const data = await backendFetch(
    `/api/team/tools/by-agent/${encodeURIComponent(agentId)}${qs}`,
    { method: "GET" },
  );
  return ((data ?? {}) as { tools?: TeamTool[] }).tools ?? [];
}

export async function setAgentTools(agentId: string, toolIds: string[]): Promise<string[]> {
  const data = await backendFetch(
    `/api/team/tools/by-agent/${encodeURIComponent(agentId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool_ids: toolIds }),
    },
  );
  return ((data ?? {}) as { tool_ids?: string[] }).tool_ids ?? [];
}

// =========================================================================
// Сессия 22/23: предложения от агентов
// =========================================================================

export type ProposalStatus = "pending" | "accepted" | "rejected" | "expired";
export type ProposalKind = "regular" | "urgent" | "next_step";

export interface TeamProposal {
  id: string;
  agent_id: string;
  triggered_by: string;
  kind: ProposalKind;
  payload: {
    what?: string;
    why?: string;
    benefit?: string;
    estimated_cost?: string;
    vlad_time?: string;
    urgency?: "regular" | "urgent";
    [k: string]: unknown;
  };
  status: ProposalStatus;
  created_at: string;
  decided_at: string | null;
  resulting_task_id: string | null;
}

export interface AgentDiaryEntry {
  id: string;
  agent_id: string;
  triggered_by: string;
  reason_to_skip: string;
  created_at: string;
}

export async function fetchProposals(
  options: { agentId?: string; status?: ProposalStatus; limit?: number } = {},
): Promise<TeamProposal[]> {
  const qs = new URLSearchParams();
  if (options.agentId) qs.set("agent_id", options.agentId);
  if (options.status) qs.set("status", options.status);
  if (typeof options.limit === "number") qs.set("limit", String(options.limit));
  const path = qs.toString() ? `/api/team/proposals?${qs.toString()}` : "/api/team/proposals";
  const data = await backendFetch(path, { method: "GET" });
  return ((data ?? {}) as { proposals?: TeamProposal[] }).proposals ?? [];
}

export async function acceptProposal(
  id: string,
  overrides: {
    brief?: string;
    task_type?: string;
    title?: string | null;
    project_id?: string | null;
  } = {},
): Promise<{ proposal: TeamProposal; task_id: string }> {
  const data = await backendFetch(
    `/api/team/proposals/${encodeURIComponent(id)}/accept`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(overrides),
    },
  );
  return data as { proposal: TeamProposal; task_id: string };
}

export async function rejectProposal(id: string): Promise<TeamProposal> {
  const data = await backendFetch(
    `/api/team/proposals/${encodeURIComponent(id)}/reject`,
    { method: "PATCH" },
  );
  return ((data ?? {}) as { proposal?: TeamProposal }).proposal as TeamProposal;
}

export async function fetchAgentDiary(
  agentId: string,
  options: { limit?: number; offset?: number } = {},
): Promise<AgentDiaryEntry[]> {
  const qs = new URLSearchParams();
  if (typeof options.limit === "number") qs.set("limit", String(options.limit));
  if (typeof options.offset === "number") qs.set("offset", String(options.offset));
  const path = `/api/team/proposals/by-agent/${encodeURIComponent(agentId)}/diary${
    qs.toString() ? `?${qs.toString()}` : ""
  }`;
  const data = await backendFetch(path, { method: "GET" });
  return ((data ?? {}) as { entries?: AgentDiaryEntry[] }).entries ?? [];
}

// =========================================================================
// Сессия 23: глобальный тумблер «Проактивность команды»
// =========================================================================

export interface AutonomyStatus {
  enabled: boolean;
  spent_30d_usd: number;
}

export async function fetchAutonomyStatus(): Promise<AutonomyStatus> {
  const data = await backendFetch("/api/team/admin/autonomy", { method: "GET" });
  const obj = (data ?? {}) as Partial<AutonomyStatus>;
  return {
    enabled: !!obj.enabled,
    spent_30d_usd: typeof obj.spent_30d_usd === "number" ? obj.spent_30d_usd : 0,
  };
}

export async function setAutonomyEnabled(enabled: boolean): Promise<void> {
  await backendFetch("/api/team/admin/autonomy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ enabled }),
  });
}

// =========================================================================
// Сессия 25: навыки агента (markdown в Storage с YAML frontmatter)
// =========================================================================

export type SkillStatus = "active" | "pinned" | "archived";

export interface TeamSkill {
  slug: string;
  path: string;
  skill_name: string;
  status: SkillStatus;
  use_count: number;
  last_used: string | null;
  created_at: string | null;
  source_task_id: string | null;
  when_to_apply: string;
  what_to_do: string;
  why_it_works: string;
  raw_body: string;
}

export async function fetchAgentSkills(
  agentId: string,
  options: { statuses?: "all" | SkillStatus[] } = {},
): Promise<TeamSkill[]> {
  const param =
    options.statuses === "all"
      ? "all"
      : Array.isArray(options.statuses)
        ? options.statuses.join(",")
        : "active,pinned";
  const data = await backendFetch(
    `/api/team/skills/${encodeURIComponent(agentId)}?statuses=${encodeURIComponent(param)}`,
    { method: "GET" },
  );
  return ((data ?? {}) as { skills?: TeamSkill[] }).skills ?? [];
}

export async function createAgentSkill(
  agentId: string,
  input: {
    skill_name: string;
    when_to_apply: string;
    what_to_do: string;
    why_it_works?: string;
    task_id?: string;
    status?: SkillStatus;
  },
): Promise<TeamSkill> {
  const data = await backendFetch(
    `/api/team/skills/${encodeURIComponent(agentId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  return ((data ?? {}) as { skill?: TeamSkill }).skill as TeamSkill;
}

export async function updateAgentSkill(
  agentId: string,
  slug: string,
  patch: Partial<{
    skill_name: string;
    when_to_apply: string;
    what_to_do: string;
    why_it_works: string;
    status: SkillStatus;
  }>,
): Promise<TeamSkill> {
  const data = await backendFetch(
    `/api/team/skills/${encodeURIComponent(agentId)}/${encodeURIComponent(slug)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  return ((data ?? {}) as { skill?: TeamSkill }).skill as TeamSkill;
}

export async function archiveAgentSkill(agentId: string, slug: string): Promise<TeamSkill> {
  const data = await backendFetch(
    `/api/team/skills/${encodeURIComponent(agentId)}/${encodeURIComponent(slug)}/archive`,
    { method: "PATCH" },
  );
  return ((data ?? {}) as { skill?: TeamSkill }).skill as TeamSkill;
}

export async function pinAgentSkill(agentId: string, slug: string): Promise<TeamSkill> {
  const data = await backendFetch(
    `/api/team/skills/${encodeURIComponent(agentId)}/${encodeURIComponent(slug)}/pin`,
    { method: "PATCH" },
  );
  return ((data ?? {}) as { skill?: TeamSkill }).skill as TeamSkill;
}

export async function deleteAgentSkill(agentId: string, slug: string): Promise<void> {
  await backendFetch(
    `/api/team/skills/${encodeURIComponent(agentId)}/${encodeURIComponent(slug)}`,
    { method: "DELETE" },
  );
}

// =========================================================================
// Сессия 26/27: кандидаты в навыки (team_skill_candidates)
// =========================================================================

export interface SkillCandidateAgent {
  id: string;
  display_name: string;
  role_title: string | null;
  avatar_url: string | null;
  department: string | null;
  status: string;
}

export interface SkillCandidate {
  id: string;
  agent_id: string;
  task_id: string | null;
  score: number | null;
  skill_name: string;
  when_to_apply: string;
  what_to_do: string;
  why_it_works: string;
  status: "pending" | "approved" | "rejected" | "expired";
  vlad_comment: string | null;
  created_at: string;
  reviewed_at: string | null;
  agent: SkillCandidateAgent;
}

export async function fetchSkillCandidates(
  options: {
    status?: "pending" | "approved" | "rejected" | "expired" | "all";
    agentId?: string;
  } = {},
): Promise<SkillCandidate[]> {
  const qs = new URLSearchParams();
  qs.set("status", options.status ?? "pending");
  if (options.agentId) qs.set("agent_id", options.agentId);
  const data = await backendFetch(
    `/api/team/skill-candidates?${qs.toString()}`,
    { method: "GET" },
  );
  return ((data ?? {}) as { candidates?: SkillCandidate[] }).candidates ?? [];
}

export async function approveSkillCandidate(
  id: string,
  overrides: {
    skill_name?: string;
    when_to_apply?: string;
    what_to_do?: string;
    why_it_works?: string;
  } = {},
): Promise<{ candidate: SkillCandidate; skill: TeamSkill }> {
  const data = await backendFetch(
    `/api/team/skill-candidates/${encodeURIComponent(id)}/approve`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(overrides),
    },
  );
  return data as { candidate: SkillCandidate; skill: TeamSkill };
}

export async function rejectSkillCandidate(
  id: string,
  vladComment?: string,
): Promise<SkillCandidate> {
  const data = await backendFetch(
    `/api/team/skill-candidates/${encodeURIComponent(id)}/reject`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(vladComment ? { vlad_comment: vladComment } : {}),
    },
  );
  return ((data ?? {}) as { candidate?: SkillCandidate }).candidate as SkillCandidate;
}

export interface AppendQuestionResult {
  success: boolean;
  appended_text: string;
  cost_usd: number;
}

export async function appendQuestion(
  taskId: string,
  question: string,
  modelChoice?: TeamTaskModelChoice | null,
): Promise<AppendQuestionResult> {
  const data = await backendFetch(`/api/team/tasks/${taskId}/append-question`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, modelChoice: modelChoice ?? null }),
    // Дополнительный вопрос делает повторный fetch источника + LLM-вызов.
    // 30 сек по дефолту мало; синхронизируем с maxDuration прокси (60 сек).
    timeoutMs: 60_000,
  });
  return data as AppendQuestionResult;
}

export interface AiEdit {
  fragment: string;
  instruction: string;
}

export interface ApplyAiEditResult {
  version: number;
  path: string;
  name: string;
  provider: string;
  model: string;
  tokens: { input: number; output: number; cached: number };
}

export async function applyAiEdit(
  taskId: string,
  payload: {
    fullText: string;
    edits: AiEdit[];
    generalInstruction?: string;
    modelChoice?: TeamTaskModelChoice | null;
    promptOverride?: TeamTaskPrompt | null;
  },
): Promise<ApplyAiEditResult> {
  const data = await backendFetch(`/api/team/tasks/${taskId}/apply-ai-edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    // LLM-вызов через write_text-цепочку: claude-haiku 5–15 сек, sonnet
    // 10–40 сек, плюс Storage upload + recordCall + refreshTaskCost. Дефолт
    // 30 сек обрезал ответ до того, как backend успевал записать новую
    // версию. Синхронизируем с maxDuration прокси (60 сек).
    timeoutMs: 60_000,
  });
  return data as ApplyAiEditResult;
}

export interface SaveDirectEditResult {
  version: number;
  path: string;
  name: string;
}

export async function saveDirectEdit(
  taskId: string,
  content: string,
): Promise<SaveDirectEditResult> {
  const data = await backendFetch(`/api/team/tasks/${taskId}/save-direct-edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  return data as SaveDirectEditResult;
}

// =========================================================================
// Версии артефакта write_text
// =========================================================================

export interface TaskVersion {
  version: number;
  name: string;
  path: string;
  createdAt: string | null;
  updatedAt: string | null;
  size: number | null;
  content?: string | null;
}

export async function fetchTaskVersions(
  taskId: string,
  options: { withContent?: boolean } = {},
): Promise<TaskVersion[]> {
  const qs = options.withContent ? "?withContent=1" : "";
  const data = await backendFetch(`/api/team/tasks/${taskId}/versions${qs}`, {
    method: "GET",
  });
  const obj = (data ?? {}) as { versions?: TaskVersion[] };
  return obj.versions ?? [];
}

export async function fetchVersionContent(taskId: string, path: string): Promise<string> {
  if (typeof path !== "string" || !path.trim()) {
    // Защита от случая, когда caller потерял path где-то по пути (race
    // условия в state, fallback после таймаута). Без этого ошибка ушла бы
    // в backend и вернулась как «path обязателен» — пользователь увидел бы
    // её в UI без понятной причины.
    throw new Error("Внутренняя ошибка: пустой путь до версии");
  }
  const data = await backendFetch(
    `/api/team/tasks/${taskId}/version-content?path=${encodeURIComponent(path.trim())}`,
    { method: "GET" },
  );
  const obj = (data ?? {}) as { content?: string };
  return obj.content ?? "";
}

// =========================================================================
// Голос: транскрипция через Whisper
// =========================================================================

export interface TranscribeResult {
  text: string;
  durationSeconds: number | null;
  costUsd: number;
}

// Принимает Blob с аудио (webm/ogg/mp3/wav). Сам отправляет multipart.
export async function transcribeVoice(blob: Blob, filename = "voice.webm"): Promise<TranscribeResult> {
  const form = new FormData();
  form.append("audio", blob, filename);
  // Multipart требует, чтобы браузер сам выставил boundary — Content-Type
  // не задаём.
  const data = await backendFetch("/api/team/voice/transcribe", {
    method: "POST",
    body: form,
    timeoutMs: 90_000, // Whisper может обрабатывать длинные записи
  });
  return data as TranscribeResult;
}

// =========================================================================
// Артефакты в team-database
// =========================================================================

export async function uploadArtifact(path: string, content: string): Promise<void> {
  await backendFetch("/api/team/artifacts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, content }),
  });
}

export async function deleteArtifact(path: string): Promise<void> {
  await backendFetch("/api/team/artifacts", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

export async function moveArtifact(fromPath: string, toPath: string): Promise<void> {
  await backendFetch("/api/team/artifacts/move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fromPath, toPath }),
  });
}

export async function createArtifactFolder(path: string): Promise<void> {
  await backendFetch("/api/team/artifacts/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

export async function deleteArtifactFolder(path: string): Promise<void> {
  await backendFetch("/api/team/artifacts/folders", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
}

// =========================================================================
// Шаблоны промптов
// =========================================================================

export async function savePromptTemplate(name: string, content: string): Promise<void> {
  await backendFetch("/api/team/prompts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content }),
  });
}

export interface RefinePromptResult {
  content: string;
  tokens: { input: number; output: number; cached: number };
  provider: string;
  model: string;
}

export async function refinePromptTemplate(
  content: string,
  instruction: string,
  modelChoice?: TeamTaskModelChoice | null,
): Promise<RefinePromptResult> {
  const data = await backendFetch("/api/team/prompts/refine", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, instruction, modelChoice: modelChoice ?? null }),
    timeoutMs: 60_000,
  });
  return data as RefinePromptResult;
}

// =========================================================================
// Загрузка файлов (multipart)
// =========================================================================

export interface UploadFileResult {
  ok: boolean;
  path: string;
  name: string;
  size: number;
}

// prefix — папка внутри team-database. Дефолт «uploads/». Имя файла бэкенд
// санитизирует и дописывает timestamp перед расширением.
export async function uploadFile(file: File, prefix?: string): Promise<UploadFileResult> {
  const form = new FormData();
  form.append("file", file);
  if (prefix) form.append("prefix", prefix);
  const data = await backendFetch("/api/team/files/upload", {
    method: "POST",
    body: form,
    timeoutMs: 120_000,
  });
  return data as UploadFileResult;
}

// =========================================================================
// Админка: ключи (полная инфа), расходы, порог алерта
// =========================================================================

export interface KeyInfo {
  configured: boolean;
  masked: string | null;
  updatedAt: string | null;
}

export interface KeysFullStatus {
  anthropic: KeyInfo;
  openai: KeyInfo;
  google: KeyInfo;
}

export async function fetchKeysFull(): Promise<KeysFullStatus> {
  const data = await backendFetch("/api/team/admin/keys", { method: "GET" });
  const obj = ((data ?? {}) as { keys?: KeysFullStatus }).keys;
  const empty: KeyInfo = { configured: false, masked: null, updatedAt: null };
  return {
    anthropic: obj?.anthropic ?? empty,
    openai: obj?.openai ?? empty,
    google: obj?.google ?? empty,
  };
}

export async function setApiKey(
  provider: "anthropic" | "openai" | "google",
  key: string,
): Promise<void> {
  await backendFetch("/api/team/admin/keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, key }),
  });
}

export async function deleteApiKey(
  provider: "anthropic" | "openai" | "google",
): Promise<void> {
  await backendFetch("/api/team/admin/keys", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider }),
  });
}

export interface SpendingByProvider {
  cost_usd: number;
  calls: number;
}

export interface SpendingByModel {
  provider: string;
  model: string;
  cost_usd: number;
  calls: number;
}

export interface SpendingResult {
  total_usd: number;
  calls: number;
  failed: number;
  by_provider: Record<string, SpendingByProvider>;
  by_model: SpendingByModel[];
  alert_threshold_usd: number | null;
  alert_triggered: boolean;
}

export async function fetchSpending(): Promise<SpendingResult> {
  const data = await backendFetch("/api/team/admin/spending", { method: "GET" });
  return data as SpendingResult;
}

export async function fetchSpendingSafe(): Promise<SpendingResult | null> {
  try {
    return await fetchSpending();
  } catch (err) {
    console.warn("[teamBackendClient] spending недоступен:", err);
    return null;
  }
}

export async function fetchAlertThreshold(): Promise<number | null> {
  const data = await backendFetch("/api/team/admin/alert-threshold", { method: "GET" });
  const obj = (data ?? {}) as { value?: number | null };
  return typeof obj.value === "number" ? obj.value : null;
}

export async function setAlertThreshold(value: number | null): Promise<void> {
  await backendFetch("/api/team/admin/alert-threshold", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value }),
  });
}

// =========================================================================
// Жёсткие лимиты и безопасность доступа (Сессия 2 этапа 2)
// =========================================================================

export interface HardLimits {
  daily: { limit_usd: number; enabled: boolean };
  task: { limit_usd: number; enabled: boolean };
  daily_spent_usd: number;
}

export async function fetchHardLimits(): Promise<HardLimits> {
  const data = await backendFetch("/api/team/admin/limits", { method: "GET" });
  return data as HardLimits;
}

export interface HardLimitsPatch {
  daily_limit_usd?: number;
  daily_enabled?: boolean;
  task_limit_usd?: number;
  task_enabled?: boolean;
}

export async function patchHardLimits(patch: HardLimitsPatch): Promise<HardLimits> {
  const data = await backendFetch("/api/team/admin/limits", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return data as HardLimits;
}

export interface SecuritySettings {
  db_email: string | null;
  env_email: string | null;
  effective_email: string;
}

export async function fetchSecuritySettings(): Promise<SecuritySettings> {
  const data = await backendFetch("/api/team/admin/security", { method: "GET" });
  return data as SecuritySettings;
}

export async function patchSecuritySettings(
  whitelisted_email: string | null,
): Promise<SecuritySettings> {
  const data = await backendFetch("/api/team/admin/security", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ whitelisted_email }),
  });
  return data as SecuritySettings;
}

// ---------------------------------------------------------------------------
// Dev mode (тестовый режим без авторизации) — управление флагом из Админки.
// Backend endpoint: /api/team/admin/dev-mode. Включение требует реальной
// сессии Влада (proxy не синтезирует токен для этого пути).
// ---------------------------------------------------------------------------

export type DevModeHours = 1 | 4 | 12 | 24;

export interface DevModeStatus {
  active: boolean;
  until: string | null;
  auto_disable_hours: number;
}

export async function fetchDevMode(): Promise<DevModeStatus> {
  const data = await backendFetch("/api/team/admin/dev-mode", { method: "GET" });
  return data as DevModeStatus;
}

export async function setDevMode(
  enabled: boolean,
  hours?: DevModeHours,
): Promise<DevModeStatus> {
  const body: Record<string, unknown> = { enabled };
  if (enabled) body.hours = hours;
  const data = await backendFetch("/api/team/admin/dev-mode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return data as DevModeStatus;
}
