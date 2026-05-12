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
//
// Сессия 41: полноценная обработка callback_query (Accept/Reject правил из
// inline-кнопок) и голосовых сообщений (reply на бота → Whisper → парсер
// обратной связи).

import { getServiceRoleClient } from "./teamSupabase.js";
import { transcribeFromBuffer } from "../transcriptionService.js";

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
  if (options.replyToMessageId) body.reply_to_message_id = options.replyToMessageId;

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
// Resolve bot by Telegram bot user id
// =========================================================================
// Используется для маршрутизации reply на бота → agent_id. Telegram присылает
// `reply_to_message.from.id` — это user-id бота, который сохранён в
// `team_telegram_bots.telegram_bot_id` (заполняется при bindAgentBot через
// getMe).
export async function getAgentBotByBotId(telegramBotId) {
  if (!telegramBotId) return null;
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_telegram_bots")
    .select("*")
    .eq("telegram_bot_id", telegramBotId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    console.warn(`[telegram] getAgentBotByBotId failed: ${error.message}`);
    return null;
  }
  return data ?? null;
}

// Резолв токена бота по hash из URL вебхука. Сначала проверяем системный,
// затем сканируем активных агентских ботов. Возвращает { token, kind, bot? }.
export async function resolveBotByTokenHash(hash) {
  const cleanHash = String(hash ?? "").trim();
  if (!cleanHash) return null;
  const systemToken = getSystemBotToken();
  if (systemToken && tokenHash(systemToken) === cleanHash) {
    return { token: systemToken, kind: "system", bot: null };
  }
  try {
    const bots = await getAgentBots();
    for (const bot of bots) {
      if (tokenHash(bot.bot_token) === cleanHash) {
        return { token: bot.bot_token, kind: "agent", bot };
      }
    }
  } catch (err) {
    console.warn(`[telegram] resolveBotByTokenHash failed: ${err?.message ?? err}`);
  }
  return null;
}

// =========================================================================
// Bot API helpers — answerCallbackQuery, getFile, downloadFile
// =========================================================================

export async function answerCallbackQuery(botToken, callbackQueryId, text = "", options = {}) {
  if (!botToken || !callbackQueryId) return { ok: false, reason: "missing params" };
  const body = { callback_query_id: callbackQueryId };
  if (text) body.text = text;
  if (options.alert) body.show_alert = true;
  try {
    await callBotApi(botToken, "answerCallbackQuery", body);
    return { ok: true };
  } catch (err) {
    console.warn(`[telegram] answerCallbackQuery failed: ${err?.message ?? err}`);
    return { ok: false, error: err?.message ?? String(err) };
  }
}

// editMessageReplyMarkup — снимает inline-кнопки после Accept/Reject, чтобы
// Влад не мог нажать ещё раз и получить «уже принято/отклонено».
//
// Telegram Bot API: чтобы убрать клавиатуру, передаём пустую структуру
// `{ inline_keyboard: [] }`. `null` или отсутствие поля → no change.
export async function editMessageReplyMarkup(botToken, chatId, messageId, replyMarkup = null) {
  if (!botToken || !chatId || !messageId) return { ok: false };
  const body = {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: replyMarkup === null ? { inline_keyboard: [] } : replyMarkup,
  };
  try {
    await callBotApi(botToken, "editMessageReplyMarkup", body);
    return { ok: true };
  } catch (err) {
    // 400 «message is not modified» / «message to edit not found» — ок,
    // не лог (это часто на повторных нажатиях или удалённых сообщениях).
    const msg = err?.message ?? "";
    if (msg.includes("not modified") || msg.includes("message to edit not found")) {
      return { ok: true };
    }
    console.warn(`[telegram] editMessageReplyMarkup failed: ${msg || err}`);
    return { ok: false, error: msg || String(err) };
  }
}

// Скачивание файла с серверов Telegram. Двухэтапно:
//   1. getFile → возвращает file_path.
//   2. https://api.telegram.org/file/bot<token>/<file_path> → бинарник.
// Возвращает Buffer.
export async function downloadTelegramFile(botToken, fileId) {
  if (!botToken || !fileId) throw new Error("Нужны botToken и fileId.");
  const meta = await callBotApi(botToken, "getFile", { file_id: fileId });
  if (!meta?.file_path) throw new Error("Telegram не вернул file_path");
  const url = `${TELEGRAM_API_BASE}/file/bot${botToken}/${meta.file_path}`;
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Не удалось скачать файл: HTTP ${resp.status}`);
  }
  const arrayBuf = await resp.arrayBuffer();
  return Buffer.from(arrayBuf);
}

// =========================================================================
// Incoming webhook router (Сессия 41)
// =========================================================================
// processIncomingUpdate принимает full update от Telegram и tokenHash из
// URL вебхука (нужен, чтобы знать, на какой бот ответить, особенно для
// callback_query). Если tokenHash не передан — резолвим через bot id из
// сообщения (callback_query.message.from / message.from).
export async function processIncomingUpdate(update, tokenHash = null) {
  if (!update || typeof update !== "object") return { handled: false };

  // 1. callback_query — Accept / Reject из inline-кнопок.
  if (update.callback_query) {
    return await processIncomingCallback(update.callback_query, tokenHash);
  }

  // 2. message с голосовым — reply к боту → парсер обратной связи.
  if (update.message && (update.message.voice || update.message.audio)) {
    return await processIncomingVoice(update.message, tokenHash);
  }

  return { handled: false, reason: "unsupported update type" };
}

// =========================================================================
// callback_query handler
// =========================================================================
// callback_data формат: `<action>:<id>`. Поддерживаемые action:
//   - accept_rule / reject_rule — принять/отклонить кандидата в правила
//     (memoryService.updateMemory). После — снять inline-кнопки и ответить
//     Владу в чат.
//   - accept_skill / reject_skill — заглушка (Сессия 27 решает на сайте,
//     через Telegram пока не утверждаем).
//   - dismiss_proposal / dismiss_handoff — пометить нотификацию прочитанной.
export async function processIncomingCallback(callbackQuery, urlTokenHash = null) {
  const callbackId = callbackQuery?.id;
  const data = String(callbackQuery?.data ?? "").trim();
  if (!callbackId || !data || !data.includes(":")) {
    return { handled: false, reason: "no callback_data" };
  }
  const [action, entityId] = data.split(":", 2);

  // Резолвим токен бота, чтобы ответить answerCallbackQuery.
  let botToken = null;
  if (urlTokenHash) {
    const resolved = await resolveBotByTokenHash(urlTokenHash);
    botToken = resolved?.token ?? null;
  }
  if (!botToken && callbackQuery?.message?.from?.id) {
    // Fallback: ищем бота по id того, чьё сообщение нажали.
    const bot = await getAgentBotByBotId(callbackQuery.message.from.id);
    botToken = bot?.bot_token ?? null;
  }
  if (!botToken) botToken = getSystemBotToken();

  const chatId = callbackQuery?.message?.chat?.id;
  const messageId = callbackQuery?.message?.message_id;

  let resultText = "";
  let success = false;
  try {
    if (action === "accept_rule") {
      const { updateMemory } = await import("./memoryService.js");
      await updateMemory(entityId, { status: "active" });
      await markNotificationByEntity(entityId, "memory");
      resultText = "✅ Правило принято";
      success = true;
    } else if (action === "reject_rule") {
      const { updateMemory } = await import("./memoryService.js");
      await updateMemory(entityId, { status: "rejected" });
      await markNotificationByEntity(entityId, "memory");
      resultText = "❌ Правило отклонено";
      success = true;
    } else if (action === "accept_skill" || action === "reject_skill") {
      resultText = "Открой Кандидаты в навыки в Потоке — там одобрение/правка с правом редактирования.";
    } else if (action === "dismiss") {
      await markNotificationByEntity(entityId);
      resultText = "Помечено прочитанным";
      success = true;
    } else {
      resultText = `Неизвестное действие: ${action}`;
    }
  } catch (err) {
    console.warn(`[telegram] callback ${action}:${entityId} failed: ${err?.message ?? err}`);
    resultText = `Ошибка: ${err?.message ?? "не удалось обработать"}`;
  }

  // Отвечаем на callback (поп-ап Влада в Telegram).
  if (botToken) {
    await answerCallbackQuery(botToken, callbackId, resultText);
    // Снимаем кнопки только при успехе — чтобы Влад не пытался снова.
    if (success && chatId && messageId) {
      await editMessageReplyMarkup(botToken, chatId, messageId, null);
      // Дописываем в исходное сообщение пометку «✅ Принято / ❌ Отклонено».
      // Telegram не даёт apprend к caption; используем sendMessage как reply.
      await sendMessage(botToken, chatId, resultText, {
        replyToMessageId: messageId,
      });
    }
  }

  return { handled: true, action, success };
}

// Помечаем нотификации, связанные с этой сущностью, как прочитанные.
// entityType опциональный — если не указан, ищем по related_entity_id.
async function markNotificationByEntity(entityId, _entityType = null) {
  if (!entityId) return;
  try {
    const client = getServiceRoleClient();
    await client
      .from("team_notifications")
      .update({ is_read: true })
      .eq("related_entity_id", entityId)
      .eq("is_read", false);
  } catch (err) {
    console.warn(`[telegram] markNotificationByEntity failed: ${err?.message ?? err}`);
  }
}

// =========================================================================
// voice handler — reply на бота → Whisper → parseAndSave
// =========================================================================
// Голосовое сообщение в общем чате считается обратной связью к КОНКРЕТНОМУ
// агенту, только если это reply на сообщение этого бота
// (reply_to_message.from.id === bot.telegram_bot_id). Без reply
// игнорируем — нельзя определить адресата.
export async function processIncomingVoice(message, urlTokenHash = null) {
  const voice = message?.voice || message?.audio;
  if (!voice?.file_id) return { handled: false, reason: "no file_id" };

  const replyTo = message?.reply_to_message;
  const replyBotId = replyTo?.from?.id;
  if (!replyTo || !replyBotId || !replyTo?.from?.is_bot) {
    // Не reply на бота — игнорируем. Сообщаем системным ботом, чтобы Влад
    // понимал, что голосовое нужно слать reply'ом.
    const sys = getSystemBotToken();
    const settings = await getTelegramSettings();
    if (sys && settings.chatId) {
      await sendMessage(
        sys,
        settings.chatId,
        "🎤 Голосовое получено, но не в reply на бота. Чтобы передать обратную связь — нажми reply на сообщение нужного агента и отправь голосом.",
      );
    }
    return { handled: false, reason: "voice without bot reply" };
  }

  // Определяем агента по bot_id.
  const targetBot = await getAgentBotByBotId(replyBotId);
  if (!targetBot) {
    return { handled: false, reason: "unknown bot id" };
  }
  const agentId = targetBot.agent_id;

  // Резолвим токен исходного бота (тот, который получил голосовое) —
  // нужен для getFile.
  let receiverToken = null;
  if (urlTokenHash) {
    const resolved = await resolveBotByTokenHash(urlTokenHash);
    receiverToken = resolved?.token ?? null;
  }
  if (!receiverToken) receiverToken = targetBot.bot_token;
  if (!receiverToken) {
    return { handled: false, reason: "no receiver token" };
  }

  // Подтверждение, что голосовое принято — от системного бота, чтобы Влад
  // сразу видел: «ок, услышал».
  const sys = getSystemBotToken();
  const settings = await getTelegramSettings();
  if (sys && settings.chatId) {
    await sendMessage(
      sys,
      settings.chatId,
      `🎤 Получил обратную связь для @${targetBot.bot_username ?? agentId}. Обрабатываю...`,
    );
  }

  // Скачиваем голосовое и прогоняем через Whisper. Любая ошибка — лог +
  // сообщение в чат, дальше не пускаем (Telegram уже получил 200).
  let transcript = "";
  try {
    const buffer = await downloadTelegramFile(receiverToken, voice.file_id);
    const result = await transcribeFromBuffer(buffer, "telegram-voice.ogg");
    transcript = (result?.text ?? "").trim();
  } catch (err) {
    console.warn(`[telegram] voice download/transcribe failed: ${err?.message ?? err}`);
    if (sys && settings.chatId) {
      await sendMessage(sys, settings.chatId, `❌ Не удалось расшифровать голосовое: ${err?.message ?? err}`);
    }
    return { handled: false, reason: "whisper failed", error: err?.message ?? String(err) };
  }

  if (!transcript) {
    if (sys && settings.chatId) {
      await sendMessage(sys, settings.chatId, "❌ Whisper не услышал речь в голосовом.");
    }
    return { handled: false, reason: "empty transcript" };
  }

  // Сохраняем как эпизод обратной связи. Score не указан — Влад голосом
  // оставляет открытую реакцию, без числовой оценки. parseAndSave сам
  // вызовет LLM-парсер и положит parsed_text.
  try {
    const { parseAndSave } = await import("./feedbackParserService.js");
    await parseAndSave({
      agentId,
      taskId: null,
      channel: "telegram",
      score: null,
      rawInput: transcript,
    });
  } catch (err) {
    console.warn(`[telegram] parseAndSave failed: ${err?.message ?? err}`);
    if (sys && settings.chatId) {
      await sendMessage(sys, settings.chatId, `❌ Не удалось сохранить эпизод: ${err?.message ?? err}`);
    }
    return { handled: false, reason: "parseAndSave failed" };
  }

  if (sys && settings.chatId) {
    const preview = transcript.length > 150 ? transcript.slice(0, 150) + "…" : transcript;
    await sendMessage(
      sys,
      settings.chatId,
      `✅ Сохранил эпизод для @${targetBot.bot_username ?? agentId}:\n<i>${escapeHtml(preview)}</i>`,
    );
  }

  return { handled: true, agentId, transcript_len: transcript.length };
}

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// =========================================================================
// dispatchNotificationToTelegram — Сессия 41 (дублирование Inbox)
// =========================================================================
// Вызывается из notificationsService.createNotification после INSERT.
// Fire-and-forget: ошибки логирует, не пробрасывает (нотификация уже
// создана, Telegram — побочный канал).
export async function dispatchNotificationToTelegram(notification) {
  if (!notification || typeof notification !== "object") return;
  try {
    const settings = await getTelegramSettings();
    if (!settings.enabled) return;
    if (!settings.chatId) return;

    const formatted = formatNotificationForTelegram(notification);
    if (!formatted) return;

    const options = {
      replyMarkup: formatted.replyMarkup,
      sourceType: "inbox_notification",
      sourceId: notification.id,
      agentId: notification.agent_id ?? null,
      priority: formatted.priority ?? "normal",
    };

    if (formatted.fromSystem) {
      await sendMessageFromSystem(formatted.text, options);
    } else if (notification.agent_id) {
      await sendMessageFromAgent(notification.agent_id, formatted.text, options);
    } else {
      // Нет агента — отправляем от системного бота.
      await sendMessageFromSystem(formatted.text, options);
    }
  } catch (err) {
    console.warn(`[telegram] dispatchNotification failed: ${err?.message ?? err}`);
  }
}

// Адрес фронта (для ссылок в сообщениях). Дефолт совпадает с
// dailyReportsJob.FRONTEND_URL.
function frontendUrl() {
  return (
    (process.env.FRONTEND_PUBLIC_URL && process.env.FRONTEND_PUBLIC_URL.trim()) ||
    "https://potok-omega.vercel.app"
  );
}

// Форматирование под тип нотификации. Возвращает { text, replyMarkup?,
// priority?, fromSystem? }, либо null если тип не нужно отправлять.
function formatNotificationForTelegram(n) {
  const title = escapeHtml(n.title ?? "");
  const desc = n.description ? escapeHtml(n.description) : "";
  const link = n.link ? `${frontendUrl()}${n.link}` : null;

  switch (n.type) {
    case "task_awaiting_review": {
      const url = link ?? `${frontendUrl()}/blog/team/dashboard`;
      const text = [
        `⭐ <b>Оцените задачу</b>`,
        title,
        desc,
        `<a href="${url}">Открыть</a>`,
      ]
        .filter(Boolean)
        .join("\n");
      return { text };
    }
    case "rule_candidate": {
      const text = [
        `📝 <b>Кандидат в правило</b>`,
        title,
        desc,
        link ? `<a href="${link}">Открыть кандидатов</a>` : null,
      ]
        .filter(Boolean)
        .join("\n");
      // Inline-кнопки Accept / Reject с callback_data.
      const replyMarkup = {
        inline_keyboard: [
          [
            { text: "✅ Принять", callback_data: `accept_rule:${n.related_entity_id ?? ""}` },
            { text: "❌ Отклонить", callback_data: `reject_rule:${n.related_entity_id ?? ""}` },
          ],
        ],
      };
      return { text, replyMarkup };
    }
    case "skill_candidate": {
      const url = link ?? `${frontendUrl()}/blog/team/staff/skill-candidates`;
      const text = [
        `🎓 <b>Кандидат в навыки</b>`,
        title,
        desc,
        `<a href="${url}">Открыть</a>`,
      ]
        .filter(Boolean)
        .join("\n");
      return { text };
    }
    case "handoff_suggestion": {
      const url = link ?? `${frontendUrl()}/blog/team/dashboard`;
      const text = [
        `🔄 <b>Предложение передачи</b>`,
        title,
        desc,
        `<a href="${url}">Открыть</a>`,
      ]
        .filter(Boolean)
        .join("\n");
      return { text };
    }
    case "proposal": {
      const url = link ?? `${frontendUrl()}/blog/team/dashboard`;
      // Срочные proposal'ы помечаем priority=urgent (мимо тихого часа).
      const isUrgent = /urgent|срочн/i.test(n.description ?? "");
      const prefix = isUrgent ? "⚡ " : "🎯 ";
      const text = [
        `${prefix}<b>Предложение задачи</b>`,
        title,
        desc,
        `<a href="${url}">Открыть Inbox</a>`,
      ]
        .filter(Boolean)
        .join("\n");
      return { text, priority: isUrgent ? "urgent" : "normal" };
    }
    case "rule_revision": {
      const text = [
        `🔁 <b>Curator: правило требует ревизии</b>`,
        title,
        desc,
        link ? `<a href="${link}">Открыть</a>` : null,
      ]
        .filter(Boolean)
        .join("\n");
      return { text, fromSystem: true };
    }
    default:
      return null;
  }
}
