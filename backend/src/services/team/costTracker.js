// Учёт расходов на LLM-вызовы команды.
//
// Прямой портирование `dkl_tool/backend/services/cost_tracker.py` на JS.
// Отличия от Python-версии:
//   - pricing.json читается из bucket'а team-config (а не с диска), с
//     кешированием в памяти процесса (TTL 60 сек, для редких изменений).
//   - Запись каждого вызова идёт в таблицу team_api_calls (а не в JSONL).
//     Агрегация — обычным SELECT'ом, не построчным чтением файла.
//   - Порог алерта читается из team_settings (а не из env).
//
// Anthropic использует prompt caching, поэтому input-биллинг разбивается:
// cached_tokens оплачиваются по сниженной ставке (cached_input_per_million),
// остальные — по обычной (input_per_million). У OpenAI/Google такого
// разделения в pricing.json обычно нет — fallback'ом считаем cached как
// обычный input.
//
// OpenAI Whisper биллится по минутам аудио, не по токенам. Для него ищем
// блок audio[provider][model] в pricing.json.

import { downloadFile } from "./teamStorage.js";
import {
  recordApiCall,
  getApiCallsByTaskId,
  getAllApiCalls,
  getSetting,
  getServiceRoleClient,
} from "./teamSupabase.js";
import { getLimits } from "./limitsService.js";

const CONFIG_BUCKET = "team-config";
const PRICING_PATH = "pricing.json";
const PRICING_CACHE_TTL_MS = 60_000;

let pricingCache = { value: null, expiresAt: 0 };

// Читает pricing.json из team-config bucket. Кеширует в памяти на 60 сек,
// чтобы не дёргать Storage на каждом вызове LLM. Если файла нет/невалидный
// JSON — возвращает {} (но логирует warning, чтобы Влад не оставался в неведении).
async function loadPricing() {
  const now = Date.now();
  if (pricingCache.value && pricingCache.expiresAt > now) {
    return pricingCache.value;
  }

  let parsed = {};
  try {
    const raw = await downloadFile(CONFIG_BUCKET, PRICING_PATH);
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn(
      `[team-cost] не удалось загрузить ${PRICING_PATH}: ${err.message}. Стоимости будут 0.`,
    );
    parsed = {};
  }

  pricingCache = { value: parsed, expiresAt: now + PRICING_CACHE_TTL_MS };
  return parsed;
}

// Сброс кеша (для тестов или если Влад только что обновил pricing).
export function clearPricingCache() {
  pricingCache = { value: null, expiresAt: 0 };
}

// Находит pricing-запись для пары (provider, model) в текущей структуре
// pricing.json:
//   { "models": [{ "provider": "...", "id": "...", "input_per_million": ..., "output_per_million": ..., "cached_input_per_million": ... }, ...],
//     "audio":  { "openai": { "whisper-1": { "per_minute": 0.006 } } } }
//
// Возвращает нормализованный объект {input?, output?, cached_input?, per_minute?}
// или null если ничего не нашли.
function lookupModelPricing(pricing, provider, model) {
  for (const entry of pricing.models ?? []) {
    if (entry?.provider !== provider || entry?.id !== model) continue;
    const out = {};
    if ("input_per_million" in entry) out.input = entry.input_per_million;
    if ("output_per_million" in entry) out.output = entry.output_per_million;
    if ("cached_input_per_million" in entry) out.cached_input = entry.cached_input_per_million;
    return out;
  }

  const audioBlock = pricing.audio?.[provider] ?? {};
  const audioEntry = audioBlock[model];
  if (audioEntry) {
    return { ...audioEntry };
  }

  return null;
}

// Считает стоимость одного вызова в USD. Если для модели нет pricing-записи —
// возвращает 0 (caller всё равно запишет вызов в журнал, просто без cost).
//
// Аргументы как у Python-версии: { provider, model, inputTokens, outputTokens,
// cachedTokens, audioMinutes }.
export async function calculateCost({
  provider,
  model,
  inputTokens = 0,
  outputTokens = 0,
  cachedTokens = 0,
  audioMinutes = 0,
}) {
  const pricing = await loadPricing();
  const modelPricing = lookupModelPricing(pricing, provider, model);
  if (!modelPricing) return 0;

  let cost = 0;

  if (typeof modelPricing.per_minute === "number") {
    cost += Number(modelPricing.per_minute) * Number(audioMinutes);
  }

  if (typeof modelPricing.input === "number") {
    // Anthropic-style: cached_tokens оплачиваются по cached_input rate,
    // остальные — по обычному input. Если cached_input не задан (OpenAI/Google)
    // — биллим cached по полной ставке input, как в ДК Лурье.
    const fresh = Math.max(Number(inputTokens) - Number(cachedTokens), 0);
    cost += (fresh * Number(modelPricing.input)) / 1_000_000;
    if (cachedTokens && typeof modelPricing.cached_input === "number") {
      cost += (Number(cachedTokens) * Number(modelPricing.cached_input)) / 1_000_000;
    } else if (cachedTokens) {
      cost += (Number(cachedTokens) * Number(modelPricing.input)) / 1_000_000;
    }
  }

  if (typeof modelPricing.output === "number" && outputTokens) {
    cost += (Number(outputTokens) * Number(modelPricing.output)) / 1_000_000;
  }

  // Округление до 6 знаков — точность в долях цента, ничего не теряем.
  return Math.round(cost * 1_000_000) / 1_000_000;
}

// Записывает вызов в team_api_calls и возвращает запись (или null если не
// удалось — recordApiCall в taskSupabase ловит ошибку и логирует, не бросает).
//
// Аргументы — единый объект, чтобы не путаться в порядке параметров.
export async function recordCall({
  provider,
  model,
  inputTokens = 0,
  outputTokens = 0,
  cachedTokens = 0,
  audioMinutes = 0,
  taskId = null,
  success = true,
  error = null,
  agentId = null,
  purpose = null,
}) {
  const cost = await calculateCost({
    provider,
    model,
    inputTokens,
    outputTokens,
    cachedTokens,
    audioMinutes,
  });

  return await recordApiCall({
    provider,
    model,
    inputTokens,
    outputTokens,
    cachedTokens,
    costUsd: cost,
    audioMinutes: audioMinutes || null,
    taskId,
    success,
    error,
    agentId,
    purpose,
  });
}

// Сумма стоимости всех вызовов, привязанных к task_id. Используется для
// биллинга write_text + последующих AI-правок: все правки фрагментов биллятся
// против родительской задачи (без новой записи в team_tasks), и UI показывает
// суммарную стоимость.
export async function getCostForTask(taskId) {
  if (!taskId) return 0;
  const calls = await getApiCallsByTaskId(taskId);
  let total = 0;
  for (const call of calls) {
    const c = Number(call.cost_usd ?? 0);
    if (Number.isFinite(c)) total += c;
  }
  return Math.round(total * 1_000_000) / 1_000_000;
}

// Агрегирует траты по всему журналу: сумма, разбивка по провайдерам и моделям,
// флаг превышения порога алерта. Структура ответа повторяет Python-версию,
// чтобы фронт можно было портировать 1-в-1.
export async function getTotalSpending() {
  const entries = await getAllApiCalls();

  let total = 0;
  let calls = 0;
  let failed = 0;
  const byProvider = {};
  const byModel = {};

  for (const e of entries) {
    const cost = Number(e.cost_usd ?? 0);
    const provider = e.provider ?? "unknown";
    const model = e.model ?? "unknown";

    total += Number.isFinite(cost) ? cost : 0;
    calls += 1;
    if (e.success === false) failed += 1;

    const p = byProvider[provider] ?? (byProvider[provider] = { cost_usd: 0, calls: 0 });
    p.cost_usd += Number.isFinite(cost) ? cost : 0;
    p.calls += 1;

    const key = `${provider}/${model}`;
    const m = byModel[key] ?? (byModel[key] = { provider, model, cost_usd: 0, calls: 0 });
    m.cost_usd += Number.isFinite(cost) ? cost : 0;
    m.calls += 1;
  }

  for (const p of Object.values(byProvider)) {
    p.cost_usd = Math.round(p.cost_usd * 10_000) / 10_000;
  }
  const byModelArr = Object.values(byModel)
    .map((m) => ({ ...m, cost_usd: Math.round(m.cost_usd * 10_000) / 10_000 }))
    .sort((a, b) => b.cost_usd - a.cost_usd);

  const threshold = await getAlertThreshold();

  return {
    total_usd: Math.round(total * 10_000) / 10_000,
    calls,
    failed,
    by_provider: byProvider,
    by_model: byModelArr,
    alert_threshold_usd: threshold,
    alert_triggered: typeof threshold === "number" && total >= threshold,
  };
}

// Порог алерта расходов в USD. Хранится в team_settings под ключом
// `alert_threshold_usd`. Если не задан — null (= алерт выключен).
export async function getAlertThreshold() {
  const value = await getSetting("alert_threshold_usd");
  if (value === null || value === undefined) return null;
  // value хранится как jsonb — может прийти как number или {value: number}.
  if (typeof value === "number") return value;
  if (typeof value === "object" && typeof value.value === "number") return value.value;
  return null;
}

// =========================================================================
// Жёсткие лимиты расходов (Сессия 2 этапа 2)
// =========================================================================
//
// Лимиты считаются и проверяются отдельно от «мягкого» месячного алерта
// (`alert_threshold_usd`) — мягкий показывает баннер, жёсткие реально
// блокируют постановку (`checkDailyLimit`) и выполнение (`checkTaskLimit`).

// Сумма cost_usd из team_api_calls за текущие UTC-сутки.
// Используется как до постановки задачи (предохранитель), так и для отображения
// «Сегодня потрачено» в UI.
export async function getDailySpentUsd() {
  const client = getServiceRoleClient();
  // 00:00 UTC сегодняшнего дня.
  const now = new Date();
  const startUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  const { data, error } = await client
    .from("team_api_calls")
    .select("cost_usd")
    .gte("timestamp", startUtc.toISOString());
  if (error) {
    console.warn("[costTracker] не удалось получить сумму расходов за день:", error.message);
    return 0;
  }
  let total = 0;
  for (const row of data ?? []) {
    const v = Number(row?.cost_usd ?? 0);
    if (Number.isFinite(v)) total += v;
  }
  return Math.round(total * 1_000_000) / 1_000_000;
}

// Сумма cost_usd по конкретной задаче. Дубликат getCostForTask, но с понятным
// именем для интеграции с лимитом. Оставлено отдельно, чтобы при будущей
// миграции на серверную агрегацию обе функции можно было поменять независимо.
export async function getTaskSpentUsd(taskId) {
  if (!taskId) return 0;
  return await getCostForTask(taskId);
}

// Проверяет, можно ли запускать новую задачу.
// Возвращает { allowed, spent_usd, limit_usd, enabled }.
export async function checkDailyLimit() {
  const limits = await getLimits();
  const spent = await getDailySpentUsd();
  if (!limits.daily_enabled) {
    return {
      allowed: true,
      spent_usd: spent,
      limit_usd: limits.daily_limit_usd,
      enabled: false,
    };
  }
  const limit = Number(limits.daily_limit_usd);
  const allowed = !(Number.isFinite(limit) && spent >= limit);
  return {
    allowed,
    spent_usd: spent,
    limit_usd: Number.isFinite(limit) ? limit : null,
    enabled: true,
  };
}

// Проверяет, может ли конкретная задача продолжить тратить.
// Возвращает { allowed, spent_usd, limit_usd, enabled }.
export async function checkTaskLimit(taskId) {
  const limits = await getLimits();
  const spent = await getTaskSpentUsd(taskId);
  if (!limits.task_enabled) {
    return {
      allowed: true,
      spent_usd: spent,
      limit_usd: limits.task_limit_usd,
      enabled: false,
    };
  }
  const limit = Number(limits.task_limit_usd);
  const allowed = !(Number.isFinite(limit) && spent >= limit);
  return {
    allowed,
    spent_usd: spent,
    limit_usd: Number.isFinite(limit) ? limit : null,
    enabled: true,
  };
}
