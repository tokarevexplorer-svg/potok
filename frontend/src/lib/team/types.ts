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
