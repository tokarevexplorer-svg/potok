"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import {
  type AutonomyStatus,
  type BatchModeStatus,
  type DevModeHours,
  type DevModeStatus,
  type HardLimits,
  type KeysFullStatus,
  type SecuritySettings,
  type SpendingResult,
  type TeamTool,
  deleteApiKey,
  fetchAlertThreshold,
  fetchAutonomyStatus,
  fetchBatchModeStatus,
  fetchDevMode,
  fetchHardLimits,
  fetchKeysFull,
  fetchSecuritySettings,
  fetchSpending,
  fetchCompetitors,
  fetchTools,
  patchHardLimits,
  patchSecuritySettings,
  setAlertThreshold,
  setApiKey,
  setAutonomyEnabled,
  setBatchModeEnabled,
  setDevMode,
  updateTool,
} from "@/lib/team/teamBackendClient";
import { formatUsd } from "@/lib/team/format";
import TelegramSection from "./TelegramSection";
import ProvidersSection from "./ProvidersSection";
import SystemLLMSection from "./SystemLLMSection";
import NotebookLMSection from "./NotebookLMSection";

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
  const [limits, setLimits] = useState<HardLimits | null>(null);
  const [limitsError, setLimitsError] = useState<string | null>(null);
  const [security, setSecurity] = useState<SecuritySettings | null>(null);
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [devMode, setDevModeState] = useState<DevModeStatus | null>(null);
  const [devModeError, setDevModeError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [editing, setEditing] = useState<Provider | null>(null);

  async function reloadAll() {
    setRefreshing(true);
    try {
      const [k, sp, t, lim, sec, dm] = await Promise.allSettled([
        fetchKeysFull(),
        fetchSpending(),
        fetchAlertThreshold(),
        fetchHardLimits(),
        fetchSecuritySettings(),
        fetchDevMode(),
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
      if (lim.status === "fulfilled") {
        setLimits(lim.value);
        setLimitsError(null);
      } else {
        setLimitsError(lim.reason instanceof Error ? lim.reason.message : String(lim.reason));
      }
      if (sec.status === "fulfilled") {
        setSecurity(sec.value);
        setSecurityError(null);
      } else {
        setSecurityError(sec.reason instanceof Error ? sec.reason.message : String(sec.reason));
      }
      if (dm.status === "fulfilled") {
        setDevModeState(dm.value);
        setDevModeError(null);
      } else {
        setDevModeError(dm.reason instanceof Error ? dm.reason.message : String(dm.reason));
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

      <SecuritySection
        security={security}
        error={securityError}
        onChanged={(next) => {
          setSecurity(next);
          setSecurityError(null);
        }}
      />

      {/* Сессия 48: новый ProvidersSection поддерживает произвольных
          провайдеров (DeepSeek, Groq, custom). Заменил KeysSection. */}
      <ProvidersSection />

      {/* Сессия 49: единая точка выбора модели для всех системных функций. */}
      <SystemLLMSection />

      <SpendingSection spending={spending} error={spendingError} />

      {/* Сессия 50: heartbeat-мониторинг локального NotebookLM-воркера. */}
      <NotebookLMSection />

      <AlertSection
        threshold={threshold}
        loaded={thresholdLoaded}
        spending={spending}
        onChanged={(value) => {
          setThreshold(value);
          void reloadAll();
        }}
      />

      <HardLimitsSection
        limits={limits}
        error={limitsError}
        onChanged={(next) => {
          setLimits(next);
          setLimitsError(null);
        }}
      />

      <ToolsSection />

      <TelegramSection />

      <AutonomySection />

      <BatchModeSection />

      <DevModeSection
        devMode={devMode}
        error={devModeError}
        onChanged={(next) => {
          setDevModeState(next);
          setDevModeError(null);
        }}
      />
    </div>
  );
}

// ---------- Сессия 21: Tools ----------

function ToolsSection() {
  const [executorTools, setExecutorTools] = useState<TeamTool[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchTools("executor")
      .then((items) => {
        if (!cancelled) {
          setExecutorTools(items);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggleStatus(tool: TeamTool) {
    const next: "active" | "inactive" =
      tool.status === "active" ? "inactive" : "active";
    try {
      const updated = await updateTool(tool.id, { status: next });
      setExecutorTools((prev) => prev.map((t) => (t.id === tool.id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <section>
        <SectionHeader
          title="Инструменты команды"
          description="«Руки» агентов: NotebookLM для глубокого ресёрча, Web Search для свежих данных (появится позже). Активный инструмент попадает в Awareness промпта тех агентов, которым он привязан."
        />
        {loading && (
          <div className="inline-flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 size={14} className="animate-spin" /> Загружаем инструменты…
          </div>
        )}
        {error && (
          <p className="mb-4 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
            {error}
          </p>
        )}
        {!loading && !error && executorTools.length === 0 && (
          <p className="text-sm text-ink-muted">
            Инструменты ещё не добавлены. Запусти{" "}
            <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-xs">
              npm run seed:tools
            </code>{" "}
            в backend, чтобы создать NotebookLM.
          </p>
        )}
        {!loading && executorTools.length > 0 && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {executorTools.map((tool) => (
              <ToolCard key={tool.id} tool={tool} onToggle={() => void toggleStatus(tool)} />
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeader
          title="Инструменты Системы"
          description="Системные инструменты — не в Hands агента, а в инфраструктуре (парсинг баз, бэкенды). Идут отдельным реестром."
        />
        {/* Сессия 33: реальная карточка Apify. Статус читается по
            конкурентам — если хоть один competitor имеет
            schema_definition.last_parsed_at, значит токен живой. */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <ApifyCard />
        </div>
      </section>
    </>
  );
}

function ToolCard({ tool, onToggle }: { tool: TeamTool; onToggle: () => void }) {
  const isActive = tool.status === "active";
  const dotClass =
    tool.status === "active"
      ? "bg-emerald-500"
      : tool.status === "error"
        ? "bg-rose-500"
        : "bg-ink-faint";
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-elevated p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Wrench size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold tracking-tight text-ink">
            {tool.name}
          </h3>
          {tool.description && (
            <p className="mt-0.5 text-sm leading-snug text-ink-muted">
              {tool.description}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
          <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
          {tool.status === "active"
            ? "Активен"
            : tool.status === "error"
              ? "Ошибка"
              : "Выключен"}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {tool.manifest_path && (
            <Link
              href="/blog/team/instructions"
              className="focus-ring inline-flex h-8 items-center gap-1 rounded-md border border-line bg-surface px-2.5 text-xs font-medium text-ink-muted transition hover:border-line-strong hover:text-ink"
              title="Открыть методичку в разделе Инструкции"
            >
              Методичка <ExternalLink size={11} />
            </Link>
          )}
          <button
            type="button"
            onClick={onToggle}
            className={
              "focus-ring inline-flex h-8 items-center rounded-md px-2.5 text-xs font-semibold transition " +
              (isActive
                ? "border border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
                : "bg-accent text-surface shadow-card hover:bg-accent-hover")
            }
          >
            {isActive ? "Выключить" : "Включить"}
          </button>
        </div>
      </div>

      {/* Сессия 32: настройка провайдера для Web Search */}
      {tool.id === "web-search" && <WebSearchProviderSettings tool={tool} />}
    </div>
  );
}

// Сессия 32: блок выбора провайдера Web Search (anthropic / tavily / perplexity).
// Для Anthropic ключ берётся из team_api_keys (как для обычных LLM-вызовов);
// для Tavily / Perplexity — отдельный API-ключ кладётся в connection_config.api_key.
function WebSearchProviderSettings({ tool }: { tool: TeamTool }) {
  const cfg = (tool.connection_config ?? {}) as Record<string, unknown>;
  const initialProvider =
    typeof cfg.provider === "string" && cfg.provider ? (cfg.provider as string) : "anthropic";
  const initialApiKey = typeof cfg.api_key === "string" ? (cfg.api_key as string) : "";

  const [provider, setProvider] = useState(initialProvider);
  const [apiKey, setApiKey] = useState(initialApiKey);
  const [busy, setBusy] = useState(false);
  const [savedHint, setSavedHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = provider !== initialProvider || apiKey !== initialApiKey;
  const needsKey = provider === "tavily" || provider === "perplexity";

  async function handleSave() {
    if (!dirty || busy) return;
    if (needsKey && !apiKey.trim()) {
      setError(`Для провайдера ${provider} нужен API-ключ.`);
      return;
    }
    setBusy(true);
    setError(null);
    setSavedHint(null);
    try {
      const nextConfig: Record<string, unknown> = { provider };
      if (apiKey.trim()) nextConfig.api_key = apiKey.trim();
      await updateTool(tool.id, { connection_config: nextConfig });
      setSavedHint("Сохранено");
      setTimeout(() => setSavedHint(null), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 rounded-xl border border-line bg-canvas px-3 py-3 text-xs">
      <p className="mb-2 font-medium uppercase tracking-wide text-ink-faint">
        Провайдер поиска
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          disabled={busy}
          className="focus-ring h-8 rounded-md border border-line bg-surface px-2 text-xs text-ink"
        >
          <option value="anthropic">Anthropic (нативный tool-use)</option>
          <option value="tavily">Tavily (REST)</option>
          <option value="perplexity">Perplexity (sonar)</option>
        </select>
        {needsKey && (
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={provider === "tavily" ? "Tavily API key" : "Perplexity API key"}
            disabled={busy}
            className="focus-ring h-8 min-w-[12rem] flex-1 rounded-md border border-line bg-surface px-2 text-xs text-ink placeholder:text-ink-faint"
          />
        )}
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!dirty || busy}
          className="focus-ring inline-flex h-8 items-center rounded-md bg-ink px-3 text-xs font-semibold text-canvas transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? "Сохраняю…" : "Сохранить"}
        </button>
      </div>
      {savedHint && <p className="mt-2 text-emerald-700">{savedHint}</p>}
      {error && (
        <p className="mt-2 rounded-md bg-rose-50 px-2 py-1 text-rose-800">{error}</p>
      )}
      {!needsKey && (
        <p className="mt-2 text-ink-faint">
          Anthropic-провайдер использует ключ из «Ключи API» (поле Anthropic выше).
        </p>
      )}
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

// ---------- Security ----------

function SecuritySection({
  security,
  error,
  onChanged,
}: {
  security: SecuritySettings | null;
  error: string | null;
  onChanged: (next: SecuritySettings) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);

  useEffect(() => {
    if (editing && security) {
      setDraft(security.db_email ?? security.effective_email ?? "");
      setLocalError(null);
    }
  }, [editing, security]);

  async function handleSave() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setLocalError("Введи email или нажми «Сбросить» для возврата к ENV");
      return;
    }
    setBusy(true);
    setLocalError(null);
    try {
      const next = await patchSecuritySettings(trimmed);
      onChanged(next);
      setEditing(false);
      setSavedHint("Сохранено");
      setTimeout(() => setSavedHint(null), 3000);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    if (!confirm("Сбросить email на значение из переменной окружения?")) return;
    setBusy(true);
    setLocalError(null);
    try {
      const next = await patchSecuritySettings(null);
      onChanged(next);
      setEditing(false);
      setSavedHint("Сброшено — теперь действует ENV");
      setTimeout(() => setSavedHint(null), 3000);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <SectionHeader
        title="Безопасность доступа"
        description="Email из whitelist, которому открыт раздел Команды. Можно переопределить в БД или вернуться к значению из переменной окружения Vercel/Railway."
      />

      {error && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      {!security && !error && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-dashed border-line bg-elevated/40 px-4 py-10 text-sm text-ink-muted">
          <Loader2 size={14} className="animate-spin" /> Грузим настройки доступа…
        </div>
      )}

      {security && (
        <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 sm:max-w-xl">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-sm text-ink-muted">Текущий разрешённый email:</span>
            <span className="font-mono text-sm text-ink">
              {security.effective_email || "(не задан)"}
            </span>
            <span className="text-xs text-ink-faint">
              {security.db_email
                ? "(переопределено в БД)"
                : "(из переменной окружения)"}
            </span>
          </div>

          {!editing && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-semibold text-canvas transition hover:bg-ink/90"
              >
                Изменить
              </button>
              {savedHint && (
                <p className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                  <Check size={12} /> {savedHint}
                </p>
              )}
            </div>
          )}

          {editing && (
            <div className="flex flex-col gap-2">
              <input
                type="email"
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
                    setEditing(false);
                  }
                }}
                placeholder="email@example.com"
                className="focus-ring w-full rounded-lg border border-line bg-canvas px-3 py-2 font-mono text-sm text-ink"
              />
              {localError && <p className="text-xs text-rose-700">{localError}</p>}
              <div className="flex flex-wrap items-center gap-2">
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
                  onClick={() => void handleReset()}
                  disabled={busy}
                  className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm text-ink-muted transition hover:text-ink disabled:opacity-50"
                >
                  Сбросить (вернуться к ENV)
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={busy}
                  className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm text-ink-muted transition hover:text-ink disabled:opacity-50"
                >
                  <X size={14} /> Отмена
                </button>
              </div>
              <p className="text-xs text-ink-faint">
                Защита от самоблокировки: можно установить только email текущей сессии.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ---------- Hard limits ----------

function HardLimitsSection({
  limits,
  error,
  onChanged,
}: {
  limits: HardLimits | null;
  error: string | null;
  onChanged: (next: HardLimits) => void;
}) {
  const [dailyDraft, setDailyDraft] = useState("");
  const [taskDraft, setTaskDraft] = useState("");
  const [dailyEnabled, setDailyEnabled] = useState(true);
  const [taskEnabled, setTaskEnabled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);

  useEffect(() => {
    if (limits) {
      setDailyDraft(String(limits.daily.limit_usd));
      setTaskDraft(String(limits.task.limit_usd));
      setDailyEnabled(limits.daily.enabled);
      setTaskEnabled(limits.task.enabled);
    }
  }, [limits]);

  async function handleSave() {
    const dailyNum = Number(dailyDraft.trim().replace(",", "."));
    const taskNum = Number(taskDraft.trim().replace(",", "."));
    if (!Number.isFinite(dailyNum) || dailyNum <= 0) {
      setLocalError("Дневной лимит должен быть числом больше 0");
      return;
    }
    if (!Number.isFinite(taskNum) || taskNum <= 0) {
      setLocalError("Лимит задачи должен быть числом больше 0");
      return;
    }
    setBusy(true);
    setLocalError(null);
    setSavedHint(null);
    try {
      const next = await patchHardLimits({
        daily_limit_usd: dailyNum,
        task_limit_usd: taskNum,
        daily_enabled: dailyEnabled,
        task_enabled: taskEnabled,
      });
      onChanged(next);
      setSavedHint("Сохранено");
      setTimeout(() => setSavedHint(null), 3000);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const dailySpent = limits?.daily_spent_usd ?? 0;
  const dailyLimit = limits?.daily.limit_usd ?? 0;
  const progress =
    dailyLimit > 0 ? Math.min(100, Math.round((dailySpent / dailyLimit) * 100)) : 0;

  return (
    <section>
      <SectionHeader
        title="Жёсткие лимиты расходов"
        description="Дневной лимит и лимит на одну задачу. В отличие от мягкого алерта выше, эти лимиты реально блокируют постановку и выполнение."
      />

      {error && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      {!limits && !error && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-dashed border-line bg-elevated/40 px-4 py-10 text-sm text-ink-muted">
          <Loader2 size={14} className="animate-spin" /> Грузим лимиты…
        </div>
      )}

      {limits && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:max-w-2xl lg:grid-cols-2">
          {/* Дневной лимит */}
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-ink">Дневной лимит</h3>
              <label className="inline-flex items-center gap-2 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={dailyEnabled}
                  onChange={(e) => setDailyEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
                />
                Включён
              </label>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-ink-muted">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={dailyDraft}
                onChange={(e) => setDailyDraft(e.target.value)}
                placeholder="5"
                className="focus-ring w-28 rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-ink"
              />
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Сегодня потрачено: {formatUsd(dailySpent)} из {formatUsd(dailyLimit)}
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-elevated">
              <div
                className={`h-full transition-all ${
                  progress >= 100 ? "bg-rose-500" : progress >= 80 ? "bg-amber-500" : "bg-accent"
                }`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Лимит на задачу */}
          <div className="rounded-2xl border border-line bg-surface p-5">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-semibold text-ink">Лимит на задачу</h3>
              <label className="inline-flex items-center gap-2 text-xs text-ink-muted">
                <input
                  type="checkbox"
                  checked={taskEnabled}
                  onChange={(e) => setTaskEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-line text-accent focus:ring-accent"
                />
                Включён
              </label>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-ink-muted">$</span>
              <input
                type="text"
                inputMode="decimal"
                value={taskDraft}
                onChange={(e) => setTaskDraft(e.target.value)}
                placeholder="1"
                className="focus-ring w-28 rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-ink"
              />
            </div>
            <p className="mt-3 text-xs text-ink-muted">
              Превышение → задача переходит в ошибку, остальные продолжают.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 lg:col-span-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy}
              className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-semibold text-surface transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Сохранить
            </button>
            {savedHint && (
              <p className="inline-flex items-center gap-1.5 text-xs text-emerald-700">
                <Check size={12} /> {savedHint}
              </p>
            )}
            {localError && <p className="text-xs text-rose-700">{localError}</p>}
          </div>

          <p className="text-xs text-ink-faint lg:col-span-2">
            При превышении дневного лимита новые задачи блокируются до конца суток UTC.
            При превышении лимита задачи — задача переходит в ошибку, остальные продолжают.
          </p>
        </div>
      )}
    </section>
  );
}

// ---------- Dev mode ----------

const DEV_MODE_HOURS_OPTIONS: { value: DevModeHours; label: string }[] = [
  { value: 1, label: "1 час" },
  { value: 4, label: "4 часа" },
  { value: 12, label: "12 часов" },
  { value: 24, label: "24 часа" },
];

// ---------- Сессия 23: Autonomy ----------

function AutonomySection() {
  const [status, setStatus] = useState<AutonomyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAutonomyStatus()
      .then((data) => {
        if (!cancelled) {
          setStatus(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    if (!status || saving) return;
    setSaving(true);
    setError(null);
    try {
      await setAutonomyEnabled(!status.enabled);
      const fresh = await fetchAutonomyStatus();
      setStatus(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <SectionHeader
        title="Проактивность команды"
        description="Глобальный тумблер автономности. Когда выключен — все cron- и событийные триггеры спят, агенты не формируют предложений. Suggested Next Steps в задачах продолжают работать (это другая механика)."
      />
      {loading ? (
        <div className="inline-flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 size={14} className="animate-spin" /> Загружаем настройку…
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-elevated p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={
                  "inline-flex h-10 w-10 items-center justify-center rounded-xl " +
                  (status?.enabled ? "bg-accent text-surface" : "bg-canvas text-ink-muted")
                }
              >
                <Sparkles size={18} />
              </span>
              <div>
                <p className="font-display text-base font-semibold text-ink">
                  {status?.enabled ? "Включено" : "Выключено"}
                </p>
                <p className="text-xs text-ink-muted">
                  Расходы на автономность за 30 дней:{" "}
                  {formatUsd(status?.spent_30d_usd ?? 0)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void toggle()}
              disabled={saving}
              className={
                "focus-ring inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold transition disabled:opacity-50 " +
                (status?.enabled
                  ? "border border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
                  : "bg-accent text-surface shadow-card hover:bg-accent-hover")
              }
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : status?.enabled ? (
                "Выключить"
              ) : (
                "Включить"
              )}
            </button>
          </div>
          {error && (
            <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// =========================================================================
// Сессия 44: тумблер Anthropic Batch API (50% скидка, до 24ч).
// =========================================================================
function BatchModeSection() {
  const [status, setStatus] = useState<BatchModeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchBatchModeStatus()
      .then((data) => {
        if (!cancelled) {
          setStatus(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle() {
    if (!status || saving) return;
    setSaving(true);
    setError(null);
    try {
      await setBatchModeEnabled(!status.enabled);
      const fresh = await fetchBatchModeStatus();
      setStatus(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <SectionHeader
        title="Batch-режим Anthropic"
        description="Anthropic Batch API: до 24 часов ожидания, 50% скидка на токены. Подходит для долгих задач без срочности (длинные драфты, исследования). Когда включено — в форме постановки задачи появится галочка «Batch-режим» для агентов на anthropic-провайдере."
      />
      {loading ? (
        <div className="inline-flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 size={14} className="animate-spin" /> Загружаем настройку…
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-elevated p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={
                  "inline-flex h-10 w-10 items-center justify-center rounded-xl " +
                  (status?.enabled ? "bg-accent text-surface" : "bg-canvas text-ink-muted")
                }
              >
                <Sparkles size={18} />
              </span>
              <div>
                <p className="font-display text-base font-semibold text-ink">
                  {status?.enabled ? "Включено" : "Выключено"}
                </p>
                <p className="text-xs text-ink-muted">
                  Расходы на batch-режим за 30 дней:{" "}
                  {formatUsd(status?.spent_30d_usd ?? 0)} (со скидкой 50%)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void toggle()}
              disabled={saving}
              className={
                "focus-ring inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold transition disabled:opacity-50 " +
                (status?.enabled
                  ? "border border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink"
                  : "bg-accent text-surface shadow-card hover:bg-accent-hover")
              }
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : status?.enabled ? (
                "Выключить"
              ) : (
                "Включить"
              )}
            </button>
          </div>
          {error && (
            <p className="mt-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
              {error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function DevModeSection({
  devMode,
  error,
  onChanged,
}: {
  devMode: DevModeStatus | null;
  error: string | null;
  onChanged: (next: DevModeStatus) => void;
}) {
  const [hoursChoice, setHoursChoice] = useState<DevModeHours>(12);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  // tick форсит перерендер каждую минуту, чтобы строка «до HH:MM» и индикатор
  // «активен» оставались точными без перезагрузки страницы.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (devMode && [1, 4, 12, 24].includes(devMode.auto_disable_hours)) {
      setHoursChoice(devMode.auto_disable_hours as DevModeHours);
    }
  }, [devMode]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  async function handleToggle() {
    if (!devMode) return;
    if (busy) return;
    const turningOn = !devMode.active;
    if (turningOn) {
      const ok = confirm(
        `Включить тестовый режим без авторизации на ${hoursChoice} ч?\n\n` +
          `Сайт будет открыт БЕЗ Google OAuth до автоотключения.`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setLocalError(null);
    try {
      const next = await setDevMode(turningOn, turningOn ? hoursChoice : undefined);
      onChanged(next);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const until = devMode?.until ? new Date(devMode.until) : null;
  const untilLabel = until
    ? until.toLocaleString("ru", { dateStyle: "short", timeStyle: "short" })
    : null;
  const remainingMin =
    until !== null
      ? Math.max(0, Math.round((until.getTime() - Date.now()) / 60_000))
      : null;
  const remainingLabel =
    remainingMin === null
      ? null
      : remainingMin >= 60
        ? `${Math.floor(remainingMin / 60)} ч ${remainingMin % 60} мин`
        : `${remainingMin} мин`;

  return (
    <section>
      <SectionHeader
        title="Режим разработки"
        description="Временно отключает Google OAuth для автоматизированных проверок (Playwright). Автоотключение через выбранное время — никакого крона не нужно. Жёсткие лимиты расходов продолжают защищать кошелёк."
      />

      {error && (
        <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </p>
      )}

      {!devMode && !error && (
        <div className="mt-4 flex items-center gap-2 rounded-2xl border border-dashed border-line bg-elevated/40 px-4 py-10 text-sm text-ink-muted">
          <Loader2 size={14} className="animate-spin" /> Грузим статус…
        </div>
      )}

      {devMode && (
        <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:max-w-2xl">
          <div className="rounded-xl border-2 border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            <span className="font-semibold">⚠️ ВНИМАНИЕ:</span> при включении сайт доступен <span className="font-semibold">БЕЗ авторизации</span>. Используется только для автоматизированных проверок. Автоматически отключится через выбранное время.
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                Время автоотключения
              </span>
              <select
                value={hoursChoice}
                onChange={(e) => setHoursChoice(Number(e.target.value) as DevModeHours)}
                disabled={busy || devMode.active}
                className="focus-ring h-11 rounded-xl border border-line bg-canvas px-3 text-sm text-ink disabled:opacity-60"
              >
                {DEV_MODE_HOURS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={() => void handleToggle()}
              disabled={busy}
              className={
                "focus-ring inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold shadow-card transition disabled:cursor-not-allowed disabled:opacity-50 " +
                (devMode.active
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-rose-600 text-white hover:bg-rose-700")
              }
            >
              {busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : devMode.active ? (
                <>🔒 Выключить dev mode</>
              ) : (
                <>🔓 Включить dev mode</>
              )}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-ink-muted">Статус:</span>
            {devMode.active ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-100 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-rose-800">
                <span className="h-2 w-2 rounded-full bg-rose-600" /> Активен до {untilLabel} (~{remainingLabel})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold uppercase tracking-wide text-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-600" /> Выключен
              </span>
            )}
          </div>

          {localError && (
            <p className="text-xs text-rose-700">{localError}</p>
          )}

          <p className="text-xs text-ink-faint">
            POST <code className="font-mono">/api/team/admin/dev-mode</code> с
            <code className="font-mono"> {"{ enabled, hours }"}</code> — для программного управления из Playwright.
            Защищён whitelisted email: токен на этот путь не синтезируется даже при активном режиме.
          </p>
        </div>
      )}
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

// Сессия 33: карточка Apify в блоке «Инструменты Системы». Показывает
// статус (по наличию хотя бы одного успешно спарсенного конкурента) и
// напоминает о токене.
function ApifyCard() {
  const [loading, setLoading] = useState(true);
  const [tokenPresent, setTokenPresent] = useState<boolean | null>(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCompetitors()
      .then((res) => {
        if (cancelled) return;
        setTokenPresent(res.apify_token_present);
        setCount(res.competitors.length);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const statusLabel = loading
    ? "Загружаем…"
    : tokenPresent
      ? "Токен задан"
      : "Токен не задан";
  const dotClass = loading
    ? "bg-ink-faint"
    : tokenPresent
      ? "bg-emerald-500"
      : "bg-rose-500";

  return (
    <div className="rounded-2xl border border-line bg-elevated p-5 shadow-card">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
          <Wrench size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-base font-semibold text-ink">Apify</h3>
          <p className="mt-0.5 text-sm leading-snug text-ink-muted">
            Парсинг каналов конкурентов в Instagram. Стоимость ~$0.002 за пост.
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="inline-flex items-center gap-1.5 text-ink-muted">
          <span className={`inline-block h-2 w-2 rounded-full ${dotClass}`} />
          {statusLabel}
        </span>
        <span className="text-ink-faint">
          Конкурентов: {loading ? "…" : count}
        </span>
      </div>
      {tokenPresent === false && (
        <p className="mt-3 text-xs text-rose-700">
          Установи APIFY_TOKEN в Railway → Variables (получить:&nbsp;
          <a
            href="https://console.apify.com/account/integrations"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            console.apify.com/account/integrations
          </a>
          ).
        </p>
      )}
      {error && (
        <p className="mt-2 rounded-lg bg-rose-50 px-2 py-1 text-xs text-rose-800">{error}</p>
      )}
    </div>
  );
}
