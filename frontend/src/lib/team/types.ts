// Типы для раздела «Блог → Команда».
//
// Команда — функциональная копия локальной ДК Лурье внутри Потока. Этап 1 —
// портирование инструмента подготовки экскурсий (5 типов LLM-задач, журнал,
// артефакты, расходы); этап 2 — превратить в систему AI-агентов блога.
//
// Источник правды по схеме БД — supabase/migrations/0012_team_tables.sql.
// Бэкендовые типы и хендлеры — backend/src/services/team/taskHandlers.js.

// ---------- Задачи ----------

// Список расширяется на этапе 2 — поэтому держим как union, а не литерал-enum.
// Если приходит неизвестное значение из БД, типизация позволит обработать
// (см. TASK_TITLES.fallback в коде).
export type TeamTaskType =
  | "ideas_free"
  | "ideas_questions_for_research"
  | "research_direct"
  | "write_text"
  | "edit_text_fragments"
  | (string & {});

// running   — задача в работе (LLM-вызов идёт)
// done      — отработала, ждёт ревью
// revision  — в ревизии (резерв, пока не используется)
// archived  — спрятана из списка
// error     — упала (см. поле error)
// marked_done — пользователь подтвердил «готово»
export type TeamTaskStatus =
  | "running"
  | "done"
  | "revision"
  | "archived"
  | "error"
  | "marked_done";

export interface TeamTaskTokens {
  input?: number | null;
  output?: number | null;
  cached?: number | null;
}

export interface TeamTaskModelChoice {
  preset?: string | null;
  provider?: string | null;
  model?: string | null;
  // Прочие нестандартные поля терпим — модель может расти без миграций.
  [key: string]: unknown;
}

export interface TeamTaskPrompt {
  system?: string | null;
  user?: string | null;
  cacheable_blocks?: unknown;
  template?: string | null;
}

// Предложение агента передать задачу дальше (Сессия 13, пункт 8).
// Парсится из блока «**Suggested Next Steps:**» в ответе LLM. Хранится
// в team_tasks.suggested_next_steps как массив. UI handoff использует
// первое предложение для предзаполнения формы передачи.
export interface SuggestedNextStep {
  agent_name: string;
  suggestion: string;
}

// Снапшот задачи — соответствует одной строке team_tasks.
// Чтобы получить «текущее состояние задачи», нужно сгруппировать по id и
// взять последнюю по created_at (см. dedupe в teamTasksService).
export interface TeamTask {
  id: string;
  type: TeamTaskType;
  title: string | null;
  status: TeamTaskStatus | (string & {});
  params: Record<string, unknown>;
  modelChoice: TeamTaskModelChoice | null;
  provider: string | null;
  model: string | null;
  prompt: TeamTaskPrompt | null;
  promptOverrideUsed: boolean;
  result: string | null;
  artifactPath: string | null;
  tokens: TeamTaskTokens | null;
  costUsd: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  // Сессия 12: id агента-исполнителя (slug). NULL для задач без агента
  // (как в этапе 1).
  agentId: string | null;
  // Сессия 13: id родительской задачи при handoff. NULL для корневых задач.
  parentTaskId: string | null;
  // Сессия 13: предложения агента передать задачу дальше. NULL если блок
  // не был распознан в ответе LLM.
  suggestedNextSteps: SuggestedNextStep[] | null;
  // Сессия 16: id проекта (тега). NULL = «без проекта».
  projectId: string | null;
  // Сессия 29: настройки и результат самопроверки. Дефолт читается из
  // frontmatter шаблона, но Влад мог переопределить вручную при запуске.
  // selfReviewResult пишется один раз после второго LLM-вызова.
  selfReviewEnabled?: boolean | null;
  selfReviewExtraChecks?: string | null;
  selfReviewResult?: SelfReviewResultPayload | null;
  // Сессия 31: уточнения от агента + многошаговая инфраструктура.
  // clarificationQuestions заполняется в статусе clarifying → awaiting_input.
  // clarificationAnswers — после сабмита формы ответами Влада.
  // stepState — состояние многошаговой задачи (Сессия 38, NotebookLM).
  clarificationEnabled?: boolean | null;
  clarificationQuestions?: TaskClarificationQuestion[] | null;
  clarificationAnswers?: TaskClarificationAnswer[] | null;
  stepState?: TaskStepState | null;
  // Сессия 34: id группы для мульти-LLM сравнения (общий у клонов).
  comparisonGroupId?: string | null;
}

// Сессия 31: типы для уточнений и многошаговой задачи.
export interface TaskClarificationQuestion {
  question: string;
  required: boolean;
}

export interface TaskClarificationAnswer {
  question: string;
  answer: string;
}

export interface TaskStepState {
  current_step: number;
  total_steps: number;
  steps: Array<{
    question: string;
    status: "pending" | "done" | (string & {});
    result?: string | null;
  }>;
  accumulated_results: Array<{ question: string; answer: string }>;
  notebook_id?: string | null;
  synthesis_pending?: boolean;
  started_at?: string;
}

// Сессия 29: что лежит в team_tasks.self_review_result (JSONB) после
// успешного второго прохода. Если revised=true и revised_result задан —
// финальный артефакт уже содержит исправленную версию (taskRunner
// перезаписывает Storage и task.result).
export interface SelfReviewChecklistEntry {
  source:
    | "memory_rule"
    | "skill"
    | "template_field"
    | "mission_taboo"
    | "vlad_extra"
    | "tool_manifest"
    | (string & {});
  item: string;
  result: "да" | "нет" | "неприменимо" | (string & {});
  comment: string;
}

export interface SelfReviewResultPayload {
  checklist: SelfReviewChecklistEntry[];
  passed: boolean;
  revised: boolean;
  revised_result?: string;
  parse_error?: string;
  skipped?: boolean;
  reason?: string;
}

// ---------- Журнал API-вызовов ----------

export interface TeamApiCall {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
  taskId: string | null;
  success: boolean;
  error: string | null;
  audioMinutes: number | null;
}

// ---------- Сводки ----------

// Аггрегаты для главной страницы /blog/team. Считаются на сервере и передаются
// в server-component. Не кешируются (это «живой» дашборд).
export interface TeamOverviewStats {
  // Сколько активных задач прямо сейчас (status=running у последнего снапшота).
  activeTasksCount: number;
  // Сколько уникальных задач всего (кроме архивированных). На карточке «Задачи».
  totalTasksCount: number;
  // Сумма cost_usd по всем team_api_calls за последние 30 дней.
  spendingLast30Days: number;
}

// ---------- Админка ----------

// Только статус — никогда не возвращаем сами ключи в браузер. Backend
// дополнительно отдаёт `masked` через /api/team/admin/keys, но для UI
// /blog/team в большинстве мест достаточно булевого статуса.
export interface ApiKeysStatus {
  anthropic: boolean;
  openai: boolean;
  google: boolean;
}
