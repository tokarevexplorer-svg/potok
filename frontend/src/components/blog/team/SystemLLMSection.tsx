"use client";

// Сессия 49: блок «Системная LLM» в Админке.
// Влад выбирает provider + model + месячный бюджет. Этот выбор используется
// всеми НЕ-task LLM-вызовами: feedback parser, merge, clarification, daily
// reports, promote artifact, draft role и т.п. (см. systemLLMService.js).

import { useEffect, useState } from "react";
import { Cpu, Loader2 } from "lucide-react";
import {
  fetchProviderKeys,
  fetchSystemLLM,
  updateSystemLLM,
  type ProviderKey,
  type SystemLLMConfig,
} from "@/lib/team/teamBackendClient";
import { formatUsd } from "@/lib/team/format";

const SYSTEM_FUNCTIONS: { key: string; label: string }[] = [
  { key: "feedback_parse", label: "Парсер обратной связи" },
  { key: "clarification", label: "Уточнения от агента" },
  { key: "merge", label: "Мерджинг артефактов" },
  { key: "promote_artifact", label: "Промоут артефакта в базу" },
  { key: "telegram_report", label: "Ежедневный отчёт в Telegram" },
  { key: "autonomy_filter", label: "Фильтр самозадач (такт 1)" },
  { key: "autonomy_propose", label: "Формулировка самозадач (такт 2)" },
  { key: "episode_compression", label: "Сжатие эпизодов в кандидаты правил" },
];

export default function SystemLLMSection() {
  const [config, setConfig] = useState<SystemLLMConfig | null>(null);
  const [providers, setProviders] = useState<ProviderKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Локальный draft. Применяется при «Сохранить».
  const [draft, setDraft] = useState<{ provider: string; model: string; budgetUsd: string }>({
    provider: "",
    model: "",
    budgetUsd: "10",
  });

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [cfg, keys] = await Promise.all([fetchSystemLLM(), fetchProviderKeys()]);
      setConfig(cfg);
      setProviders(keys.filter((k) => k.has_key));
      setDraft({
        provider: cfg.provider,
        model: cfg.model,
        budgetUsd: String(cfg.budgetUsd ?? 10),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const currentProvider = providers.find((p) => p.provider === draft.provider);
  const modelOptions = currentProvider?.models ?? [];

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const budget = Number(draft.budgetUsd);
      if (!Number.isFinite(budget) || budget < 0) {
        throw new Error("Бюджет должен быть неотрицательным числом.");
      }
      const fresh = await updateSystemLLM({
        provider: draft.provider.trim(),
        model: draft.model.trim(),
        budgetUsd: budget,
      });
      setConfig(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="mb-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">Системная LLM</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Эта модель обрабатывает все НЕ-task вызовы: парсер обратной связи, мерджинг
          артефактов, уточнения от агентов, ежедневные отчёты, промоут артефакта в базу
          и т.п. Базовые task-задачи продолжают идти на модель, выбранную в форме
          постановки.
        </p>
      </div>

      {loading ? (
        <div className="inline-flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 size={14} className="animate-spin" /> Загружаем…
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-elevated p-5 shadow-card">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-muted">Провайдер</span>
              <select
                value={draft.provider}
                onChange={(e) => setDraft((d) => ({ ...d, provider: e.target.value, model: "" }))}
                className="focus-ring rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
              >
                {providers.length === 0 && (
                  <option value="">— Нет подключённых ключей —</option>
                )}
                {providers.map((p) => (
                  <option key={p.provider} value={p.provider}>
                    {p.display_name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-1 md:col-span-2">
              <span className="text-xs font-medium text-ink-muted">Модель</span>
              <input
                type="text"
                list="system-llm-models"
                value={draft.model}
                onChange={(e) => setDraft((d) => ({ ...d, model: e.target.value }))}
                placeholder="например: claude-haiku-4-5"
                className="focus-ring rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-mono"
              />
              <datalist id="system-llm-models">
                {modelOptions.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-muted">Лимит, $/мес</span>
              <input
                type="number"
                min="0"
                step="1"
                value={draft.budgetUsd}
                onChange={(e) => setDraft((d) => ({ ...d, budgetUsd: e.target.value }))}
                className="focus-ring rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-ink-muted">
              Сейчас потрачено за месяц:{" "}
              <span className="font-semibold text-ink">
                {formatUsd(config?.spent_month_usd ?? 0)}
              </span>
              {config?.budgetUsd ? (
                <>
                  {" "}/ {formatUsd(config.budgetUsd)}
                </>
              ) : null}
              .
            </div>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !draft.provider || !draft.model}
              className="focus-ring inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-1.5 text-sm font-semibold text-surface hover:bg-accent-hover disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              <Cpu size={14} /> Сохранить
            </button>
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
          )}

          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-ink-muted">
              Какие функции используют Системную LLM
            </summary>
            <ul className="mt-2 list-disc pl-5 text-xs text-ink-muted">
              {SYSTEM_FUNCTIONS.map((f) => (
                <li key={f.key}>
                  <span className="font-mono">{f.key}</span> — {f.label}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </section>
  );
}
