// Сессия 49 этапа 2 (пункт 1, этап 7): Системная LLM.
//
// Единая точка выбора «какой моделью обрабатываются НЕ-task LLM-вызовы».
// Раньше каждый сервис делал свой `pickProvider()` (anthropic-haiku →
// openai-mini → gemini-flash), выбирая первого с активным ключом. Теперь
// одно место в Админке (`system_llm_provider` + `system_llm_model` в
// `team_settings`) рулит всеми.
//
// API:
//   getSystemLLMConfig() → { provider, model, budgetUsd }
//   updateSystemLLMConfig({ provider, model, budgetUsd }) — частичное PATCH
//   sendSystemRequest({ messages, systemFunction, ...overrides }) —
//     обёртка над llmClient.call() + recordCall с purpose=systemFunction.
//
// В Сессии 49 не вводим отдельный column `system_function` в `team_api_calls` —
// поле `purpose` уже выполняет эту роль (см. миграцию 0037 коммент).

import { call as llmCall } from "./llmClient.js";
import { recordCall } from "./costTracker.js";
import { getSetting, setSetting, getServiceRoleClient } from "./teamSupabase.js";

const CACHE_TTL_MS = 30_000;
let configCache = { value: null, expiresAt: 0 };

const DEFAULTS = Object.freeze({
  provider: "anthropic",
  model: "claude-haiku-4-5",
  budgetUsd: 10,
});

export function clearSystemLLMCache() {
  configCache = { value: null, expiresAt: 0 };
}

function parseJsonValue(raw, fallback) {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return raw;
  // teamSupabase.getSetting возвращает JSONB как уже распарсенный объект,
  // но на старых записях может быть строка-как-есть.
  return raw ?? fallback;
}

export async function getSystemLLMConfig() {
  const now = Date.now();
  if (configCache.value && configCache.expiresAt > now) {
    return configCache.value;
  }
  let provider = DEFAULTS.provider;
  let model = DEFAULTS.model;
  let budgetUsd = DEFAULTS.budgetUsd;
  try {
    const [pVal, mVal, bVal] = await Promise.all([
      getSetting("system_llm_provider"),
      getSetting("system_llm_model"),
      getSetting("system_llm_budget_usd"),
    ]);
    const p = parseJsonValue(pVal, DEFAULTS.provider);
    if (typeof p === "string" && p.trim()) provider = p.trim();
    const m = parseJsonValue(mVal, DEFAULTS.model);
    if (typeof m === "string" && m.trim()) model = m.trim();
    const b = parseJsonValue(bVal, DEFAULTS.budgetUsd);
    const bNum = Number(b);
    if (Number.isFinite(bNum) && bNum >= 0) budgetUsd = bNum;
  } catch (err) {
    console.warn(`[systemLLM] config read failed: ${err?.message ?? err}`);
  }
  const value = { provider, model, budgetUsd };
  configCache = { value, expiresAt: now + CACHE_TTL_MS };
  return value;
}

export async function updateSystemLLMConfig(patch = {}) {
  const updates = [];
  if (typeof patch.provider === "string" && patch.provider.trim()) {
    updates.push(["system_llm_provider", patch.provider.trim()]);
  }
  if (typeof patch.model === "string" && patch.model.trim()) {
    updates.push(["system_llm_model", patch.model.trim()]);
  }
  if (patch.budgetUsd !== undefined && patch.budgetUsd !== null) {
    const n = Number(patch.budgetUsd);
    if (!Number.isFinite(n) || n < 0) {
      throw new Error("budgetUsd должен быть неотрицательным числом.");
    }
    updates.push(["system_llm_budget_usd", n]);
  }
  if (updates.length === 0) {
    throw new Error("Нечего обновлять: ни одно поле Системной LLM не передано.");
  }
  for (const [key, value] of updates) {
    await setSetting(key, value);
  }
  clearSystemLLMCache();
  return await getSystemLLMConfig();
}

// Считаем сумму расходов Системной LLM за текущий месяц.
// Системные расходы = все team_api_calls с purpose ≠ 'task' (и не autonomy_*
// которые отдельно учитываются в Сессии 22 — но они тоже считаются как
// system-функция в этом контексте).
export async function getSystemSpentThisMonth() {
  const client = getServiceRoleClient();
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const { data, error } = await client
    .from("team_api_calls")
    .select("cost_usd")
    .neq("purpose", "task")
    .gte("timestamp", start.toISOString());
  if (error) {
    console.warn(`[systemLLM] spend query failed: ${error.message}`);
    return 0;
  }
  let sum = 0;
  for (const row of data ?? []) {
    const v = Number(row?.cost_usd ?? 0);
    if (Number.isFinite(v)) sum += v;
  }
  return Math.round(sum * 10_000) / 10_000;
}

// Главный helper для всех системных функций. Заменяет прямые llmCall в
// feedbackParserService, mergeService, promoteArtifactService и т.п.
//
// Аргументы:
//   systemFunction — обязательный slug для записи в team_api_calls.purpose
//   systemPrompt   — текст системного промпта
//   userPrompt     — текст user'а
//   maxTokens      — лимит ответа (default 2048)
//   provider/model — опц. override (для тестов или особых случаев)
//   taskId/agentId — опц., если вызов привязан к конкретной задаче/агенту
//
// Возвращает {text, inputTokens, outputTokens, cachedTokens, costUsd, provider, model}.
export async function sendSystemRequest({
  systemFunction,
  systemPrompt = "",
  userPrompt = "",
  maxTokens = 2048,
  provider: providerOverride,
  model: modelOverride,
  taskId = null,
  agentId = null,
}) {
  if (typeof systemFunction !== "string" || !systemFunction.trim()) {
    throw new Error("sendSystemRequest: systemFunction обязателен.");
  }
  const cfg = await getSystemLLMConfig();
  const provider = (providerOverride || cfg.provider).trim();
  const model = (modelOverride || cfg.model).trim();

  const response = await llmCall({
    provider,
    model,
    systemPrompt,
    userPrompt,
    maxTokens,
  });

  let apiEntry = null;
  try {
    apiEntry = await recordCall({
      provider,
      model,
      inputTokens: Number(response?.inputTokens ?? 0),
      outputTokens: Number(response?.outputTokens ?? 0),
      cachedTokens: Number(response?.cachedTokens ?? 0),
      taskId,
      success: true,
      agentId,
      purpose: systemFunction,
    });
  } catch (err) {
    console.warn(`[systemLLM] recordCall failed for ${systemFunction}: ${err?.message ?? err}`);
  }

  // Soft-проверка бюджета (мягкий лимит). Один раз на вызов — если в этом
  // месяце уже превышен лимит, логируем warning, но НЕ блокируем.
  try {
    const spent = await getSystemSpentThisMonth();
    if (cfg.budgetUsd > 0 && spent > cfg.budgetUsd) {
      console.warn(
        `[systemLLM] месячный бюджет превышен: $${spent.toFixed(2)} / $${cfg.budgetUsd.toFixed(2)} ` +
          `(systemFunction=${systemFunction}). Не блокируем — Влад сам поднимет лимит.`,
      );
    }
  } catch {
    /* ignore */
  }

  return {
    ...response,
    costUsd: Number(apiEntry?.cost_usd ?? 0),
    provider,
    model,
  };
}
