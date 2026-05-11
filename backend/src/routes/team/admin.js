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
  getDailySpentUsd,
} from "../../services/team/costTracker.js";
import {
  getServiceRoleClient,
  setSetting,
} from "../../services/team/teamSupabase.js";
import { downloadFile } from "../../services/team/teamStorage.js";
import { requireAuth } from "../../middleware/requireAuth.js";
import { getLimits, updateLimits } from "../../services/team/limitsService.js";
import {
  getWhitelistedEmailSources,
  clearWhitelistCache,
} from "../../services/team/whitelistService.js";
import {
  getDevMode,
  enableDevMode,
  disableDevMode,
} from "../../services/team/devModeService.js";

const router = Router();

router.use(requireAuth);

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

// =========================================================================
// GET /api/team/admin/models-config
// Возвращает содержимое team-config/presets.json и pricing.json + статус
// ключей. UI ModelSelector рендерит пресеты и продвинутый выбор по этим
// данным. Один эндпоинт — чтобы избежать тройного round-trip'а с фронта
// на каждый рендер модалки запуска задачи.
// =========================================================================

router.get("/models-config", async (_req, res) => {
  const result = { presets: {}, pricing: {}, keys: null };
  // Каждый ресурс — best effort: одна ошибка не валит другой. Если конфигов
  // нет (Влад ещё не загрузил) — возвращаем пустые объекты, UI покажет
  // подсказку.
  try {
    const raw = await downloadFile("team-config", "presets.json");
    result.presets = JSON.parse(raw);
  } catch (err) {
    console.warn("[team] models-config: presets.json не загружен:", err.message);
  }
  try {
    const raw = await downloadFile("team-config", "pricing.json");
    result.pricing = JSON.parse(raw);
  } catch (err) {
    console.warn("[team] models-config: pricing.json не загружен:", err.message);
  }
  try {
    result.keys = await getAllKeysStatus();
  } catch (err) {
    console.warn("[team] models-config: keys-status не получен:", err.message);
  }
  return res.json(result);
});

// =========================================================================
// GET /api/team/admin/limits
// Жёсткие лимиты расходов (Сессия 2 этапа 2) + текущий дневной спенд.
// =========================================================================

router.get("/limits", async (_req, res) => {
  try {
    const limits = await getLimits();
    const dailySpent = await getDailySpentUsd();
    return res.json({
      daily: {
        limit_usd: limits.daily_limit_usd,
        enabled: limits.daily_enabled,
      },
      task: {
        limit_usd: limits.task_limit_usd,
        enabled: limits.task_enabled,
      },
      daily_spent_usd: dailySpent,
    });
  } catch (err) {
    console.error("[team] admin limits GET failed:", err);
    return res.status(500).json({ error: err.message ?? "Не удалось прочитать лимиты" });
  }
});

// =========================================================================
// PATCH /api/team/admin/limits
// Body: { daily_limit_usd?, daily_enabled?, task_limit_usd?, task_enabled? }
// =========================================================================

router.patch("/limits", async (req, res) => {
  const body = req.body ?? {};
  const patch = {};
  if (body.daily_limit_usd !== undefined) {
    const n = Number(body.daily_limit_usd);
    if (!Number.isFinite(n) || n <= 0) {
      return res.status(400).json({ error: "daily_limit_usd должен быть числом > 0" });
    }
    patch.daily_limit_usd = n;
  }
  if (body.task_limit_usd !== undefined) {
    const n = Number(body.task_limit_usd);
    if (!Number.isFinite(n) || n <= 0) {
      return res.status(400).json({ error: "task_limit_usd должен быть числом > 0" });
    }
    patch.task_limit_usd = n;
  }
  if (body.daily_enabled !== undefined) {
    if (typeof body.daily_enabled !== "boolean") {
      return res.status(400).json({ error: "daily_enabled должен быть boolean" });
    }
    patch.daily_enabled = body.daily_enabled;
  }
  if (body.task_enabled !== undefined) {
    if (typeof body.task_enabled !== "boolean") {
      return res.status(400).json({ error: "task_enabled должен быть boolean" });
    }
    patch.task_enabled = body.task_enabled;
  }
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ error: "Нет полей для обновления" });
  }
  try {
    const limits = await updateLimits(patch);
    const dailySpent = await getDailySpentUsd();
    return res.json({
      daily: {
        limit_usd: limits.daily_limit_usd,
        enabled: limits.daily_enabled,
      },
      task: {
        limit_usd: limits.task_limit_usd,
        enabled: limits.task_enabled,
      },
      daily_spent_usd: dailySpent,
    });
  } catch (err) {
    console.error("[team] admin limits PATCH failed:", err);
    return res.status(500).json({ error: err.message ?? "Не удалось сохранить лимиты" });
  }
});

// =========================================================================
// GET /api/team/admin/security
// Текущий whitelisted email + источник (БД / ENV).
// =========================================================================

router.get("/security", async (_req, res) => {
  try {
    const sources = await getWhitelistedEmailSources();
    return res.json({
      db_email: sources.db_email,
      env_email: sources.env_email,
      effective_email: sources.effective_email,
    });
  } catch (err) {
    console.error("[team] admin security GET failed:", err);
    return res.status(500).json({ error: err.message ?? "Не удалось прочитать настройки доступа" });
  }
});

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// =========================================================================
// PATCH /api/team/admin/security
// Body: { whitelisted_email: string | null }
// Защита от самоблокировки: если задаём email отличный от текущей сессии —
// отказ. Сброс в null (= откат к ENV) разрешён всегда.
// =========================================================================

router.patch("/security", async (req, res) => {
  const body = req.body ?? {};
  const value = body.whitelisted_email;
  let normalized = null;
  if (value !== null && value !== undefined) {
    if (typeof value !== "string" || !EMAIL_REGEX.test(value.trim())) {
      return res.status(400).json({ error: "whitelisted_email должен быть валидным email или null" });
    }
    normalized = value.trim().toLowerCase();
  }
  // Защита от самоблокировки: разрешено выставить либо null (= ENV fallback,
  // мы НЕ знаем гарантированно совпадёт ли ENV с текущей сессией, но если
  // не совпадёт — это уже было сломано до нас, и пользователь сам разрулит
  // через Railway), либо email = email текущей сессии.
  if (normalized !== null) {
    const sessionEmail =
      req.user && typeof req.user.email === "string"
        ? req.user.email.trim().toLowerCase()
        : null;
    if (!sessionEmail || sessionEmail !== normalized) {
      return res.status(400).json({
        error:
          "Чтобы избежать самоблокировки, можно установить только email текущей сессии. " +
          "Войдите под нужным аккаунтом и потом изменяйте.",
      });
    }
  }
  try {
    const client = getServiceRoleClient();
    const { error } = await client
      .from("team_settings")
      .upsert(
        {
          key: "security",
          whitelisted_email: normalized,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" },
      );
    if (error) {
      throw new Error(error.message);
    }
    clearWhitelistCache();
    const sources = await getWhitelistedEmailSources();
    return res.json({
      db_email: sources.db_email,
      env_email: sources.env_email,
      effective_email: sources.effective_email,
    });
  } catch (err) {
    console.error("[team] admin security PATCH failed:", err);
    return res.status(500).json({ error: err.message ?? "Не удалось сохранить настройки доступа" });
  }
});

// =========================================================================
// GET /api/team/admin/dev-mode
// Текущий статус «тестового режима без авторизации»: {active, until,
// auto_disable_hours}. Безопасно отдавать через requireAuth.
// =========================================================================

router.get("/dev-mode", async (_req, res) => {
  try {
    const state = await getDevMode();
    return res.json(state);
  } catch (err) {
    console.error("[team] admin dev-mode GET failed:", err);
    return res
      .status(500)
      .json({ error: err.message ?? "Не удалось прочитать статус dev mode" });
  }
});

// =========================================================================
// POST /api/team/admin/dev-mode
// Body: { enabled: boolean, hours?: 1|4|12|24 }
// Включает (enabled=true) или выключает (enabled=false) dev mode.
// При enabled=true hours обязателен (выбор пользователя из выпадашки).
//
// ВАЖНО: этот endpoint требует РЕАЛЬНОЙ сессии whitelisted-пользователя.
// Frontend proxy в dev mode подписывает синтетический JWT для остальных
// путей, но для admin/dev-mode синтетический токен отбивается (см.
// frontend/src/app/api/team-proxy/[...path]/route.ts). Если бы атакующий
// мог продлевать режим из dev mode без логина — backstop в виде
// auto-expire потерял бы смысл.
// =========================================================================

router.post("/dev-mode", async (req, res) => {
  const body = req.body ?? {};
  if (typeof body.enabled !== "boolean") {
    return res.status(400).json({ error: "enabled должен быть boolean" });
  }
  try {
    if (body.enabled) {
      const hours = Number(body.hours);
      if (![1, 4, 12, 24].includes(hours)) {
        return res
          .status(400)
          .json({ error: "hours должен быть одним из: 1, 4, 12, 24" });
      }
      const state = await enableDevMode(hours);
      console.warn(
        `[team] DEV MODE ENABLED by ${req.user?.email ?? "unknown"} until ${state.until} (${hours}ч)`,
      );
      return res.json(state);
    }
    const state = await disableDevMode();
    console.warn(`[team] DEV MODE DISABLED by ${req.user?.email ?? "unknown"}`);
    return res.json(state);
  } catch (err) {
    console.error("[team] admin dev-mode POST failed:", err);
    return res
      .status(500)
      .json({ error: err.message ?? "Не удалось обновить dev mode" });
  }
});

export default router;
