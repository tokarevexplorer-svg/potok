"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  KeyRound,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import {
  type KeysFullStatus,
  type SpendingResult,
  deleteApiKey,
  fetchAlertThreshold,
  fetchKeysFull,
  fetchSpending,
  setAlertThreshold,
  setApiKey,
} from "@/lib/team/teamBackendClient";
import { formatUsd } from "@/lib/team/format";

type Provider = "anthropic" | "openai" | "google";

const PROVIDER_LABELS: Record<Provider, { label: string; consoleHint: string }> = {
  anthropic: {
    label: "Anthropic (Claude)",
    consoleHint: "Получить ключ — console.anthropic.com → Settings → API Keys",
  },
  openai: {
    label: "OpenAI (GPT, Whisper)",
    consoleHint: "Получить ключ — platform.openai.com → API keys",
  },
  google: {
    label: "Google AI Studio (Gemini)",
    consoleHint: "Получить ключ — aistudio.google.com → Get API key",
  },
};

export default function AdminWorkspace() {
  const [keys, setKeys] = useState<KeysFullStatus | null>(null);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [spending, setSpending] = useState<SpendingResult | null>(null);
  const [spendingError, setSpendingError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState<number | null>(null);
  const [thresholdLoaded, setThresholdLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [editing, setEditing] = useState<Provider | null>(null);

  async function reloadAll() {
    setRefreshing(true);
    try {
      const [k, sp, t] = await Promise.allSettled([
        fetchKeysFull(),
        fetchSpending(),
        fetchAlertThreshold(),
      ]);
      if (k.status === "fulfilled") {
        setKeys(k.value);
        setKeysError(null);
      } else {
        setKeysError(k.reason instanceof Error ? k.reason.message : String(k.reason));
      }
      if (sp.status === "fulfilled") {
        setSpending(sp.value);
        setSpendingError(null);
      } else {
        setSpendingError(sp.reason instanceof Error ? sp.reason.message : String(sp.reason));
      }
      if (t.status === "fulfilled") {
        setThreshold(t.value);
        setThresholdLoaded(true);
      }
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void reloadAll();
  }, []);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-end -mb-2">
        <button
          type="button"
          onClick={() => void reloadAll()}
          disabled={refreshing}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition hover:border-line-strong hover:text-ink disabled:opacity-50"
        >
          {refreshing ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
          Обновить
        </button>
      </div>

      <KeysSection
        keys={keys}
        error={keysError}
        editing={editing}
        onStartEdit={(p) => setEditing(p)}
        onCancelEdit={() => setEditing(null)}
        onChanged={() => {
          setEditing(null);
          void reloadAll();
        }}
      />

      <SpendingSection spending={spending} error={spendingError} />

      <AlertSection
        threshold={threshold}
        loaded={thresholdLoaded}
        spending={spending}
        onChanged={(value) => {
          setThreshold(value);
          void reloadAll();
        }}
      />
    </div>
  );
}

// ---------- Keys ----------

function KeysSection({
  keys,
  error,
  editing,
  onStartEdit,
  onCancelEdit,
  onChanged,
}: {
  keys: KeysFullStatus | null;
  error: string | null;
  editing: Provider | null;
  onStartEdit: (provider: Provider) => void;
  onCancelEdit: () => void;
  onChanged: () => void;
}) {
  return (
    <section>
      <SectionHeader
        title="Ключи API"
        description="Каждый провайдер — отдельный ключ. Сохраняются в team_api_keys (Supabase), а не в env Railway: смена не требует передеплоя."
      />

      {error && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      {!keys ? (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-dashed border-line bg-elevated/40 px-4 py-10 text-sm text-ink-muted">
          <Loader2 size={14} className="animate-spin" /> Грузим ключи…
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
          {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
            <KeyCard
              key={p}
              provider={p}
              info={keys[p]}
              isEditing={editing === p}
              onStartEdit={() => onStartEdit(p)}
              onCancelEdit={onCancelEdit}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function KeyCard({
  provider,
  info,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onChanged,
}: {
  provider: Provider;
  info: { configured: boolean; masked: string | null; updatedAt: string | null };
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onChanged: () => void;
}) {
  const { label, consoleHint } = PROVIDER_LABELS[provider];
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEditing) {
      setDraft("");
      setError(null);
    }
  }, [isEditing]);

  async function handleSave() {
    if (!draft.trim()) {
      setError("Ключ не может быть пустым");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await setApiKey(provider, draft.trim());
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm(`Удалить ключ ${label}?`)) return;
    setBusy(true);
    setError(null);
    try {
      await deleteApiKey(provider);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <div
      className={`flex flex-col gap-3 rounded-2xl border bg-surface p-5 shadow-card ${
        info.configured ? "border-line" : "border-rose-200"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound
              size={16}
              className={info.configured ? "text-emerald-600" : "text-rose-600"}
            />
            <h3 className="font-display text-base font-semibold text-ink">{label}</h3>
          </div>
          <p className="mt-1 text-xs text-ink-faint">{consoleHint}</p>
        </div>
        <span
          className={`inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
            info.configured
              ? "bg-emerald-50 text-emerald-700"
              : "bg-rose-50 text-rose-700"
          }`}
        >
          {info.configured ? "OK" : "не задан"}
        </span>
      </div>

      {!isEditing && (
        <>
          {info.configured ? (
            <div>
              <p className="font-mono text-sm text-ink">{info.masked}</p>
              {info.updatedAt && (
                <p className="text-[11px] text-ink-faint">
                  обновлён {new Date(info.updatedAt).toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-ink-muted">Ключ не задан. Без него вызовы провайдера упадут.</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onStartEdit}
              className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-semibold text-canvas transition hover:bg-ink/90"
            >
              {info.configured ? "Обновить" : "Добавить"}
            </button>
            {info.configured && (
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={busy}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
              >
                <Trash2 size={14} /> Удалить
              </button>
            )}
          </div>
        </>
      )}

      {isEditing && (
        <div className="flex flex-col gap-2">
          <input
            type="password"
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleSave();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                onCancelEdit();
              }
            }}
            placeholder="sk-…"
            className="focus-ring w-full rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink"
          />
          {error && <p className="text-xs text-rose-700">{error}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy || !draft.trim()}
              className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-surface transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Сохранить
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={busy}
              className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm text-ink-muted transition hover:text-ink disabled:opacity-50"
            >
              <X size={14} /> Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Spending ----------

function SpendingSection({
  spending,
  error,
}: {
  spending: SpendingResult | null;
  error: string | null;
}) {
  return (
    <section>
      <SectionHeader
        title="Расходы"
        description="Сумма по всем вызовам в team_api_calls. Подсчёт идёт на бэкенде по тарифам из team-config/pricing.json."
      />

      {error && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      {!spending && !error && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-dashed border-line bg-elevated/40 px-4 py-10 text-sm text-ink-muted">
          <Loader2 size={14} className="animate-spin" /> Считаем расходы…
        </div>
      )}

      {spending && (
        <div className="mt-4 flex flex-col gap-6">
          {/* Сводка */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <BigStat label="Всего потрачено" value={formatUsd(spending.total_usd)} hint="с момента запуска команды" />
            <BigStat label="Вызовов LLM" value={spending.calls.toLocaleString("ru")} hint={spending.failed > 0 ? `из них упало: ${spending.failed}` : "все успешные"} />
            <BigStat
              label="Порог алерта"
              value={spending.alert_threshold_usd === null ? "—" : formatUsd(spending.alert_threshold_usd)}
              hint={spending.alert_threshold_usd === null ? "не задан" : spending.alert_triggered ? "превышен" : "в пределах"}
              tone={spending.alert_triggered ? "danger" : undefined}
            />
          </div>

          {/* По провайдерам */}
          <div>
            <h3 className="mb-2 font-display text-base font-semibold text-ink">По провайдерам</h3>
            {Object.keys(spending.by_provider).length === 0 ? (
              <p className="text-sm text-ink-muted">Вызовов пока не было.</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(spending.by_provider).map(([provider, value]) => (
                  <div key={provider} className="rounded-xl border border-line bg-surface p-3">
                    <p className="text-sm font-semibold text-ink">{provider}</p>
                    <p className="mt-1 text-lg font-display text-ink">{formatUsd(value.cost_usd)}</p>
                    <p className="text-xs text-ink-faint">{value.calls} вызов(а/ов)</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* По моделям */}
          <div>
            <h3 className="mb-2 font-display text-base font-semibold text-ink">По моделям</h3>
            {spending.by_model.length === 0 ? (
              <p className="text-sm text-ink-muted">Вызовов пока не было.</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-line bg-elevated/60 text-left text-xs uppercase tracking-wide text-ink-faint">
                      <th className="px-4 py-2 font-medium">Модель</th>
                      <th className="px-4 py-2 font-medium">Провайдер</th>
                      <th className="px-4 py-2 font-medium">Вызовов</th>
                      <th className="px-4 py-2 text-right font-medium">Стоимость</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spending.by_model.map((row) => (
                      <tr key={`${row.provider}/${row.model}`} className="border-b border-line last:border-b-0">
                        <td className="px-4 py-2 font-mono text-xs text-ink">{row.model}</td>
                        <td className="px-4 py-2 text-ink-muted">{row.provider}</td>
                        <td className="px-4 py-2 text-ink-muted">{row.calls}</td>
                        <td className="px-4 py-2 text-right font-medium text-ink">
                          {formatUsd(row.cost_usd)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function BigStat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger";
}) {
  return (
    <div
      className={`rounded-2xl border p-5 shadow-card ${
        tone === "danger" ? "border-rose-200 bg-rose-50" : "border-line bg-surface"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

// ---------- Alert ----------

function AlertSection({
  threshold,
  loaded,
  spending,
  onChanged,
}: {
  threshold: number | null;
  loaded: boolean;
  spending: SpendingResult | null;
  onChanged: (value: number | null) => void;
}) {
  const [draft, setDraft] = useState<string>(threshold === null ? "" : String(threshold));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);

  useEffect(() => {
    if (loaded) {
      setDraft(threshold === null ? "" : String(threshold));
    }
  }, [threshold, loaded]);

  async function save(value: number | null) {
    setBusy(true);
    setError(null);
    setSavedHint(null);
    try {
      await setAlertThreshold(value);
      onChanged(value);
      setSavedHint(value === null ? "Алерт выключен" : "Сохранено");
      setTimeout(() => setSavedHint(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function handleApply() {
    const trimmed = draft.trim();
    if (!trimmed) {
      void save(null);
      return;
    }
    const num = Number(trimmed.replace(",", "."));
    if (!Number.isFinite(num) || num < 0) {
      setError("Введи положительное число или оставь пустым, чтобы выключить");
      return;
    }
    void save(num);
  }

  return (
    <section>
      <SectionHeader
        title="Алерт расходов"
        description="Когда сумма по всем вызовам превысит этот порог — на всех страницах команды появится баннер. Запуск задач не блокируется автоматически."
      />

      <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 sm:max-w-xl">
        <div className="flex items-center gap-3">
          <span className="text-sm text-ink-muted">Порог, USD:</span>
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleApply();
              }
            }}
            placeholder="например, 25"
            className="focus-ring w-32 rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-ink"
          />
          <button
            type="button"
            onClick={handleApply}
            disabled={busy}
            className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-surface transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Сохранить
          </button>
          {threshold !== null && !busy && (
            <button
              type="button"
              onClick={() => {
                setDraft("");
                void save(null);
              }}
              className="focus-ring text-xs text-ink-muted underline-offset-2 hover:underline"
            >
              сбросить
            </button>
          )}
        </div>

        {error && <p className="text-xs text-rose-700">{error}</p>}
        {savedHint && (
          <p className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
            <Check size={12} /> {savedHint}
          </p>
        )}

        {spending && spending.alert_triggered && (
          <p className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
            <AlertTriangle size={12} /> Сейчас превышен: {formatUsd(spending.total_usd)} ≥ {formatUsd(spending.alert_threshold_usd ?? 0)}
          </p>
        )}
      </div>
    </section>
  );
}

// ---------- helpers ----------

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div>
      <h2 className="font-display text-xl font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p>
    </div>
  );
}
