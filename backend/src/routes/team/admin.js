// REST-эндпоинты админки команды: управление API-ключами и порогом расходов.
//
// Ключи никогда не отдаём в открытом виде — только маскированный preview
// (первые 4 + последние 4 символа). Сами ключи лежат в team_api_keys и
// читаются service-role клиентом из llmClient.js при вызове модели.

import { Router } from "express";
import {
  setApiKey,
  deleteApiKey,
  getAllKeysStatus,
} from "../../services/team/keysService.js";
import {
  getTotalSpending,
  getAlertThreshold,
} from "../../services/team/costTracker.js";
import {
  getServiceRoleClient,
  setSetting,
} from "../../services/team/teamSupabase.js";

const router = Router();

const SUPPORTED_PROVIDERS = new Set(["anthropic", "openai", "google"]);

// Маскирует ключ до первых 4 и последних 4 символов: «sk-anth***...***xyzv».
// Используется в админке, чтобы пользователь видел, какой ключ записан, но
// не светил его целиком на экране.
function maskKey(value) {
  if (typeof value !== "string" || value.length === 0) return null;
  if (value.length <= 8) return `${value.slice(0, 2)}***`;
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

// =========================================================================
// GET /api/team/admin/keys
// Возвращает статус каждого провайдера: configured + masked-preview.
// =========================================================================

router.get("/keys", async (_req, res) => {
  try {
    const client = getServiceRoleClient();
    const { data, error } = await client
      .from("team_api_keys")
      .select("provider, key_value, updated_at");
    if (error) {
      return res.status(500).json({ error: `Не удалось прочитать ключи: ${error.message}` });
    }
    const status = {
      anthropic: { configured: false, masked: null, updatedAt: null },
      openai: { configured: false, masked: null, updatedAt: null },
      google: { configured: false, masked: null, updatedAt: null },
    };
    for (const row of data ?? []) {
      if (!status[row.provider]) continue;
      const hasKey = typeof row.key_value === "string" && row.key_value.length > 0;
      status[row.provider] = {
        configured: hasKey,
        masked: hasKey ? maskKey(row.key_value) : null,
        updatedAt: row.updated_at ?? null,
      };
    }
    return res.json({ keys: status });
  } catch (err) {
    console.error("[team] admin keys GET failed:", err);
    return res.status(500).json({ error: err.message ?? "Не удалось прочитать ключи" });
  }
});

// =========================================================================
// POST /api/team/admin/keys
// Body: { provider, key }
// =========================================================================

router.post("/keys", async (req, res) => {
  const { provider, key } = req.body ?? {};
  if (typeof provider !== "string" || !SUPPORTED_PROVIDERS.has(provider)) {
    return res.status(400).json({ error: "provider должен быть одним из: anthropic, openai, google" });
  }
  if (typeof key !== "string" || !key.trim()) {
    return res.status(400).json({ error: "key обязателен и не должен быть пустым" });
  }
  try {
    await setApiKey(provider, key);
    return res.json({ ok: true, provider });
  } catch (err) {
    console.error(`[team] admin keys POST (${provider}) failed:`, err);
    return res.status(500).json({ error: err.message ?? "Не удалось сохранить ключ" });
  }
});

// =========================================================================
// DELETE /api/team/admin/keys
// Body: { provider }
// =========================================================================

router.delete("/keys", async (req, res) => {
  const { provider } = req.body ?? {};
  if (typeof provider !== "string" || !SUPPORTED_PROVIDERS.has(provider)) {
    return res.status(400).json({ error: "provider должен быть одним из: anthropic, openai, google" });
  }
  try {
    await deleteApiKey(provider);
    return res.json({ ok: true, provider });
  } catch (err) {
    console.error(`[team] admin keys DELETE (${provider}) failed:`, err);
    return res.status(500).json({ error: err.message ?? "Не удалось удалить ключ" });
  }
});

// =========================================================================
// GET /api/team/admin/keys-status
// Возвращает простой объект {anthropic: bool, openai: bool, google: bool}.
// Полезно для индикатора «🟢/🔴» в шапке без полного ответа /keys.
// =========================================================================

router.get("/keys-status", async (_req, res) => {
  try {
    const status = await getAllKeysStatus();
    return res.json(status);
  } catch (err) {
    console.error("[team] admin keys-status failed:", err);
    return res.status(500).json({ error: err.message ?? "Не удалось прочитать статус" });
  }
});

// =========================================================================
// GET /api/team/admin/spending
// Агрегированные расходы (total_usd, by_provider, by_model, alert).
// =========================================================================

router.get("/spending", async (_req, res) => {
  try {
    const spending = await getTotalSpending();
    return res.json(spending);
  } catch (err) {
    console.error("[team] admin spending failed:", err);
    return res.status(500).json({ error: err.message ?? "Не удалось посчитать расходы" });
  }
});

// =========================================================================
// GET /api/team/admin/alert-threshold
// =========================================================================

router.get("/alert-threshold", async (_req, res) => {
  try {
    const value = await getAlertThreshold();
    return res.json({ value });
  } catch (err) {
    console.error("[team] admin alert-threshold GET failed:", err);
    return res.status(500).json({ error: err.message ?? "Не удалось прочитать порог" });
  }
});

// =========================================================================
// POST /api/team/admin/alert-threshold
// Body: { value: number | null }
// =========================================================================

router.post("/alert-threshold", async (req, res) => {
  const { value } = req.body ?? {};
  if (value !== null && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    return res.status(400).json({
      error: "value должен быть положительным числом или null (выключить)",
    });
  }
  try {
    await setSetting("alert_threshold_usd", value === null ? null : value);
    return res.json({ ok: true, value });
  } catch (err) {
    console.error("[team] admin alert-threshold POST failed:", err);
    return res.status(500).json({ error: err.message ?? "Не удалось сохранить порог" });
  }
});

export default router;
