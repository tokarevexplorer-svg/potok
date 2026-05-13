// Сессия 40 этапа 2 (пункт 20): ежедневные отчёты агентов в Telegram-чат.
//
// Cron каждую минуту проверяет, совпадает ли текущее время с
// telegram_daily_report_time (в timezone из quiet_hours). При совпадении —
// для каждого активного агента с привязанным ботом:
//   1. Собирает задачи за сегодня.
//   2. Если задач нет → пропускаем агента.
//   3. Если есть → формирует отчёт через Системную LLM (дешёвая модель).
//   4. Отправляет от бота агента через sendMessageFromAgent.
//
// Защита от двойной отправки: записываем last_report_date в team_settings
// (ключ `telegram_last_report_date`). Если совпадает с сегодняшней датой —
// пропускаем все агенты.

import {
  getTelegramSettings,
  getSystemBotToken,
  sendMessageFromAgent,
  getAgentBots,
} from "../services/team/telegramService.js";
import { getServiceRoleClient } from "../services/team/teamSupabase.js";
import { call as llmCall } from "../services/team/llmClient.js";
import { recordCall } from "../services/team/costTracker.js";
import { getApiKey } from "../services/team/keysService.js";
import { getAgent } from "../services/team/agentService.js";

// Адрес фронта — нужно для ссылок в Telegram-отчётах. Берём из ENV, чтобы
// можно было переопределить (preview/staging). На проде — potok-omega.
const FRONTEND_URL =
  (process.env.FRONTEND_PUBLIC_URL && process.env.FRONTEND_PUBLIC_URL.trim()) ||
  "https://potok-omega.vercel.app";

// =========================================================================
// Главный entrypoint — вызывается cron'ом каждую минуту.
// =========================================================================
export async function tickDailyReports(now = new Date()) {
  if (!getSystemBotToken()) return { reason: "no system token" };
  const settings = await getTelegramSettings();
  if (!settings.enabled) return { reason: "telegram disabled" };
  if (!settings.chatId) return { reason: "no chat_id" };

  // Проверяем, совпадает ли текущее время с запланированным.
  const tz = settings.quietHours?.timezone || "Europe/Moscow";
  const reportTime = String(settings.dailyReportTime ?? "19:00").trim();
  if (!matchesTime(now, reportTime, tz)) {
    return { reason: "time mismatch" };
  }

  // Защита от двойной отправки за один день.
  const todayDate = formatDate(now, tz);
  const already = await getLastReportDate();
  if (already === todayDate) {
    return { reason: "already sent today" };
  }
  await setLastReportDate(todayDate);

  const bots = await getAgentBots();
  const results = [];
  for (const bot of bots) {
    try {
      const result = await sendAgentReport(bot.agent_id, now, tz);
      results.push({ agent_id: bot.agent_id, ...result });
    } catch (err) {
      results.push({ agent_id: bot.agent_id, ok: false, error: err?.message ?? String(err) });
    }
  }
  return { date: todayDate, results };
}

// =========================================================================
// Проверка совпадения времени с reportTime (HH:MM) в нужной timezone.
// =========================================================================
function matchesTime(at, reportTime, tz) {
  const m = String(reportTime).match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  const targetHour = parseInt(m[1], 10);
  const targetMinute = parseInt(m[2], 10);
  if (!Number.isFinite(targetHour) || !Number.isFinite(targetMinute)) return false;

  let hourStr;
  let minuteStr;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }).formatToParts(at);
    hourStr = parts.find((p) => p.type === "hour")?.value ?? "";
    minuteStr = parts.find((p) => p.type === "minute")?.value ?? "";
  } catch {
    return false;
  }
  return parseInt(hourStr, 10) === targetHour && parseInt(minuteStr, 10) === targetMinute;
}

// =========================================================================
// Формат даты в нужной timezone: YYYY-MM-DD.
// =========================================================================
function formatDate(at, tz) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone: tz,
    }).formatToParts(at);
    const y = parts.find((p) => p.type === "year")?.value ?? "0000";
    const m = parts.find((p) => p.type === "month")?.value ?? "01";
    const d = parts.find((p) => p.type === "day")?.value ?? "01";
    return `${y}-${m}-${d}`;
  } catch {
    return at.toISOString().slice(0, 10);
  }
}

// =========================================================================
// last_report_date в team_settings.
// =========================================================================
async function getLastReportDate() {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_settings")
    .select("value")
    .eq("key", "telegram_last_report_date")
    .maybeSingle();
  if (error || !data) return null;
  return typeof data.value === "string" ? data.value : null;
}

async function setLastReportDate(date) {
  const client = getServiceRoleClient();
  const { error } = await client
    .from("team_settings")
    .upsert({ key: "telegram_last_report_date", value: date }, { onConflict: "key" });
  if (error) {
    console.warn(`[dailyReports] setLastReportDate failed: ${error.message}`);
  }
}

// =========================================================================
// Отчёт по одному агенту.
// =========================================================================
// Экспортирован с Сессии 42 — нужен для интеграционного теста
// (test-telegram.js, тест paused-агента). Был internal-only.
export async function sendAgentReport(agentId, now, tz) {
  // Задачи агента за сегодня (по созданию). Берём DISTINCT ON (id) — последний
  // снапшот каждой задачи.
  const startOfDayIso = startOfDayInTz(now, tz).toISOString();
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_tasks")
    .select("id, type, title, status, result, created_at")
    .eq("agent_id", agentId)
    .gte("created_at", startOfDayIso)
    .order("created_at", { ascending: false });
  if (error) {
    return { ok: false, error: `query: ${error.message}` };
  }
  // Дедуп по id.
  const seen = new Set();
  const latest = [];
  for (const row of data ?? []) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    latest.push(row);
  }
  if (latest.length === 0) {
    return { ok: false, reason: "no tasks today" };
  }

  // Дёргаем агента для display_name.
  let agent;
  try {
    agent = await getAgent(agentId);
  } catch {
    agent = { display_name: agentId };
  }

  // Сессия 42: paused/archived агенты не получают ежедневный отчёт даже если
  // запись бота ещё `active` в team_telegram_bots. Telegram-бот живёт отдельно
  // от статуса агента — этот гард их сшивает в одну сторону.
  if (agent && agent.status && agent.status !== "active") {
    return { ok: false, reason: `agent status ${agent.status}` };
  }

  // Generate отчёт через дешёвую LLM.
  const provider = await pickCheapProvider();
  if (!provider) {
    return { ok: false, error: "no LLM provider" };
  }

  const reportText = await composeReport({
    agent,
    tasks: latest,
    provider,
  });

  // Отправляем через бот агента.
  const result = await sendMessageFromAgent(agentId, reportText, {
    sourceType: "daily_report",
    sourceId: formatDate(now, tz),
    agentId,
  });
  return { ok: !!result.ok, queued: !!result.queued, sent: !!result.ok };
}

function startOfDayInTz(at, tz) {
  const d = formatDate(at, tz);
  return new Date(`${d}T00:00:00`);
}

async function pickCheapProvider() {
  const options = [
    { name: "anthropic", model: "claude-haiku-4-5" },
    { name: "openai", model: "gpt-4o-mini" },
    { name: "google", model: "gemini-2.5-flash" },
  ];
  for (const o of options) {
    try {
      const key = await getApiKey(o.name);
      if (key) return o;
    } catch {
      // continue
    }
  }
  return null;
}

async function composeReport({ agent, tasks, provider }) {
  // Сводка задач: id, type, status, краткий результат.
  const tasksLines = tasks
    .map((t, idx) => {
      const result = (t.result ?? "").slice(0, 200).replace(/\s+/g, " ").trim();
      const title = t.title ?? t.type;
      return `${idx + 1}. [${t.status}] ${title} (id ${t.id})${result ? ` — ${result}` : ""}`;
    })
    .join("\n");

  const systemPrompt = [
    "Ты — Системная LLM. Сформируй короткий отчёт за день агента команды.",
    "Формат: HTML (parse_mode=HTML), без markdown.",
    "Структура:",
    "  📋 <b>Отчёт за день — &lt;имя агента&gt;</b>",
    "",
    "  <b>Сделано:</b>",
    "  - <короткое описание задачи 1>",
    "  - ...",
    "",
    "  <b>Как это приближает к целям:</b>",
    "  <1-2 предложения, без шаблонных «способствует»>",
    "",
    "  <b>Что полезно дальше:</b>",
    "  <1-2 предложения>",
    "",
    "  <ссылки на задачи: ...>",
    "Никаких лишних разделов. Без эмодзи внутри текста, кроме того, что в заголовке.",
  ].join("\n");

  const userPrompt = [
    `Агент: ${agent.display_name ?? agent.id} (${agent.role_title ?? "—"}).`,
    "",
    "Задачи за сегодня:",
    tasksLines || "(нет)",
    "",
    "Ссылки на задачи:",
    ...tasks.map((t) => `${FRONTEND_URL}/blog/team/tasks/${t.id}`),
  ].join("\n");

  let response;
  try {
    response = await llmCall({
      provider: provider.name,
      model: provider.model,
      systemPrompt,
      userPrompt,
      maxTokens: 1500,
    });
  } catch (err) {
    console.warn(`[dailyReports] LLM failed: ${err?.message ?? err}`);
    return fallbackReport(agent, tasks);
  }

  try {
    await recordCall({
      provider: provider.name,
      model: provider.model,
      inputTokens: Number(response?.inputTokens ?? 0),
      outputTokens: Number(response?.outputTokens ?? 0),
      cachedTokens: Number(response?.cachedTokens ?? 0),
      taskId: null,
      success: true,
      agentId: agent.id ?? null,
      purpose: "telegram_report",
    });
  } catch (err) {
    console.warn(`[dailyReports] recordCall failed: ${err?.message ?? err}`);
  }

  return response?.text ?? fallbackReport(agent, tasks);
}

function fallbackReport(agent, tasks) {
  const lines = [
    `📋 <b>Отчёт за день — ${escapeHtml(agent.display_name ?? agent.id)}</b>`,
    "",
    "<b>Сделано:</b>",
    ...tasks.map((t) => `- [${t.status}] ${escapeHtml(t.title ?? t.type)}`),
    "",
    "<ссылки>",
    ...tasks.map((t) => `${FRONTEND_URL}/blog/team/tasks/${t.id}`),
  ];
  return lines.join("\n");
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// =========================================================================
// Сессия 40: push-уведомление о завершении задачи.
//
// Вызывается из taskRunner.markDoneInBackground после перехода задачи в done.
// Не упасть из-за Telegram-проблем — все ошибки glommed.
// =========================================================================
export async function pushTaskDoneNotification(task) {
  if (!task || !task.agent_id) return { ok: false, reason: "no agent" };
  if (!getSystemBotToken()) return { ok: false, reason: "no system token" };
  const settings = await getTelegramSettings();
  if (!settings.enabled || !settings.chatId) return { ok: false, reason: "telegram off" };

  const title = task.title ?? task.type ?? "(без названия)";
  const summary = (task.result ?? "").trim().slice(0, 200).replace(/\s+/g, " ");
  const url = `${FRONTEND_URL}/blog/team/tasks/${task.id}`;

  const text = [
    `✅ <b>Готово:</b> ${escapeHtml(title)}`,
    summary ? escapeHtml(summary) + (task.result && task.result.length > 200 ? "…" : "") : "",
    `<a href="${url}">Открыть задачу</a>`,
  ]
    .filter(Boolean)
    .join("\n");

  return await sendMessageFromAgent(task.agent_id, text, {
    sourceType: "task_done",
    sourceId: task.id,
    agentId: task.agent_id,
  });
}
