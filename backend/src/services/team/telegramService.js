// Сессия 39 этапа 2 (пункт 20): сервис Telegram-уведомлений.
//
// Конструкция: системный бот (ENV TELEGRAM_SYSTEM_BOT_TOKEN) для общих
// сообщений + N ботов агентов (привязываются через UI карточки агента,
// токены в team_telegram_bots). Тихий час → очередь. Webhook принимает
// голосовые сообщения и callback'и от inline-кнопок.
//
// Деградация: если TELEGRAM_SYSTEM_BOT_TOKEN не задан, ВСЕ send-функции
// тихо проваливаются с return false. Бэкенд продолжает работать без
// Telegram — это ожидаемо в dev-окружении.

import { getServiceRoleClient } from "./teamSupabase.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";

// =========================================================================
// Settings — читаем telegram_enabled, chat_id, тихий час из team_settings
// =========================================================================

let settingsCache = { value: null, expiresAt: 0 };
const SETTINGS_TTL_MS = 30_000;

export async function getTelegramSettings() {
  const now = Date.now();
  if (settingsCache.value && settingsCache.expiresAt > now) {
    return settingsCache.value;
  }
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_settings")
    .select("key, value")
    .in("key", [
      "telegram_enabled",
      "telegram_chat_id",
      "telegram_daily_report_time",
      "telegram_quiet_hours",
    ]);
  if (error) {
    console.warn(`[telegram] getSettings failed: ${error.message}`);
    return getDefaultSettings();
  }
  const out = getDefaultSettings();
  for (const row of data ?? []) {
    const k = row.key;
    const v = row.value;
    if (k === "telegram_enabled") out.enabled = v === true;
    else if (k === "telegram_chat_id") out.chatId = typeof v === "string" ? v : "";
    else if (k === "telegram_daily_report_time")
      out.dailyReportTime = typeof v === "string" ? v : "19:00";
    else if (k === "telegram_quiet_hours" && v && typeof v === "object") out.quietHours = v;
  }
  settingsCache = { value: out, expiresAt: now + SETTINGS_TTL_MS };
  return out;
}

function getDefaultSettings() {
  return {
    enabled: false,
    chatId: "",
    dailyReportTime: "19:00",
    quietHours: { start_hour: 22, end_hour: 9, timezone: "Europe/Moscow" },
  };
}

export function clearTelegramSettingsCache() {
  settingsCache = { value: null, expiresAt: 0 };
}

export async function updateTelegramSettings(patch) {
  const client = getServiceRoleClient();
  const updates = [];
  if (typeof patch.enabled === "boolean") {
    updates.push({ key: "telegram_enabled", value: patch.enabled });
  }
  if (typeof patch.chatId === "string") {
    updates.push({ key: "telegram_chat_id", value: patch.chatId });
  }
  if (typeof patch.dailyReportTime === "string") {
    updates.push({ key: "telegram_daily_report_time", value: patch.dailyReportTime });
  }
  if (patch.quietHours && typeof patch.quietHours === "object") {
    updates.push({ key: "telegram_quiet_hours", value: patch.quietHours });
  }
  for (const u of updates) {
    const { error } = await client.from("team_settings").upsert(u, { onConflict: "key" });
    if (error) throw new Error(`Не удалось обновить ${u.key}: ${error.message}`);
  }
  clearTelegramSettingsCache();
  return getTelegramSettings();
}

// =========================================================================
// Tokens — системный из ENV, агентские из team_telegram_bots.
// =========================================================================

export function getSystemBotToken() {
  const token = process.env.TELEGRAM_SYSTEM_BOT_TOKEN;
  return token && token.trim() ? token.trim() : null;
}

export function getWebhookSecret() {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  return secret && secret.trim() ? secret.trim() : null;
}

export async function getAgentBots() {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_telegram_bots")
    .select("*")
    .eq("status", "active");
  if (error) throw new Error(`Не удалось получить ботов агентов: ${error.message}`);
  return data ?? [];
}

export async function getAgentBot(agentId) {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_telegram_bots")
    .select("*")
    .eq("agent_id", agentId)
    .maybeSingle();
  if (error) throw new Error(`Не удалось получить бота: ${error.message}`);
  return data ?? null;
}

export async function bindAgentBot(agentId, botToken) {
  const cleanToken = String(botToken ?? "").trim();
  if (!cleanToken) throw new Error("Токен бота обязателен.");
  // Дёрнем getMe чтобы валидировать токен и заодно сохранить username + bot_id.
  let me = null;
  try {
    me = await callBotApi(cleanToken, "getMe");
  } catch (err) {
    throw new Error(`Токен не валиден: ${err?.message ?? err}`);
  }
  const client = getServiceRoleClient();
  const row = {
    agent_id: agentId,
    bot_token: cleanToken,
    bot_username: me?.username ?? null,
    telegram_bot_id: me?.id ?? null,
    status: "active",
  };
  const { data, error } = await client
    .from("team_telegram_bots")
    .upsert(row, { onConflict: "agent_id" })
    .select()
    .maybeSingle();
  if (error) throw new Error(`Не удалось привязать бота: ${error.message}`);
  return data;
}

export async function unbindAgentBot(agentId) {
  const client = getServiceRoleClient();
  const { error } = await client.from("team_telegram_bots").delete().eq("agent_id", agentId);
  if (error) throw new Error(`Не удалось отвязать бота: ${error.message}`);
  return true;
}

// =========================================================================
// Bot API helper
// =========================================================================

async function callBotApi(botToken, method, body = null) {
  const url = `${TELEGRAM_API_BASE}/bot${botToken}/${method}`;
  let resp;
  try {
    resp = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new Error(`network error: ${err?.message ?? err}`);
  }
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || !json.ok) {
    // 429 retry-after — пропускаем наружу, чтобы caller мог обработать.
    const description = json?.description ?? `HTTP ${resp.status}`;
    const error = new Error(description);
    error.statusCode = resp.status;
    error.retryAfter = json?.parameters?.retry_after ?? null;
    throw error;
  }
  return json.result;
}

// =========================================================================
// Quiet hours
// =========================================================================

export async function isQuietHours(at = new Date()) {
  const { quietHours } = await getTelegramSettings();
  if (!quietHours) return false;
  const tz = quietHours.timezone || "Europe/Moscow";
  // Получаем час в нужной timezone через Intl.DateTimeFormat.
  let hourStr;
  try {
    hourStr = new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hour12: false,
      timeZone: tz,
    }).format(at);
  } catch {
    hourStr = String(at.getUTCHours());
  }
  const hour = parseInt(hourStr, 10);
  if (Number.isNaN(hour)) return false;
  const start = Number(quietHours.start_hour ?? 22);
  const end = Number(quietHours.end_hour ?? 9);
  // Тихий час может пересекать полночь: start=22, end=9 → [22..24) ∪ [0..9).
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  return hour >= start || hour < end;
}

// =========================================================================
// sendMessage / sendOrEnqueue
// =========================================================================

export async function sendMessage(botToken, chatId, text, options = {}) {
  if (!botToken || !chatId || !text) return { ok: false, reason: "missing params" };
  const body = {
    chat_id: chatId,
    text,
    parse_mode: options.parseMode ?? "HTML",
    disable_web_page_preview: options.disableWebPagePreview ?? true,
  };
  if (options.replyMarkup) body.reply_markup = options.replyMarkup;

  let attempt = 0;
  const maxAttempts = 3;
  while (attempt < maxAttempts) {
    try {
      const result = await callBotApi(botToken, "sendMessage", body);
      return { ok: true, message_id: result?.message_id ?? null };
    } catch (err) {
      attempt += 1;
      if (err.statusCode === 429 && err.retryAfter && attempt < maxAttempts) {
        const waitMs = Math.min(err.retryAfter * 1000, 30_000);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      console.warn(`[telegram] sendMessage failed: ${err?.message ?? err}`);
      return { ok: false, error: err?.message ?? String(err) };
    }
  }
  return { ok: false, error: "exceeded max retries" };
}

export async function sendMessageFromSystem(text, options = {}) {
  const settings = await getTelegramSettings();
  if (!settings.enabled) return { ok: false, reason: "telegram disabled" };
  const token = getSystemBotToken();
  if (!token) return { ok: false, reason: "no system token" };
  if (!settings.chatId) return { ok: false, reason: "no chat_id" };
  return sendOrEnqueue(token, settings.chatId, text, options);
}

export async function sendMessageFromAgent(agentId, text, options = {}) {
  const settings = await getTelegramSettings();
  if (!settings.enabled) return { ok: false, reason: "telegram disabled" };
  if (!settings.chatId) return { ok: false, reason: "no chat_id" };
  let bot;
  try {
    bot = await getAgentBot(agentId);
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
  if (!bot || bot.status !== "active" || !bot.bot_token) {
    return { ok: false, reason: "no agent bot" };
  }
  return sendOrEnqueue(bot.bot_token, settings.chatId, text, { ...options, agentId });
}

export async function sendOrEnqueue(botToken, chatId, text, options = {}) {
  const urgent = options.priority === "urgent";
  if (urgent || !(await isQuietHours())) {
    return sendMessage(botToken, chatId, text, options);
  }
  await enqueueMessage(botToken, chatId, text, options);
  return { ok: true, queued: true };
}

export async function enqueueMessage(botToken, chatId, text, options = {}) {
  const client = getServiceRoleClient();
  const row = {
    bot_token: botToken,
    chat_id: chatId,
    message_text: text,
    reply_markup: options.replyMarkup ?? null,
    priority: options.priority === "urgent" ? "urgent" : "normal",
    source_type: options.sourceType ?? null,
    source_id: options.sourceId ?? null,
    agent_id: options.agentId ?? null,
  };
  const { error } = await client.from("team_telegram_queue").insert(row);
  if (error) {
    console.warn(`[telegram] enqueueMessage failed: ${error.message}`);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// =========================================================================
// flushQueue — раз в 5 минут проверяем, не закончился ли тихий час
// =========================================================================
export async function flushQueue() {
  // Если тихий час ещё идёт — ничего не делаем (кроме urgent, но они уже
  // отправляются мимо очереди в sendOrEnqueue).
  if (await isQuietHours()) {
    return { sent: 0, skipped: "still in quiet hours" };
  }
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_telegram_queue")
    .select("*")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(50);
  if (error) {
    console.warn(`[telegram] flushQueue select failed: ${error.message}`);
    return { sent: 0, error: error.message };
  }
  let sent = 0;
  let failed = 0;
  for (const item of data ?? []) {
    const result = await sendMessage(item.bot_token, item.chat_id, item.message_text, {
      replyMarkup: item.reply_markup,
    });
    const patch = result.ok
      ? { status: "sent", sent_at: new Date().toISOString() }
      : { status: "failed" };
    const { error: updErr } = await client
      .from("team_telegram_queue")
      .update(patch)
      .eq("id", item.id);
    if (updErr) {
      console.warn(`[telegram] flushQueue update failed: ${updErr.message}`);
      continue;
    }
    if (result.ok) sent += 1;
    else failed += 1;
  }
  return { sent, failed };
}

// =========================================================================
// Webhook registration
// =========================================================================

export async function registerWebhook(botToken, webhookUrl) {
  const secret = getWebhookSecret();
  const body = { url: webhookUrl };
  if (secret) body.secret_token = secret;
  try {
    await callBotApi(botToken, "setWebhook", body);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

export async function registerAllWebhooks(baseUrl) {
  if (!baseUrl) {
    return { registered: 0, error: "baseUrl required (e.g. https://my-backend.railway.app)" };
  }
  const results = [];
  const systemToken = getSystemBotToken();
  if (systemToken) {
    const r = await registerWebhook(
      systemToken,
      `${baseUrl}/api/team/telegram/webhook/${tokenHash(systemToken)}`,
    );
    results.push({ kind: "system", ...r });
  }
  const bots = await getAgentBots();
  for (const bot of bots) {
    const r = await registerWebhook(
      bot.bot_token,
      `${baseUrl}/api/team/telegram/webhook/${tokenHash(bot.bot_token)}`,
    );
    results.push({ kind: "agent", agent_id: bot.agent_id, ...r });
  }
  return {
    registered: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    details: results,
  };
}

// Простой хэш токена — для подстановки в URL вебхука. Не криптостойкий,
// нужен только чтобы не выкладывать сам токен в URL.
export function tokenHash(token) {
  let h = 5381;
  for (let i = 0; i < token.length; i++) {
    h = (h * 33) ^ token.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}

// =========================================================================
// Incoming webhook payload — заглушки для будущих сессий
// =========================================================================
// Полноценная обработка голосовых (Whisper) и inline-callback'ов
// будет в Сессии 41. Сейчас оставляем заглушки, чтобы webhook не падал.
export async function processIncomingUpdate(update) {
  if (!update || typeof update !== "object") return { handled: false };
  if (update.message?.voice || update.message?.audio) {
    return { handled: false, reason: "voice/audio handler — Сессия 41" };
  }
  if (update.callback_query) {
    return { handled: false, reason: "callback_query handler — Сессия 41" };
  }
  return { handled: false, reason: "unknown update type" };
}
