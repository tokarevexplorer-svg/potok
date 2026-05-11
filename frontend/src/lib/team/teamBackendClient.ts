// Изоморфный клиент для бэкенд-эндпоинтов команды (`/api/team/*`).
//
// Из server components и server actions ходит напрямую через BACKEND_URL,
// подписывая HS256-JWT с email из сессии Auth.js v5 (через `fetchBackend`
// из `@/lib/apiClient`).
//
// Из браузерных компонентов ходит через прокси /api/team-proxy/<path>
// (см. frontend/src/app/api/team-proxy/[...path]/route.ts), потому что
// BACKEND_URL — серверная переменная без NEXT_PUBLIC_ префикса. Прокси
// сам подкладывает Authorization Bearer перед форвардингом на Railway.
//
// Один модуль для обоих контекстов — выбор пути решается в runtime через
// typeof window. Это убирает необходимость дублировать сигнатуры функций
// в server-only и client-only файлах.

import type { ApiKeysStatus, TeamTask, TeamTaskModelChoice, TeamTaskPrompt } from "./types";

// Внутренний хелпер: выбирает путь и шлёт запрос. Возвращает разобранный
// JSON (или null, если ответ пустой). Бросает Error со строкой из {error}
// или с HTTP-статусом, чтобы caller всегда видел понятное сообщение.
async function backendFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<unknown> {
  const isBrowser = typeof window !== "undefined";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  const { timeoutMs = 30_000, ...rest } = init;
  let response: Response;

  if (isBrowser) {
    // Из браузера — относительный путь до своего же Next-сервера, который
    // проксирует на Railway. URL начинается с /api/team/... — превращаем в
    // /api/team-proxy/...
    if (!normalizedPath.startsWith("/api/team/")) {
      throw new Error(
        `backendFetch: ожидался путь с префиксом /api/team/, получено ${normalizedPath}`,
      );
    }
    const url = `/api/team-proxy/${normalizedPath.slice("/api/team/".length)}`;
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
  } else {
    // Server-side: грузим fetchBackend лениво, чтобы исключить случайный
    // импорт server-only-модуля в клиентский bundle. (`server-only` плагин
    // выкинет ошибку на этапе сборки, но без lazy-load TS-резолвер мог бы
    // попытаться разрешить @/auth даже там, где он не нужен.)
    const { fetchBackend, BackendAuthRequiredError } = await import("../apiClient");
    try {
      response = await fetchBackend(normalizedPath, { ...rest, timeoutMs });
    } catch (err) {
      if (err instanceof BackendAuthRequiredError) {
        throw err;
      }
      const message = err instanceof Error ? err.message : "неизвестная ошибка";
      throw new Error(`Бэкенд не отвечает: ${message}`);
    }
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

export interface PreviewPromptResult {
  system: string | null;
  user: string | null;
  cacheableBlocks?: unknown;
  template: string | null;
}

export async function previewPrompt(
  taskType: string,
  params: Record<string, unknown>,
): Promise<PreviewPromptResult> {
  const data = await backendFetch("/api/team/tasks/preview-prompt", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskType, params }),
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
