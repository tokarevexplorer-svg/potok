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
import { getServiceRoleClient, getSetting } from "./teamSupabase.js";
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

// =========================================================================
// Сессия 24: событийные триггеры
// =========================================================================
//
// Три типа событий:
//   • low_score          — за период появился новый team_feedback_episodes
//                          со score<=2 для этого агента.
//   • new_competitor_entry — добавлена запись в любую таблицу типа
//                          'competitor' в team_custom_databases (или сам
//                          реестр пополнился новой записью competitor).
//   • goals_changed       — файл strategy/goals.md в Storage обновился.
//
// Состояние «когда мы последний раз поллили» — team_trigger_state
// (миграция 0027). Cooldown 7 дней на одно срабатывание — через
// proposalService.getLastReflection (живёт независимо).

const STATE_TABLE = "team_trigger_state";

// Возвращает ISO-строку last_checked_at для пары (agent, trigger_type).
// Если записи нет — возвращает null (значит «никогда не проверяли»; на
// первом тике поллинга поднимаем точку отсечения, чтобы не задвоить
// исторические эпизоды).
async function getTriggerState(agentId, triggerType) {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(STATE_TABLE)
    .select("last_checked_at")
    .eq("agent_id", agentId)
    .eq("trigger_type", triggerType)
    .maybeSingle();
  if (error) {
    console.warn(`[triggerService] getTriggerState ${agentId}/${triggerType}:`, error.message);
    return null;
  }
  return data?.last_checked_at ?? null;
}

async function setTriggerState(agentId, triggerType, at = new Date()) {
  const client = getServiceRoleClient();
  const iso = at instanceof Date ? at.toISOString() : String(at);
  const { error } = await client.from(STATE_TABLE).upsert(
    {
      agent_id: agentId,
      trigger_type: triggerType,
      last_checked_at: iso,
    },
    { onConflict: "agent_id,trigger_type" },
  );
  if (error) {
    console.warn(`[triggerService] setTriggerState ${agentId}/${triggerType}:`, error.message);
  }
}

// Если для агента+типа нет состояния — ставим «сейчас», чтобы первый тик
// не поднял всю историю эпизодов/конкурентов. Возвращает effective cutoff
// (ISO-строка), от которого ищем новые события.
async function ensureCutoff(agentId, triggerType) {
  let cutoff = await getTriggerState(agentId, triggerType);
  if (!cutoff) {
    cutoff = new Date().toISOString();
    await setTriggerState(agentId, triggerType, cutoff);
  }
  return cutoff;
}

// Для goals_changed мы храним «fingerprint» как длину файла. Чтобы
// уложить в колонку timestamptz, кодируем в sentinel-дату: epoch + length
// секунд. Длины ≤ 86400 (24ч) дают валидную дату в 1970-01-01, длины
// больше — следующие сутки и т.д. Чисто опознавательный маркер, не
// настоящая timestamp.
function lengthToSentinelDate(length) {
  const ms = Math.max(0, Math.min(Number(length) || 0, 30 * 365 * 24 * 60 * 60)) * 1000;
  return new Date(ms).toISOString();
}
function sentinelDateToLength(iso) {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  return Math.round(ms / 1000);
}

// =========================================================================
// Триггер: low_score
// =========================================================================

async function pollLowScoreFor(agent) {
  const cutoff = await ensureCutoff(agent.id, "low_score");
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_feedback_episodes")
    .select("id, score, task_id, created_at")
    .eq("agent_id", agent.id)
    .lte("score", 2)
    .gt("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    return { triggered: false, reason: `query_error: ${error.message}` };
  }
  const newest = (data ?? [])[0];
  if (!newest) {
    return { triggered: false, reason: "no_new_low_score" };
  }
  // Двигаем маркер ВСЕГДА (даже если cooldown потом откажет) — иначе
  // следующий тик найдёт ту же запись.
  await setTriggerState(agent.id, "low_score", newest.created_at);

  // Cooldown 7 дней по типу.
  const lastReflection = await getLastReflection(agent.id, "low_score", 7);
  if (lastReflection) {
    return { triggered: false, reason: "cooldown" };
  }

  const result = await runReflectionCycle(agent.id, "low_score", {
    note: `Получена низкая оценка задачи (score=${newest.score}).`,
    details: { task_id: newest.task_id, score: newest.score },
  });
  return { triggered: true, result };
}

// =========================================================================
// Триггер: new_competitor_entry
// =========================================================================
//
// Простой вариант: считаем триггером появление новой записи в реестре
// `team_custom_databases` с `db_type='competitor'` за период. (Парсинг
// реальных таблиц конкурентов добавит Сессия 33 — там же триггер можно
// будет расширить «появилась запись в таблице конкретного блогера».)
async function pollCompetitorEntryFor(agent) {
  const cutoff = await ensureCutoff(agent.id, "new_competitor_entry");
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_custom_databases")
    .select("id, name, created_at, db_type")
    .eq("db_type", "competitor")
    .gt("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    return { triggered: false, reason: `query_error: ${error.message}` };
  }
  const newest = (data ?? [])[0];
  if (!newest) {
    return { triggered: false, reason: "no_new_competitor" };
  }
  await setTriggerState(agent.id, "new_competitor_entry", newest.created_at);

  const lastReflection = await getLastReflection(agent.id, "new_competitor_entry", 7);
  if (lastReflection) {
    return { triggered: false, reason: "cooldown" };
  }

  const result = await runReflectionCycle(agent.id, "new_competitor_entry", {
    note: `Новый конкурент в базе: ${newest.name}.`,
    details: { competitor_id: newest.id, name: newest.name },
  });
  return { triggered: true, result };
}

// =========================================================================
// Триггер: goals_changed
// =========================================================================
//
// Storage не отдаёт updated_at дешёвым способом; качаем файл и берём его
// длину + последнюю строку как fingerprint (это дёшево и стабильно: если
// текст не менялся — fingerprint совпадает). Сравниваем с last_checked_at
// (там храним fingerprint, а не ISO). Если другой — триггерим.
async function pollGoalsChangedFor(agent) {
  let length;
  try {
    const text = await downloadFile("team-prompts", "strategy/goals.md");
    length = (text ?? "").length;
  } catch {
    return { triggered: false, reason: "goals_unavailable" };
  }
  const sentinel = lengthToSentinelDate(length);
  const prevSentinel = await getTriggerState(agent.id, "goals_changed");
  if (!prevSentinel) {
    // Первый тик: запомнили длину как sentinel, не триггерим.
    await setTriggerState(agent.id, "goals_changed", sentinel);
    return { triggered: false, reason: "initial_fingerprint" };
  }
  const prevLength = sentinelDateToLength(prevSentinel);
  if (prevLength === length) {
    return { triggered: false, reason: "unchanged" };
  }
  await setTriggerState(agent.id, "goals_changed", sentinel);

  const lastReflection = await getLastReflection(agent.id, "goals_changed", 7);
  if (lastReflection) {
    return { triggered: false, reason: "cooldown" };
  }

  const result = await runReflectionCycle(agent.id, "goals_changed", {
    note: `Цели на период обновлены (длина файла: ${length} → было ${prevLength ?? "?"}).`,
  });
  return { triggered: true, result };
}

// =========================================================================
// pollEventTriggers — для каждого eligible-агента проходит три типа.
// =========================================================================

export async function pollEventTriggers() {
  const enabled = await checkAutonomyEnabled();
  if (!enabled) {
    return { enabled: false, agents: [] };
  }
  const agents = await getEligibleAgents();
  const report = [];
  for (const agent of agents) {
    const out = { agentId: agent.id, results: {} };
    try {
      out.results.low_score = await pollLowScoreFor(agent);
    } catch (err) {
      out.results.low_score = { triggered: false, reason: `error: ${err?.message ?? err}` };
    }
    try {
      out.results.new_competitor_entry = await pollCompetitorEntryFor(agent);
    } catch (err) {
      out.results.new_competitor_entry = {
        triggered: false,
        reason: `error: ${err?.message ?? err}`,
      };
    }
    try {
      out.results.goals_changed = await pollGoalsChangedFor(agent);
    } catch (err) {
      out.results.goals_changed = { triggered: false, reason: `error: ${err?.message ?? err}` };
    }
    report.push(out);
  }
  return { enabled: true, agents: report };
}
