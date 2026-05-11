// Сжатие эпизодов обратной связи в кандидаты в правила (Сессия 15 этапа 2,
// пункт 9).
//
// Что делает:
//   1. Для указанного агента (или всех активных) тянет активные эпизоды
//      из team_feedback_episodes (status='active').
//   2. Если эпизодов < 3 — пропускает (паттерн считается значимым только
//      при 2+ повторах, плюс единичные эпизоды дают «шум» в правилах).
//   3. Тянет текущие активные правила из team_agent_memory, чтобы
//      LLM не дублировала их.
//   4. Зовёт Anthropic с системным промптом «найди устойчивые паттерны».
//   5. Парсит JSON-ответ, сохраняет каждое предложение как запись в
//      team_agent_memory: type='rule', status='candidate', source='feedback',
//      source_episode_ids = [uuid'ы эпизодов].
//
// Идемпотентность: для каждого кандидата проверяем, нет ли уже строки с
// тем же набором source_episode_ids — если есть, пропускаем.
//
// Использование:
//   npm run compress:episodes -- --agent <id>
//   npm run compress:episodes -- --all
//
// Расход на LLM пишется в team_api_calls с purpose='compress_episodes'.

import "dotenv/config";
import { downloadFile } from "../src/services/team/teamStorage.js";
import { getServiceRoleClient } from "../src/services/team/teamSupabase.js";
import { call as llmCall, LLMError } from "../src/services/team/llmClient.js";
import { recordCall } from "../src/services/team/costTracker.js";
import { getApiKey } from "../src/services/team/keysService.js";
import { listAgents, getAgent } from "../src/services/team/agentService.js";
import { getRulesForAgent } from "../src/services/team/memoryService.js";

const MEMORY_TABLE = "team_agent_memory";
const EPISODES_TABLE = "team_feedback_episodes";
const MIN_EPISODES = 3; // ниже этого порога не зовём LLM

const SYSTEM_PROMPT = [
  "Ты обрабатываешь обратную связь Влада (автора блога) агенту AI-редакции.",
  "Ниже — список наблюдений за период работы агента + текущие активные правила.",
  "",
  "Твоя задача — выявить устойчивые паттерны, которые повторяются 2+ раз или",
  "сформулированы Владом как принципиальные. Для каждого паттерна предложи",
  "правило в формате: «<императив>, потому что <обоснование из эпизодов>».",
  "",
  "Правила:",
  "- Короткие (1-2 строки), действенные, проверяемые.",
  "- Не предлагай правила на основе единичного эпизода.",
  "- Не дублируй существующие активные правила.",
  "- Не выдумывай: каждое правило должно быть прямой генерализацией",
  "  конкретных эпизодов.",
  "",
  "Формат ответа — СТРОГО JSON, никакого markdown, без преамбулы:",
  '{"candidates": [{"rule": "<текст правила>", "based_on_episode_ids": ["<uuid1>", "<uuid2>"]}]}',
  "Если паттернов нет — верни {\"candidates\": []}.",
].join("\n");

// =========================================================================
// Аргументы CLI
// =========================================================================

function parseArgs(argv) {
  const out = { agent: null, all: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--agent" || a === "-a") out.agent = argv[++i] ?? null;
    else if (a === "--all") out.all = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function printUsageAndExit(code = 0) {
  console.log(
    [
      "Сжатие эпизодов обратной связи в кандидаты в правила.",
      "",
      "Использование:",
      "  npm run compress:episodes -- --agent <id>",
      "  npm run compress:episodes -- --all",
      "",
      "Аргументы:",
      "  --agent, -a   ID конкретного агента",
      "  --all          Прогнать по всем активным агентам",
    ].join("\n"),
  );
  process.exit(code);
}

// =========================================================================
// Anthropic-модель — общий кеш, как в agents.js / feedbackParserService.js
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
      `[compress-episodes] pricing.json недоступен, fallback на «${ANTHROPIC_FALLBACK_ALIAS}»: ${err?.message ?? err}`,
    );
  }
  anthropicModelCache = id;
  return id;
}

// =========================================================================
// Чтение и парсинг
// =========================================================================

async function fetchActiveEpisodes(agentId) {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(EPISODES_TABLE)
    .select("id, score, parsed_text, raw_input, task_id, created_at")
    .eq("agent_id", agentId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`Не удалось получить эпизоды агента ${agentId}: ${error.message}`);
  }
  return data ?? [];
}

function buildUserPrompt({ agent, episodes, existingRules }) {
  const lines = [];
  lines.push(`Агент: ${agent.display_name}${agent.role_title ? ` (${agent.role_title})` : ""}`);
  lines.push("");
  lines.push("Текущие активные правила:");
  if (existingRules.length === 0) {
    lines.push("- (нет)");
  } else {
    for (const r of existingRules) {
      lines.push(`- ${r.content}`);
    }
  }
  lines.push("");
  lines.push("Эпизоды обратной связи (за период):");
  for (const e of episodes) {
    const text = e.parsed_text?.trim() || e.raw_input?.trim() || "(пусто)";
    const scoreLabel = e.score !== null && e.score !== undefined ? `${e.score}/5` : "—";
    lines.push(`- id=${e.id} (${scoreLabel}): ${text}`);
  }
  return lines.join("\n");
}

// Достаёт JSON из ответа LLM. Anthropic иногда оборачивает в ```json блок —
// снимаем обёртку перед JSON.parse.
function extractJson(text) {
  let t = String(text ?? "").trim();
  // ```json ... ``` или ``` ... ```
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) t = fenced[1].trim();
  return JSON.parse(t);
}

// =========================================================================
// Проверка идемпотентности и сохранение кандидата
// =========================================================================

// Возвращает true если у агента уже есть строка с тем же набором
// source_episode_ids (статус не важен — даже rejected дубликат не надо
// создавать заново). Сравнение через сортированный JSON.
async function hasExistingCandidate(agentId, episodeIds) {
  if (!Array.isArray(episodeIds) || episodeIds.length === 0) return false;
  const wanted = JSON.stringify([...episodeIds].sort());
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(MEMORY_TABLE)
    .select("source_episode_ids")
    .eq("agent_id", agentId)
    .eq("type", "rule")
    .not("source_episode_ids", "is", null);
  if (error) {
    console.warn(`[compress-episodes] проверка дубликатов упала: ${error.message}`);
    return false;
  }
  for (const row of data ?? []) {
    const ids = Array.isArray(row.source_episode_ids) ? row.source_episode_ids : [];
    if (JSON.stringify([...ids].sort()) === wanted) return true;
  }
  return false;
}

async function insertCandidate(agentId, content, sourceEpisodeIds) {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(MEMORY_TABLE)
    .insert({
      agent_id: agentId,
      type: "rule",
      content,
      source: "feedback",
      status: "candidate",
      source_episode_ids: sourceEpisodeIds,
    })
    .select()
    .maybeSingle();
  if (error) {
    throw new Error(`Не удалось сохранить кандидата в правила: ${error.message}`);
  }
  return data;
}

// =========================================================================
// Главная обработка одного агента
// =========================================================================

async function processAgent(agent) {
  const episodes = await fetchActiveEpisodes(agent.id);
  if (episodes.length < MIN_EPISODES) {
    console.log(
      `[${agent.id}] эпизодов ${episodes.length} (< ${MIN_EPISODES}) — пропуск.`,
    );
    return { agent: agent.id, skipped: true, reason: "too_few_episodes" };
  }

  const existingRules = await getRulesForAgent(agent.id);
  const model = await resolveDefaultAnthropicModel();
  const userPrompt = buildUserPrompt({ agent, episodes, existingRules });

  const validIds = new Set(episodes.map((e) => e.id));

  let llmResult;
  try {
    llmResult = await llmCall({
      provider: "anthropic",
      model,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      cacheableBlocks: [],
      maxTokens: 2048,
    });
  } catch (err) {
    await recordCall({
      provider: "anthropic",
      model,
      success: false,
      error: err?.message ?? String(err),
      agentId: agent.id,
      purpose: "compress_episodes",
    }).catch(() => {});
    throw err;
  }

  await recordCall({
    provider: "anthropic",
    model,
    inputTokens: llmResult.inputTokens,
    outputTokens: llmResult.outputTokens,
    cachedTokens: llmResult.cachedTokens,
    success: true,
    agentId: agent.id,
    purpose: "compress_episodes",
  });

  let parsed;
  try {
    parsed = extractJson(llmResult.text);
  } catch (err) {
    console.error(`[${agent.id}] не удалось распарсить ответ LLM:`, err?.message);
    console.error("[response]", llmResult.text);
    return { agent: agent.id, error: "parse_failed" };
  }

  const candidates = Array.isArray(parsed?.candidates) ? parsed.candidates : [];
  let created = 0;
  let skipped = 0;
  for (const c of candidates) {
    const rule = typeof c?.rule === "string" ? c.rule.trim() : "";
    const refs = Array.isArray(c?.based_on_episode_ids) ? c.based_on_episode_ids : [];
    const filtered = refs.filter((id) => validIds.has(id));
    if (!rule || filtered.length === 0) {
      console.log(`[${agent.id}] пропуск кандидата (пустое правило или нет валидных эпизодов).`);
      continue;
    }
    if (await hasExistingCandidate(agent.id, filtered)) {
      skipped += 1;
      console.log(`[${agent.id}] дубликат, пропуск: «${rule}»`);
      continue;
    }
    try {
      const saved = await insertCandidate(agent.id, rule, filtered);
      created += 1;
      console.log(`[${agent.id}] + кандидат ${saved.id}: «${rule}»`);
    } catch (err) {
      console.error(`[${agent.id}] insert failed: ${err?.message ?? err}`);
    }
  }

  console.log(
    `[${agent.id}] эпизодов: ${episodes.length}, кандидатов: ${created} (+${skipped} дублей).`,
  );
  return { agent: agent.id, episodes: episodes.length, created, skipped };
}

// =========================================================================
// Main
// =========================================================================

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) printUsageAndExit(0);
  if (!args.agent && !args.all) {
    console.error("Укажи --agent <id> или --all.");
    printUsageAndExit(1);
  }
  if (args.agent && args.all) {
    console.error("Укажи только одно из --agent / --all.");
    printUsageAndExit(1);
  }

  // Anthropic-ключ — проверяем заранее.
  const key = await getApiKey("anthropic").catch(() => null);
  if (!key) {
    console.error(
      "Anthropic-ключ не задан. Добавь в Админке → Ключи и провайдеры.",
    );
    process.exit(1);
  }

  let agents;
  if (args.agent) {
    const one = await getAgent(args.agent);
    agents = [one];
  } else {
    agents = await listAgents({ status: "active" });
  }

  if (agents.length === 0) {
    console.log("Нет агентов для обработки.");
    return;
  }

  console.log(`[compress-episodes] К обработке: ${agents.length} агент(ов).`);

  const results = [];
  for (const agent of agents) {
    try {
      const res = await processAgent(agent);
      results.push(res);
    } catch (err) {
      console.error(
        `[${agent.id}] критическая ошибка: ${err?.message ?? err}`,
      );
      results.push({ agent: agent.id, error: err?.message ?? String(err) });
    }
  }

  const totalCreated = results.reduce((s, r) => s + (r.created ?? 0), 0);
  console.log(
    `[compress-episodes] Готово. Всего кандидатов создано: ${totalCreated}.`,
  );
}

main().catch((err) => {
  if (err instanceof LLMError) {
    console.error("[compress-episodes] LLM-ошибка:", err.message);
  } else {
    console.error("[compress-episodes] упало:", err);
  }
  process.exit(1);
});
