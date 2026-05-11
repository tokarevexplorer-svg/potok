// Triggers и двухтактный процесс размышления агента (Сессия 22 этапа 2, пункт 15).
//
// Двухтактная архитектура:
//
//   Такт 1 (фильтр) — дешёвая LLM (Anthropic Haiku или эквивалент)
//     отвечает {should_propose, reason}. Если false — запись в дневник
//     team_agent_diary, конец.
//
//   Такт 2 (формулировка) — основная модель агента (или fallback на
//     первой доступной anthropic-модели из pricing.json) формулирует
//     payload {what, why, benefit, estimated_cost, vlad_time, urgency}.
//     Результат идёт в team_proposals со status=pending.
//
// Оба вызова биллятся в team_api_calls с `purpose='autonomy_filter'` /
// `purpose='autonomy_propose'` — UI Админки в Сессии 49 даст разбивку
// по этим purpose'ам (см. отклонение ниже: ТЗ называет это «source»,
// но мы переиспользуем `purpose`).
//
// Cooldown 7 дней на пару (agent_id, triggered_by). Подходит и для
// еженедельного окна (weekly_window), и для событийных триггеров
// (Сессия 24, ещё не реализованы).

import { downloadFile } from "./teamStorage.js";
import { getSetting } from "./teamSupabase.js";
import { call as llmCall, LLMError } from "./llmClient.js";
import { recordCall } from "./costTracker.js";
import { getApiKey } from "./keysService.js";
import { listAgents, getAgent } from "./agentService.js";
import {
  appendDiary,
  createProposal,
  getLastReflection,
} from "./proposalService.js";
import { createNotification } from "./notificationsService.js";

const COOLDOWN_DAYS = 7;

// =========================================================================
// Anthropic-модель (общий кеш, как в agents.js / feedbackParserService.js)
// =========================================================================

const ANTHROPIC_FALLBACK_ALIAS = "claude-sonnet-4-5";
let anthropicModelCache = null;

async function resolveDefaultAnthropicModel() {
  if (anthropicModelCache) return anthropicModelCache;
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
      `[triggerService] pricing.json недоступен, fallback на «${ANTHROPIC_FALLBACK_ALIAS}»: ${err?.message ?? err}`,
    );
  }
  anthropicModelCache = id;
  return id;
}

// Дешёвая модель для такта 1. Если в pricing.json есть haiku — берём её,
// иначе используем основную модель (это всё равно дешевле, чем такт 2 на
// топовой Opus). При желании заменить — Сессия 49 даст глобальный
// system_llm_model.
async function resolveFilterModel() {
  try {
    const raw = await downloadFile("team-config", "pricing.json");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.models)) {
      const haiku = parsed.models.find(
        (m) =>
          m &&
          m.provider === "anthropic" &&
          typeof m.id === "string" &&
          m.id.toLowerCase().includes("haiku"),
      );
      if (haiku) return haiku.id;
    }
  } catch {
    // тихо
  }
  // Fallback на ту же модель, что и для такта 2.
  return resolveDefaultAnthropicModel();
}

// =========================================================================
// Глобальный тумблер автономности
// =========================================================================

export async function checkAutonomyEnabled() {
  const value = await getSetting("autonomy_enabled_globally");
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true";
  if (typeof value === "object" && typeof value.value === "boolean") return value.value;
  return false;
}

// Активные агенты с autonomy_level >= 1.
export async function getEligibleAgents() {
  const all = await listAgents({ status: "active" });
  return all.filter((a) => (a.autonomy_level ?? 0) >= 1);
}

// =========================================================================
// Промпты двухтактного процесса
// =========================================================================

function buildFilterSystemPrompt(agent) {
  const name = agent?.display_name || agent?.id || "Агент";
  const role = agent?.role_title || "";
  return [
    `Ты — фильтр инициативы агента «${name}»${role ? ` (${role})` : ""}.`,
    "Тебе пришёл триггер: возможный повод что-то предложить Владу.",
    "Твоя задача — решить, стоит ли вообще тратить ресурс на формулирование",
    "предложения. Большую часть триггеров надо пропускать: Влад не хочет шума.",
    "",
    "Отвечай СТРОГО в JSON, без markdown:",
    '{"should_propose": true/false, "reason": "<одной фразой почему>"}',
    "",
    "Решай «true» только если у тебя есть конкретная мысль, выгодная Владу,",
    "и формулировка займёт <3 минут его внимания. Иначе «false».",
  ].join("\n");
}

function buildProposeSystemPrompt(agent) {
  const name = agent?.display_name || agent?.id || "Агент";
  const role = agent?.role_title || "";
  return [
    `Ты — агент «${name}»${role ? ` (${role})` : ""}. Ты решил предложить`,
    "Владу задачу. Сформулируй предложение коротко и по делу.",
    "",
    "Отвечай СТРОГО в JSON, без markdown:",
    "{",
    '  "what": "<что предлагаешь, одной-двумя фразами>",',
    '  "why": "<зачем, привязка к Mission или Goals>",',
    '  "benefit": "<какая польза от этого>",',
    '  "estimated_cost": "<твоя грубая оценка стоимости LLM-задачи в $>",',
    '  "vlad_time": "<сколько минут внимания Влада понадобится>",',
    '  "urgency": "regular" | "urgent"',
    "}",
    "",
    "urgent — только если это действительно нельзя отложить (новость дня,",
    "критичный для Mission факт). По умолчанию regular.",
  ].join("\n");
}

function buildContextPrompt(agent, triggeredBy, context = {}) {
  const lines = [];
  lines.push(`Триггер: ${triggeredBy}`);
  if (context.note) lines.push(`Контекст: ${context.note}`);
  if (context.details) {
    lines.push(`Детали:\n${JSON.stringify(context.details, null, 2)}`);
  }
  if (agent?.biography) {
    lines.push(`\nКто ты: ${agent.biography}`);
  }
  return lines.join("\n");
}

function extractJson(text) {
  let t = String(text ?? "").trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) t = fenced[1].trim();
  return JSON.parse(t);
}

// =========================================================================
// runReflectionCycle — главный entrypoint двух тактов
// =========================================================================

// Возвращает один из вариантов:
//   { phase: 'cooldown', last_at }
//   { phase: 'skip', reason }
//   { phase: 'proposal_created', proposal_id }
//   { phase: 'proposal_skipped_limit', reason }
//   { phase: 'error', error }
export async function runReflectionCycle(agentId, triggeredBy, context = {}) {
  // 0. Глобальный тумблер.
  const enabled = await checkAutonomyEnabled();
  if (!enabled) {
    return { phase: "skip", reason: "autonomy_disabled_globally" };
  }

  // 0.5. Anthropic-ключ.
  const key = await getApiKey("anthropic").catch(() => null);
  if (!key) {
    return { phase: "skip", reason: "no_anthropic_key" };
  }

  // 1. Агент существует и autonomy_level=1.
  let agent;
  try {
    agent = await getAgent(agentId);
  } catch {
    return { phase: "skip", reason: "agent_not_found" };
  }
  if (!agent || agent.status !== "active") {
    return { phase: "skip", reason: "agent_not_active" };
  }
  if ((agent.autonomy_level ?? 0) < 1) {
    return { phase: "skip", reason: "autonomy_level_too_low" };
  }

  // 2. Cooldown 7 дней по паре (agent_id, triggered_by).
  const last = await getLastReflection(agentId, triggeredBy, COOLDOWN_DAYS);
  if (last) {
    return { phase: "cooldown", last_at: last };
  }

  // 3. Такт 1 — фильтр.
  const filterModel = await resolveFilterModel();
  const filterUser = buildContextPrompt(agent, triggeredBy, context);
  let filterRes;
  try {
    filterRes = await llmCall({
      provider: "anthropic",
      model: filterModel,
      systemPrompt: buildFilterSystemPrompt(agent),
      userPrompt: filterUser,
      cacheableBlocks: [],
      maxTokens: 256,
    });
  } catch (err) {
    await recordCall({
      provider: "anthropic",
      model: filterModel,
      success: false,
      error: err?.message ?? String(err),
      agentId,
      purpose: "autonomy_filter",
    }).catch(() => {});
    if (err instanceof LLMError) {
      return { phase: "error", error: err.message };
    }
    throw err;
  }
  await recordCall({
    provider: "anthropic",
    model: filterModel,
    inputTokens: filterRes.inputTokens,
    outputTokens: filterRes.outputTokens,
    cachedTokens: filterRes.cachedTokens,
    success: true,
    agentId,
    purpose: "autonomy_filter",
  });

  let filterDecision;
  try {
    filterDecision = extractJson(filterRes.text);
  } catch (err) {
    // Невалидный JSON — считаем «фильтр сказал нет».
    await appendDiary({
      agent_id: agentId,
      triggered_by: triggeredBy,
      reason_to_skip: `filter_json_parse_error: ${err?.message ?? err}`,
    });
    return { phase: "skip", reason: "filter_invalid_json" };
  }

  if (!filterDecision || filterDecision.should_propose !== true) {
    const reason = String(filterDecision?.reason ?? "filter_declined").slice(0, 1500);
    await appendDiary({
      agent_id: agentId,
      triggered_by: triggeredBy,
      reason_to_skip: reason,
    });
    return { phase: "skip", reason: "filter_declined" };
  }

  // 4. Такт 2 — формулировка.
  const proposeModel = agent.default_model || (await resolveDefaultAnthropicModel());
  const proposeUser = buildContextPrompt(agent, triggeredBy, context);
  let proposeRes;
  try {
    proposeRes = await llmCall({
      provider: "anthropic",
      model: proposeModel,
      systemPrompt: buildProposeSystemPrompt(agent),
      userPrompt: proposeUser,
      cacheableBlocks: [],
      maxTokens: 1024,
    });
  } catch (err) {
    await recordCall({
      provider: "anthropic",
      model: proposeModel,
      success: false,
      error: err?.message ?? String(err),
      agentId,
      purpose: "autonomy_propose",
    }).catch(() => {});
    if (err instanceof LLMError) {
      return { phase: "error", error: err.message };
    }
    throw err;
  }
  await recordCall({
    provider: "anthropic",
    model: proposeModel,
    inputTokens: proposeRes.inputTokens,
    outputTokens: proposeRes.outputTokens,
    cachedTokens: proposeRes.cachedTokens,
    success: true,
    agentId,
    purpose: "autonomy_propose",
  });

  let payload;
  try {
    payload = extractJson(proposeRes.text);
  } catch (err) {
    await appendDiary({
      agent_id: agentId,
      triggered_by: triggeredBy,
      reason_to_skip: `propose_json_parse_error: ${err?.message ?? err}`,
    });
    return { phase: "skip", reason: "propose_invalid_json" };
  }

  const kind =
    String(payload?.urgency ?? "regular").toLowerCase() === "urgent"
      ? "urgent"
      : "regular";

  const result = await createProposal({
    agent_id: agentId,
    triggered_by: triggeredBy,
    kind,
    payload,
  });

  if (result.skipped) {
    return { phase: "proposal_skipped_limit", reason: result.reason };
  }

  // 5. Inbox-нотификация. Тип уже зарегистрирован в Сессии 18.
  try {
    const title = `${agent.display_name} предлагает задачу`;
    const what = String(payload?.what ?? "").slice(0, 200);
    await createNotification({
      type: "proposal",
      title,
      description: what || null,
      agent_id: agentId,
      related_entity_id: result.proposal?.id ?? null,
      related_entity_type: "proposal",
      link: "/blog/team/dashboard",
    });
  } catch (err) {
    console.warn(
      `[triggerService] createNotification(proposal) failed for ${agentId}:`,
      err?.message ?? err,
    );
  }

  return { phase: "proposal_created", proposal_id: result.proposal?.id ?? null };
}

// =========================================================================
// Удобные обёртки для запуска: weekly + событийные триггеры
// =========================================================================

// «Прошло 7 дней — оглянись и подумай». В Сессии 24 этот тип переедет в
// автоматический cron; пока вызывается из npm run triggers:run.
export async function runWeeklyReflection(agentId, context = {}) {
  return runReflectionCycle(agentId, "weekly_window", context);
}

// Прогон всех eligible-агентов по weekly. Возвращает массив { agentId, result }.
export async function runWeeklyReflectionForAll() {
  const agents = await getEligibleAgents();
  const out = [];
  for (const a of agents) {
    try {
      const r = await runWeeklyReflection(a.id, { note: "Еженедельное окно: оглянись на свою зону." });
      out.push({ agentId: a.id, result: r });
    } catch (err) {
      out.push({ agentId: a.id, result: { phase: "error", error: err?.message ?? String(err) } });
    }
  }
  return out;
}
