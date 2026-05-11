// Сервис парсинга обратной связи (Сессия 14 этапа 2, пункт 9).
//
// Что делает:
//   1. Принимает «сырой» фидбэк Влада на задачу — оценку 0-5 + комментарий
//      (текстовый или транскрипция голосового). Текст пишется в raw_input.
//   2. Вызывает Anthropic-LLM, чтобы переформулировать реакцию в
//      нейтральное наблюдение от третьего лица (parsed_text). Это нужно,
//      чтобы будущий Curator (Сессия 15) собирал из эпизодов кандидатов в
//      правила, не таща в них эмоциональный язык Влада.
//   3. Сохраняет эпизод в team_feedback_episodes (миграция 0022).
//
// Эпизоды НЕ попадают в промпт. Они — сырьё для Curator'а.
//
// При score=5 без комментария — сохраняем эпизод с пустым parsed_text
// (нечего парсить), но всё равно записываем как факт «положительный отзыв».
// Это даст Curator'у возможность находить паттерны «что Владу нравится».

import { downloadFile } from "./teamStorage.js";
import { getServiceRoleClient } from "./teamSupabase.js";
import { call as llmCall, LLMError } from "./llmClient.js";
import { recordCall } from "./costTracker.js";
import { getApiKey } from "./keysService.js";
import { getTaskById } from "./teamSupabase.js";

const TABLE = "team_feedback_episodes";

const VALID_CHANNELS = new Set(["task_card", "telegram", "edit_diff"]);
const VALID_STATUSES = new Set([
  "active",
  "compressed_to_rule",
  "dismissed",
  "archived",
]);

// =========================================================================
// Anthropic-модель для парсинга — общий кеш, как в agents.js
// =========================================================================

const ANTHROPIC_FALLBACK_ALIAS = "claude-sonnet-4-5";
let anthropicModelCache = { value: null, expiresAt: 0 };

async function resolveDefaultAnthropicModel() {
  const now = Date.now();
  if (anthropicModelCache.value && anthropicModelCache.expiresAt > now) {
    return anthropicModelCache.value;
  }
  let id = ANTHROPIC_FALLBACK_ALIAS;
  try {
    const raw = await downloadFile("team-config", "pricing.json");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.models)) {
      const match = parsed.models.find(
        (m) => m && m.provider === "anthropic" && typeof m.id === "string" && m.id.trim(),
      );
      if (match) id = match.id;
    }
  } catch (err) {
    console.warn(
      `[feedbackParser] не удалось получить Anthropic-модель из pricing.json, fallback на «${ANTHROPIC_FALLBACK_ALIAS}»: ${err?.message ?? err}`,
    );
  }
  anthropicModelCache = { value: id, expiresAt: now + 60_000 };
  return id;
}

function assertAgentId(agentId) {
  if (!agentId || typeof agentId !== "string" || !agentId.trim()) {
    throw new Error("agentId обязателен и должен быть непустой строкой.");
  }
}

function assertScore(score) {
  // score — целое 0-5 или null/undefined (для будущего: реакции без оценки).
  if (score === null || score === undefined) return null;
  const n = Number(score);
  if (!Number.isInteger(n) || n < 0 || n > 5) {
    throw new Error("score должен быть целым числом 0–5 или null.");
  }
  return n;
}

// Системный промпт парсера. Заточен под нейтрализацию: убираем
// эмоциональные маркеры, переводим в третье лицо, привязываем к задаче.
const SYSTEM_PROMPT = [
  "Ты обрабатываешь обратную связь Влада (автора блога) агенту AI-редакции.",
  "Переформулируй реакцию в нейтральное наблюдение от третьего лица,",
  "привязанное к контексту задачи.",
  "",
  "Правила:",
  "- Не классифицируй, не оценивай полярность (оценка уже есть отдельно).",
  "- Не пиши преамбулы и не повторяй комментарий дословно.",
  "- Выдай только переформулированный текст, одной-двумя короткими фразами.",
  "- Без квадратных скобок, без markdown, без кавычек.",
].join("\n");

function buildUserPrompt({ taskTitle, score, rawInput }) {
  const lines = [];
  if (taskTitle) lines.push(`Задача: «${taskTitle}»`);
  if (score !== null && score !== undefined) lines.push(`Оценка Влада: ${score}/5`);
  lines.push(`Комментарий Влада: ${rawInput}`);
  return lines.join("\n");
}

// =========================================================================
// Основные функции
// =========================================================================

// parseAndSave — главный entry point из роутов.
//   { agentId, taskId, channel, score, rawInput }
// Возвращает запись team_feedback_episodes (с заполненным parsed_text).
//
// При score=5 без комментария — parsed_text остаётся null, эпизод
// записывается как «голый» позитивный сигнал. Если raw_input пуст и score
// не указан — кидаем ошибку (нечего сохранять).
//
// LLM-вызов опционален: если Anthropic-ключа нет — записываем эпизод
// с parsed_text=null и логируем предупреждение. UI всё равно покажет
// raw_input.
export async function parseAndSave({
  agentId,
  taskId = null,
  channel = "task_card",
  score = null,
  rawInput = "",
}) {
  assertAgentId(agentId);
  const normalizedScore = assertScore(score);
  if (!VALID_CHANNELS.has(channel)) {
    throw new Error(
      `Неизвестный channel «${channel}». Допустимо: task_card, telegram, edit_diff.`,
    );
  }
  const cleanRaw = String(rawInput ?? "").trim();
  if (!cleanRaw && normalizedScore === null) {
    throw new Error("Нужен хотя бы score или текст комментария.");
  }
  // При score=5 без комментария оставляем raw_input как маркер — но в
  // таблице raw_input NOT NULL, поэтому нужен минимальный плейсхолдер.
  const storedRaw = cleanRaw || `Оценка ${normalizedScore}/5 без комментария`;

  // Парсинг через LLM нужен только если есть текстовая часть. Без неё
  // нет смысла генерировать parsed_text (нечего нейтрализовывать).
  let parsedText = null;
  if (cleanRaw) {
    parsedText = await tryParseWithLLM({
      agentId,
      taskId,
      score: normalizedScore,
      rawInput: cleanRaw,
    });
  }

  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .insert({
      agent_id: agentId,
      task_id: taskId ?? null,
      channel,
      score: normalizedScore,
      raw_input: storedRaw,
      parsed_text: parsedText,
      status: "active",
    })
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`Не удалось сохранить эпизод: ${error.message}`);
  }
  return data;
}

// LLM-вызов парсера. Возвращает текст или null. При ошибке Anthropic —
// тихо возвращает null + логирует. Биллинг — отдельной строкой в
// team_api_calls с purpose='feedback_parse', agent_id=агента (а не
// 'system'): это расход на конкретного агента, удобно для будущей
// поагентной аналитики.
async function tryParseWithLLM({ agentId, taskId, score, rawInput }) {
  const key = await getApiKey("anthropic").catch(() => null);
  if (!key) {
    console.warn(
      "[feedbackParser] Anthropic-ключ не найден — эпизод сохранится без parsed_text.",
    );
    return null;
  }

  let taskTitle = null;
  if (taskId) {
    try {
      const t = await getTaskById(taskId);
      taskTitle = t?.title ?? null;
    } catch {
      // тихо — title нужен только для контекста промпта.
    }
  }

  const model = await resolveDefaultAnthropicModel();
  const userPrompt = buildUserPrompt({ taskTitle, score, rawInput });

  try {
    const result = await llmCall({
      provider: "anthropic",
      model,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      cacheableBlocks: [],
      maxTokens: 256,
    });

    await recordCall({
      provider: "anthropic",
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cachedTokens: result.cachedTokens,
      success: true,
      agentId,
      taskId: taskId ?? null,
      purpose: "feedback_parse",
    });

    return cleanParsedText(result.text);
  } catch (err) {
    console.error("[feedbackParser] LLM-вызов упал:", err);
    await recordCall({
      provider: "anthropic",
      model,
      success: false,
      error: err?.message ?? String(err),
      agentId,
      taskId: taskId ?? null,
      purpose: "feedback_parse",
    }).catch(() => {});
    // При LLMError — пробрасываем, чтобы caller знал. Прочие ошибки
    // (например, сеть) тоже пробрасываем — лучше явно показать «не
    // удалось распарсить», чем тихо сохранять без parsed_text.
    if (err instanceof LLMError) throw err;
    throw new LLMError(`Не удалось нейтрализовать комментарий: ${err?.message ?? err}`);
  }
}

function cleanParsedText(text) {
  if (typeof text !== "string") return null;
  let t = text.trim();
  if (!t) return null;
  // Снимаем обрамляющие кавычки/скобки, которые модель иногда добавляет.
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("«") && t.endsWith("»")) ||
    (t.startsWith("[") && t.endsWith("]"))
  ) {
    t = t.slice(1, -1).trim();
  }
  return t || null;
}

// =========================================================================
// Чтение
// =========================================================================

// Список эпизодов агента. По умолчанию — активные, свежие сверху.
// status='all' возвращает все статусы.
export async function getEpisodes(agentId, { status = "active", limit = 50, offset = 0 } = {}) {
  assertAgentId(agentId);
  if (status !== "all" && !VALID_STATUSES.has(status)) {
    throw new Error(
      `Неизвестный status «${status}». Допустимо: active, compressed_to_rule, dismissed, archived, all.`,
    );
  }
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));
  const safeOffset = Math.max(0, Number(offset) || 0);

  const client = getServiceRoleClient();
  let query = client
    .from(TABLE)
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Не удалось получить эпизоды агента ${agentId}: ${error.message}`);
  }
  return data ?? [];
}

// Количество активных (или всех) эпизодов агента. Используется будущим
// Curator'ом для триггера сжатия (если эпизодов > N).
export async function getEpisodeCount(agentId, { status = "active" } = {}) {
  assertAgentId(agentId);
  const client = getServiceRoleClient();
  let query = client
    .from(TABLE)
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId);
  if (status !== "all") {
    query = query.eq("status", status);
  }
  const { count, error } = await query;
  if (error) {
    throw new Error(`Не удалось посчитать эпизоды агента ${agentId}: ${error.message}`);
  }
  return count ?? 0;
}

// =========================================================================
// Мутации
// =========================================================================

// Мягкое удаление: status='dismissed'. Используется когда Влад в UI
// решает «это бесполезный эпизод» (Сессия 15 расширит экраном кандидатов).
export async function dismissEpisode(id) {
  if (!id || typeof id !== "string") {
    throw new Error("id эпизода обязателен.");
  }
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .update({ status: "dismissed" })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`Не удалось отклонить эпизод: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Эпизод ${id} не найден.`);
  }
  return data;
}

// Архивация эпизодов старше N дней. Вызывается кроном (когда появится).
// На Сессии 14 — используется в скриптах/тестах вручную.
export async function archiveOldEpisodes(agentId, { olderThanDays = 90 } = {}) {
  assertAgentId(agentId);
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .update({ status: "archived" })
    .eq("agent_id", agentId)
    .eq("status", "active")
    .lt("created_at", cutoff)
    .select("id");

  if (error) {
    throw new Error(`Не удалось архивировать старые эпизоды: ${error.message}`);
  }
  return (data ?? []).length;
}
