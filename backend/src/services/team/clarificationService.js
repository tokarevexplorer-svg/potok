// Сессия 31 этапа 2 (пункт 17): сервис уточняющих вопросов от агента.
//
// При createTask с clarification_enabled=true:
//   1. taskRunner ставит задачу в статус 'clarifying'.
//   2. Вызывает generateClarifications — агент через дешёвую модель формулирует
//      до 3 вопросов, без которых не может качественно выполнить бриф.
//      Если вопросов нет — возвращает []; taskRunner сразу переводит в running.
//   3. Если есть вопросы — записывает их в clarification_questions, переводит
//      в awaiting_input.
//   4. UI показывает форму ответов. После сабмита → applyClarifications →
//      запись ответов + статус running + enqueueTeamTask.
//
// LLM-вызов с purpose='clarification'. Системный промпт берёт Role агента,
// чтобы вопросы были «в характере». Если агента нет — fallback на generic.

import { getAgent } from "./agentService.js";
import { getRoleFile } from "./agentService.js";
import { sendSystemRequest } from "./systemLLMService.js";

const MAX_QUESTIONS = 3;

// =========================================================================
// generateClarifications — формирует массив вопросов или []
// =========================================================================
export async function generateClarifications(task) {
  if (!task) return [];

  let agent = null;
  let roleSummary = "";
  if (task.agent_id) {
    try {
      agent = await getAgent(task.agent_id);
    } catch {
      // Агента нет — fallback на generic-промпт.
    }
    try {
      const role = await getRoleFile(task.agent_id);
      if (role && role.trim()) {
        roleSummary = role.slice(0, 1500);
      }
    } catch {
      // Role-файл может отсутствовать — это нормально.
    }
  }

  const systemPrompt = buildSystemPrompt(agent, roleSummary);
  const userPrompt = buildUserPrompt(task);

  // Сессия 49: переход на Системную LLM. provider/model берётся в Админке.
  let response;
  try {
    response = await sendSystemRequest({
      systemFunction: "clarification",
      systemPrompt,
      userPrompt,
      maxTokens: 600,
      taskId: task.id ?? null,
      agentId: task.agent_id ?? null,
    });
  } catch (err) {
    console.warn(`[clarification] LLM call failed: ${err?.message ?? err}`);
    return [];
  }

  return parseClarificationsResponse(response?.text ?? "");
}

function buildSystemPrompt(agent, roleSummary) {
  const lines = [
    "Ты анализируешь бриф задачи перед её выполнением.",
    agent
      ? `Тебя зовут ${agent.display_name}${agent.role_title ? ` (${agent.role_title})` : ""}.`
      : "У задачи нет привязанного агента — рассуждай от лица обобщённого исполнителя.",
  ];
  if (roleSummary) {
    lines.push("", "Твоя должностная инструкция:", roleSummary);
  }
  lines.push(
    "",
    `Сформулируй ДО ${MAX_QUESTIONS} вопросов, без которых ты не можешь качественно выполнить задачу.`,
    "Каждый вопрос — короткий, по одному пункту. Если бриф достаточный — верни пустой массив.",
    "",
    "Формат ответа — строго JSON:",
    '  [{"question": "...", "required": true|false}]',
    "  или []  (если вопросов нет)",
    "",
    "Ничего кроме JSON. Никаких объяснений, prefix‑markdown'а, fenced-блоков.",
  );
  return lines.join("\n");
}

function buildUserPrompt(task) {
  const params = task?.params && typeof task.params === "object" ? task.params : {};
  const userInput = (params.user_input ?? "").toString().trim();
  const lines = [];
  lines.push("Бриф задачи:");
  lines.push(userInput || "(пусто)");
  // Прикладываем остальные поля шаблона (source, point_name, …) — они тоже
  // часть ТЗ.
  const SKIP = new Set(["user_input", "agent_id", "agent_name"]);
  const extra = Object.entries(params).filter(
    ([k, v]) => !SKIP.has(k) && typeof v === "string" && v.trim(),
  );
  if (extra.length > 0) {
    lines.push("", "Дополнительные поля:");
    for (const [k, v] of extra) lines.push(`  ${k}: ${v}`);
  }
  return lines.join("\n");
}

export function parseClarificationsResponse(rawText) {
  let text = String(rawText ?? "").trim();
  // Уберём возможные markdown-обёртки ```json … ```.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) text = fence[1].trim();
  // Если модель прислала пояснение перед массивом — попробуем вырезать первый []-блок.
  const arrMatch = text.match(/\[\s*[\s\S]*?\s*\]/);
  if (!arrMatch) return [];
  let parsed;
  try {
    parsed = JSON.parse(arrMatch[0]);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const cleaned = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const question = typeof entry.question === "string" ? entry.question.trim() : "";
    if (!question) continue;
    cleaned.push({
      question,
      required: entry.required !== false, // дефолт true, если поле отсутствует
    });
    if (cleaned.length >= MAX_QUESTIONS) break;
  }
  return cleaned;
}

// =========================================================================
// applyClarifications — записывает ответы Влада
// =========================================================================
//
// Принимает { taskId, answers: [{ question, answer }] }. Сохраняет ответы
// в clarification_answers, не меняет статус — это делает caller (роут /clarify
// после applyClarifications → переводит в running и кладёт в очередь).
//
// Дополнительно: расширяет params.user_input текстом ответов как "## Уточнения
// от автора" — чтобы они автоматически попадали в основной промпт без правок
// шаблона. Возвращает обновлённый params для записи через mergeSnapshot.
export function buildEnrichedParams(currentParams, answers) {
  const params = { ...(currentParams || {}) };
  const userInput = (params.user_input ?? "").toString();
  const cleaned = (Array.isArray(answers) ? answers : [])
    .map((e) => ({
      question: typeof e?.question === "string" ? e.question.trim() : "",
      answer: typeof e?.answer === "string" ? e.answer.trim() : "",
    }))
    .filter((e) => e.question && e.answer);
  if (cleaned.length === 0) return params;
  const block = [
    "",
    "---",
    "## Уточнения от автора",
    "",
    ...cleaned.flatMap((e) => [`**${e.question}**`, e.answer, ""]),
  ].join("\n");
  params.user_input = (userInput || "").trim() + block;
  return params;
}
