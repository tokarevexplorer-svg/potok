"use client";

// Сессия 39: блок управления Telegram-инфраструктурой в Админке.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  fetchTelegramSettings,
  patchTelegramSettings,
  registerTelegramWebhooks,
  sendTelegramTest,
  type TelegramSettings,
} from "@/lib/team/teamBackendClient";

export default function TelegramSection() {
  const [settings, setSettings] = useState<TelegramSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState("");
  const [chatId, setChatId] = useState("");
  const [reportTime, setReportTime] = useState("19:00");
  const [quietStart, setQuietStart] = useState(22);
  const [quietEnd, setQuietEnd] = useState(9);
  const [quietTz, setQuietTz] = useState("Europe/Moscow");
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchTelegramSettings()
      .then((s) => {
        if (cancelled) return;
        setSettings(s);
        setChatId(s.chatId);
        setReportTime(s.dailyReportTime);
        setQuietStart(s.quietHours.start_hour);
        setQuietEnd(s.quietHours.end_hour);
        setQuietTz(s.quietHours.timezone);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function applyToggle(next: boolean) {
    if (!settings) return;
    setBusy("toggle");
    setError(null);
    try {
      const updated = await patchTelegramSettings({ enabled: next });
      setSettings(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function applySettings() {
    if (!settings) return;
    setBusy("save");
    setError(null);
    try {
      const updated = await patchTelegramSettings({
        chatId,
        dailyReportTime: reportTime,
        quietHours: { start_hour: quietStart, end_hour: quietEnd, timezone: quietTz },
      });
      setSettings(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleRegisterWebhooks() {
    if (!baseUrl.trim()) {
      setError("Укажи base_url бэкенда — например, https://my-backend.railway.app");
      return;
    }
    setBusy("register");
    setError(null);
    try {
      const result = await registerTelegramWebhooks(baseUrl.trim());
      setTestResult(`Webhooks: зарегистрировано ${result.registered}, упало ${result.failed}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleTest() {
    setBusy("test");
    setError(null);
    try {
      const result = await sendTelegramTest();
      setTestResult(
        result.ok
          ? "Сообщение отправлено в Telegram-чат"
          : "Не отправлено: " + JSON.stringify(result),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <div className="mb-3 flex flex-col gap-2">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">Telegram</h2>
        <p className="max-w-2xl text-sm text-ink-muted">
          Системный бот + персональные боты агентов. Тихий час складывает сообщения в
          очередь, утром flush отправляет дайджестом.
        </p>
      </div>
      {error && (
        <p className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}
      {!settings ? (
        <div className="mt-4 inline-flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 size={14} className="animate-spin" /> Грузим…
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-elevated/40 p-4">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={settings.enabled}
                disabled={busy === "toggle"}
                onChange={(e) => void applyToggle(e.target.checked)}
                className="accent-accent"
              />
              <span>Telegram включён</span>
            </label>
            <span
              className={
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs " +
                (settings.systemTokenPresent
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-rose-100 text-rose-800")
              }
            >
              {settings.systemTokenPresent
                ? "SYSTEM_BOT_TOKEN задан"
                : "SYSTEM_BOT_TOKEN не задан"}
            </span>
            <span
              className={
                "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs " +
                (settings.webhookSecretPresent
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-canvas text-ink-muted")
              }
            >
              {settings.webhookSecretPresent
                ? "WEBHOOK_SECRET задан"
                : "WEBHOOK_SECRET не задан"}
            </span>
            {settings.currentlyInQuietHours && (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                сейчас тихий час
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted">Chat ID</span>
              <input
                type="text"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder="-1001234567890"
                className="focus-ring rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted">Время ежедневного отчёта (HH:MM)</span>
              <input
                type="text"
                value={reportTime}
                onChange={(e) => setReportTime(e.target.value)}
                placeholder="19:00"
                className="focus-ring rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted">Тихий час: начало (час)</span>
              <input
                type="number"
                min={0}
                max={23}
                value={quietStart}
                onChange={(e) => setQuietStart(parseInt(e.target.value, 10) || 0)}
                className="focus-ring rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-ink-muted">Тихий час: конец (час)</span>
              <input
                type="number"
                min={0}
                max={23}
                value={quietEnd}
                onChange={(e) => setQuietEnd(parseInt(e.target.value, 10) || 0)}
                className="focus-ring rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="text-ink-muted">Timezone (IANA)</span>
              <input
                type="text"
                value={quietTz}
                onChange={(e) => setQuietTz(e.target.value)}
                placeholder="Europe/Moscow"
                className="focus-ring rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void applySettings()}
              disabled={busy !== null}
              className="focus-ring inline-flex h-9 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-surface transition hover:bg-accent-hover disabled:opacity-50"
            >
              {busy === "save" ? <Loader2 size={14} className="animate-spin" /> : null}
              Сохранить настройки
            </button>
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={
                busy !== null ||
                !settings.systemTokenPresent ||
                !settings.chatId ||
                !settings.enabled
              }
              className="focus-ring inline-flex h-9 items-center rounded-lg border border-line bg-canvas px-3 text-sm text-ink-muted transition hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              {busy === "test" ? <Loader2 size={14} className="animate-spin" /> : null}
              Тестовое сообщение
            </button>
          </div>

          <div className="rounded-2xl border border-line bg-elevated/40 p-4">
            <p className="mb-2 text-sm font-medium text-ink">Регистрация вебхуков</p>
            <p className="mb-2 text-xs text-ink-muted">
              Прокидывает webhook системного бота + ботов агентов на ваш Railway. Запускай
              после изменения списка ботов или смены домена.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://my-backend.railway.app"
                className="focus-ring h-9 min-w-[260px] flex-1 rounded-lg border border-line bg-surface px-3 text-sm text-ink"
              />
              <button
                type="button"
                onClick={() => void handleRegisterWebhooks()}
                disabled={busy !== null || !settings.enabled}
                className="focus-ring inline-flex h-9 items-center rounded-lg bg-ink px-3 text-sm font-semibold text-canvas transition hover:bg-ink/90 disabled:opacity-50"
              >
                {busy === "register" ? <Loader2 size={14} className="animate-spin" /> : null}
                Зарегистрировать
              </button>
            </div>
          </div>

          {testResult && (
            <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-ink-muted">{testResult}</p>
          )}
        </div>
      )}
    </section>
  );
}
