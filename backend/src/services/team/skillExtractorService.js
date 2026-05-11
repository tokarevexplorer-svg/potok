// Сервис автоматического извлечения навыков из успешных задач
// (Сессия 26 этапа 2, пункт 10).
//
// Логика:
//   1. После того как Влад поставил высокую оценку задаче (см.
//      feedbackParserService.parseAndSave — там при score >= threshold
//      дёргается setImmediate(() => extractSkillCandidate(...))), берём
//      эту задачу + контекст агента и просим LLM выделить переиспользуемый
//      паттерн.
//   2. LLM возвращает либо {has_pattern: false}, либо
//      {skill_name, when_to_apply, what_to_do, why_it_works}.
//   3. При наличии паттерна — INSERT в team_skill_candidates со
//      status='pending'. Влад потом ревьюит в Сессии 27.
//
// Биллинг через costTracker.recordCall с purpose='skill_extraction'
// (в соответствии с конвенцией purpose-полей, см. отклонения Сессии 22).
//
// Anthropic-LLM (дешёвая, через тот же resolver, что и feedbackParser).
// Если ключа нет — extraction молча отказывается, не валит flow.

import { downloadFile } from "./teamStorage.js";
import { getServiceRoleClient } from "./teamSupabase.js";
import { call as llmCall, LLMError } from "./llmClient.js";
import { recordCall } from "./costTracker.js";
import { getApiKey } from "./keysService.js";
import { getAgent } from "./agentService.js";
import { getRulesForAgent } from "./memoryService.js";
import { getSkillsForAgent } from "./skillService.js";
import { getTaskById } from "./teamSupabase.js";
import { createNotification } from "./notificationsService.js";

const CANDIDATES_TABLE = "team_skill_candidates";

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
      `[skillExtractor] pricing.json недоступен, fallback на «${ANTHROPIC_FALLBACK_ALIAS}»: ${err?.message ?? err}`,
    );
  }
  anthropicModelCache = id;
  return id;
}

// =========================================================================
// Промпт extractora
// =========================================================================

const SYSTEM_PROMPT = [
  "Ты анализируешь успешно выполненную задачу агента AI-редакции.",
  "Твоя задача — извлечь переиспользуемый паттерн, если он есть.",
  "",
  "Правила:",
  "- Не каждое успешное выполнение — повод для нового навыка.",
  "- Не предлагай навык, если результат был получен прямой комбинацией",
  "  существующих правил и шаблона задачи.",
  "- Не дублируй существующие активные навыки (список ниже).",
  "- Навык должен быть узким и проверяемым.",
  "- when_to_apply должен описывать конкретный контекст (тип задачи / тема).",
  "- what_to_do — рецепт из 1-3 шагов, без воды.",
  "- why_it_works — короткое обоснование «почему это работает» (1-2 фразы).",
  "",
  "Ответь СТРОГО в JSON, без markdown:",
  '{"has_pattern": true/false, "skill_name": "...", "when_to_apply": "...", "what_to_do": "...", "why_it_works": "..."}',
  "Если паттерна нет — {\"has_pattern\": false}.",
].join("\n");

function buildUserPrompt({ agent, task, score, comment, rules, skills, result }) {
  const lines = [];
  lines.push(`Агент: ${agent?.display_name ?? agent?.id ?? "Агент"}`);
  if (agent?.role_title) lines.push(`Должность: ${agent.role_title}`);
  lines.push("");
  lines.push(`Задача: ${task?.title ?? task?.type ?? "—"}`);
  lines.push(`Тип: ${task?.type ?? "—"}`);
  const brief = String(task?.params?.user_input ?? "").trim();
  if (brief) lines.push(`Бриф: ${brief.slice(0, 600)}${brief.length > 600 ? "…" : ""}`);
  lines.push("");

  const activeRules = (rules ?? [])
    .map((r) => `- ${r?.content ?? ""}`)
    .filter((s) => s.length > 2)
    .slice(0, 20);
  lines.push("Активные правила Memory:");
  lines.push(activeRules.length > 0 ? activeRules.join("\n") : "- (нет)");
  lines.push("");

  const skillNames = (skills ?? [])
    .map((s) => `- ${s?.skill_name ?? s?.slug ?? ""}`)
    .filter((s) => s.length > 2);
  lines.push("Уже принятые навыки:");
  lines.push(skillNames.length > 0 ? skillNames.join("\n") : "- (нет)");
  lines.push("");

  const truncated = String(result ?? "").slice(0, 2000);
  lines.push("Финальный результат задачи (первые 2000 символов):");
  lines.push(truncated || "—");
  lines.push("");

  lines.push(`Оценка Влада: ${score ?? "—"}/5`);
  if (comment) lines.push(`Комментарий Влада: ${comment}`);

  return lines.join("\n");
}

function extractJson(text) {
  let t = String(text ?? "").trim();
  const fenced = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) t = fenced[1].trim();
  return JSON.parse(t);
}

// =========================================================================
// Основной API
// =========================================================================

// extractSkillCandidate — главный entry point. Возвращает:
//   { extracted: true, candidate_id }
//   { extracted: false, reason }
// Не бросает LLMError наружу — всё ловит и возвращает reason.
export async function extractSkillCandidate({
  taskId,
  agentId,
  score,
  comment = "",
}) {
  if (!taskId || !agentId) {
    return { extracted: false, reason: "missing_task_or_agent" };
  }

  // 0. Идемпотентность: если для этого task_id уже есть кандидат —
  // не плодим дубликат.
  const dup = await checkDuplicateForTask(taskId);
  if (dup) {
    return { extracted: false, reason: "duplicate_for_task" };
  }

  // 1. Anthropic-ключ.
  const key = await getApiKey("anthropic").catch(() => null);
  if (!key) {
    return { extracted: false, reason: "no_anthropic_key" };
  }

  // 2. Контекст: задача, агент, правила, существующие навыки.
  const [task, agent] = await Promise.all([
    getTaskById(taskId).catch(() => null),
    getAgent(agentId).catch(() => null),
  ]);
  if (!task || !agent) {
    return { extracted: false, reason: "task_or_agent_not_found" };
  }
  const [rules, skills] = await Promise.all([
    getRulesForAgent(agentId).catch(() => []),
    getSkillsForAgent(agentId, { statuses: ["active", "pinned"] }).catch(() => []),
  ]);

  // 3. LLM-вызов.
  const model = await resolveDefaultAnthropicModel();
  const userPrompt = buildUserPrompt({
    agent,
    task,
    score,
    comment,
    rules,
    skills,
    result: task.result,
  });

  let llmResult;
  try {
    llmResult = await llmCall({
      provider: "anthropic",
      model,
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      cacheableBlocks: [],
      maxTokens: 1024,
    });
  } catch (err) {
    await recordCall({
      provider: "anthropic",
      model,
      success: false,
      error: err?.message ?? String(err),
      agentId,
      taskId,
      purpose: "skill_extraction",
    }).catch(() => {});
    return {
      extracted: false,
      reason: err instanceof LLMError ? `llm_error: ${err.message}` : "llm_error",
    };
  }

  await recordCall({
    provider: "anthropic",
    model,
    inputTokens: llmResult.inputTokens,
    outputTokens: llmResult.outputTokens,
    cachedTokens: llmResult.cachedTokens,
    success: true,
    agentId,
    taskId,
    purpose: "skill_extraction",
  });

  // 4. Парсинг ответа.
  let parsed;
  try {
    parsed = extractJson(llmResult.text);
  } catch {
    return { extracted: false, reason: "parse_failed" };
  }
  if (!parsed || parsed.has_pattern !== true) {
    return { extracted: false, reason: "no_pattern" };
  }

  const skillName = String(parsed.skill_name ?? "").trim();
  const whenToApply = String(parsed.when_to_apply ?? "").trim();
  const whatToDo = String(parsed.what_to_do ?? "").trim();
  const whyItWorks = String(parsed.why_it_works ?? "").trim();
  if (!skillName || !whenToApply || !whatToDo) {
    return { extracted: false, reason: "incomplete_payload" };
  }

  // 5. INSERT кандидата.
  const client = getServiceRoleClient();
  const { data: candidate, error } = await client
    .from(CANDIDATES_TABLE)
    .insert({
      agent_id: agentId,
      task_id: taskId,
      score: typeof score === "number" ? score : null,
      skill_name: skillName,
      when_to_apply: whenToApply,
      what_to_do: whatToDo,
      why_it_works: whyItWorks,
      status: "pending",
    })
    .select()
    .maybeSingle();
  if (error) {
    return { extracted: false, reason: `insert_error: ${error.message}` };
  }

  // 6. Нотификация в Inbox (тип skill_candidate — Сессия 18 валиден,
  // хотя UI для группы пока шаблонный).
  try {
    await createNotification({
      type: "skill_candidate",
      title: `Новый кандидат в навыки от ${agent.display_name}`,
      description: skillName.slice(0, 200),
      agent_id: agentId,
      related_entity_id: candidate?.id ?? null,
      related_entity_type: "skill_candidate",
      link: "/blog/team/staff/skill-candidates",
    });
  } catch (err) {
    console.warn(
      `[skillExtractor] createNotification(skill_candidate) failed for ${agentId}:`,
      err?.message ?? err,
    );
  }

  return { extracted: true, candidate_id: candidate?.id ?? null };
}

// Проверка: есть ли уже candidate с этим task_id (status != 'rejected').
// rejected пропускаем — если Влад отказал, можно попробовать снова.
async function checkDuplicateForTask(taskId) {
  if (!taskId) return false;
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(CANDIDATES_TABLE)
    .select("id, status")
    .eq("task_id", taskId)
    .neq("status", "rejected")
    .limit(1);
  if (error) {
    console.warn("[skillExtractor] checkDuplicateForTask:", error.message);
    return false;
  }
  return (data ?? []).length > 0;
}

// =========================================================================
// Batch-обработка для score = threshold - 1 (Сессия 26)
// =========================================================================
//
// Идея: задачи с оценкой ровно на 1 ниже порога — тоже хороший сигнал,
// но дорого делать LLM-проход на каждую. Раз в N часов (cron) или
// вручную (npm run extract:skills) проходим по таким задачам, у которых
// ещё нет кандидата.

export async function processBatchSkillExtraction(agentId, { dryRun = false } = {}) {
  if (!agentId) {
    throw new Error("agentId обязателен.");
  }
  const threshold = await getSkillThreshold();
  const batchScore = Math.max(0, threshold - 1);

  // Берём активные эпизоды этого агента с нужной оценкой, для которых
  // нет существующего candidate (status != rejected).
  const client = getServiceRoleClient();
  const { data: episodes, error } = await client
    .from("team_feedback_episodes")
    .select("id, task_id, score, raw_input, parsed_text")
    .eq("agent_id", agentId)
    .eq("score", batchScore)
    .not("task_id", "is", null)
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`Не удалось получить эпизоды агента ${agentId}: ${error.message}`);
  }
  if (!episodes || episodes.length === 0) {
    return { agent: agentId, batchScore, processed: 0, created: 0 };
  }

  let processed = 0;
  let created = 0;
  for (const ep of episodes) {
    if (!ep.task_id) continue;
    const dup = await checkDuplicateForTask(ep.task_id);
    if (dup) continue;
    processed += 1;
    if (dryRun) continue;
    const res = await extractSkillCandidate({
      taskId: ep.task_id,
      agentId,
      score: ep.score,
      comment: ep.parsed_text || ep.raw_input || "",
    });
    if (res.extracted) created += 1;
    // Rate-limit между LLM-вызовами.
    await new Promise((r) => setTimeout(r, 1000));
  }
  return { agent: agentId, batchScore, processed, created };
}

// =========================================================================
// Порог из team_settings
// =========================================================================

export async function getSkillThreshold() {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_settings")
    .select("value")
    .eq("key", "skill_extraction_threshold")
    .maybeSingle();
  if (error) {
    console.warn("[skillExtractor] getSkillThreshold:", error.message);
    return 5;
  }
  const value = data?.value;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 5;
  }
  return 5;
}
