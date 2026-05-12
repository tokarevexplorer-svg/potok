// Сессия 39 этапа 2 (пункт 20): маршруты Telegram.
//
// /webhook/:hash — приём Telegram update (без requireAuth, проверка
// через X-Telegram-Bot-Api-Secret-Token).
// Остальные — за requireAuth (Admin UI и привязка ботов).

import { Router } from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
  bindAgentBot,
  flushQueue,
  getAgentBots,
  getTelegramSettings,
  getWebhookSecret,
  isQuietHours,
  processIncomingUpdate,
  registerAllWebhooks,
  sendMessageFromSystem,
  unbindAgentBot,
  updateTelegramSettings,
} from "../../services/team/telegramService.js";

const router = Router();

// =========================================================================
// POST /api/team/telegram/webhook/:tokenHash
// НЕ требует requireAuth — секрет через заголовок.
// =========================================================================
router.post("/webhook/:tokenHash", async (req, res) => {
  const requiredSecret = getWebhookSecret();
  if (requiredSecret) {
    const incoming = req.headers["x-telegram-bot-api-secret-token"];
    if (incoming !== requiredSecret) {
      return res.status(401).json({ error: "invalid secret" });
    }
  }
  // Сессия 41: передаём tokenHash в processIncomingUpdate — нужен для
  // резолва бота при answerCallbackQuery и getFile (без него пришлось бы
  // искать по bot id из сообщения).
  try {
    const result = await processIncomingUpdate(req.body ?? {}, req.params.tokenHash);
    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[team/telegram] webhook failed:", err);
    return res.json({ ok: true, error: err.message }); // Telegram требует быстрый 200
  }
});

// Дальше — всё за requireAuth.
router.use(requireAuth);

router.get("/settings", async (_req, res) => {
  try {
    const s = await getTelegramSettings();
    const inQuiet = await isQuietHours();
    return res.json({
      ...s,
      systemTokenPresent: !!process.env.TELEGRAM_SYSTEM_BOT_TOKEN,
      webhookSecretPresent: !!process.env.TELEGRAM_WEBHOOK_SECRET,
      currentlyInQuietHours: inQuiet,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message ?? "ошибка" });
  }
});

router.patch("/settings", async (req, res) => {
  try {
    const next = await updateTelegramSettings(req.body ?? {});
    return res.json(next);
  } catch (err) {
    return res.status(400).json({ error: err.message ?? "ошибка" });
  }
});

router.get("/bots", async (_req, res) => {
  try {
    const bots = await getAgentBots();
    return res.json({ bots });
  } catch (err) {
    return res.status(500).json({ error: err.message ?? "ошибка" });
  }
});

router.post("/bots", async (req, res) => {
  const { agent_id, bot_token } = req.body ?? {};
  if (typeof agent_id !== "string" || !agent_id.trim()) {
    return res.status(400).json({ error: "agent_id обязателен" });
  }
  if (typeof bot_token !== "string" || !bot_token.trim()) {
    return res.status(400).json({ error: "bot_token обязателен" });
  }
  try {
    const bot = await bindAgentBot(agent_id, bot_token);
    return res.status(201).json({ bot });
  } catch (err) {
    return res.status(400).json({ error: err.message ?? "ошибка" });
  }
});

router.delete("/bots/:agentId", async (req, res) => {
  const { agentId } = req.params;
  try {
    await unbindAgentBot(agentId);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message ?? "ошибка" });
  }
});

router.post("/register-webhooks", async (req, res) => {
  const baseUrl = String(req.body?.base_url ?? "").trim();
  if (!baseUrl) {
    return res
      .status(400)
      .json({ error: "base_url обязателен (например https://my-backend.railway.app)" });
  }
  try {
    const result = await registerAllWebhooks(baseUrl);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message ?? "ошибка" });
  }
});

router.post("/test", async (req, res) => {
  const text = String(req.body?.text ?? "Тестовое сообщение от Поток (Сессия 39).");
  try {
    const result = await sendMessageFromSystem(text);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message ?? "ошибка" });
  }
});

router.post("/flush-queue", async (_req, res) => {
  try {
    const result = await flushQueue();
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message ?? "ошибка" });
  }
});

export default router;
