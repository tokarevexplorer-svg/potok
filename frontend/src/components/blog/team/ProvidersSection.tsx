"use client";

// Сессия 48 этапа 2 (пункт 1, этап 7): UI Админки для управления
// LLM-провайдерами. Заменяет старую форму на 3 нативных провайдера
// (anthropic/openai/google) — теперь Влад может добавить произвольный
// OpenAI-compatible (DeepSeek, Groq, Perplexity, OpenRouter, Ollama Cloud,
// custom).
//
// UX:
//   1. Список подключённых провайдеров (карточки) с маскированным ключом
//      и кнопками «🔄 Проверить» / «🗑 Удалить».
//   2. Кнопка «+ Добавить провайдер» открывает модалку:
//      Шаг 1: список preset'ов (deepseek/groq/perplexity/openrouter/
//             ollama_cloud + 3 нативных) + опция «custom».
//      Шаг 2: поле API-ключа (+ base_url/display_name для custom) +
//             кнопки «Проверить» / «Сохранить».

import { useEffect, useState } from "react";
import { Check, ExternalLink, KeyRound, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import {
  deleteProviderKey,
  fetchProviderKeys,
  fetchProviderPresets,
  saveProviderKey,
  testProviderKey,
  type ProviderKey,
  type ProviderPreset,
} from "@/lib/team/teamBackendClient";

export default function ProvidersSection() {
  const [keys, setKeys] = useState<ProviderKey[]>([]);
  const [presets, setPresets] = useState<ProviderPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ provider: string; ok: boolean; message?: string } | null>(
    null,
  );

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const [k, p] = await Promise.all([fetchProviderKeys(), fetchProviderPresets()]);
      setKeys(k);
      setPresets(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function handleTest(provider: string) {
    setTesting(provider);
    setTestResult(null);
    try {
      const r = await testProviderKey(provider);
      setTestResult({
        provider,
        ok: r.success === true,
        message: r.success ? "OK" : r.error ?? "Не удалось проверить",
      });
    } catch (err) {
      setTestResult({
        provider,
        ok: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(null);
    }
  }

  async function handleDelete(provider: string) {
    if (!confirm(`Удалить ключ провайдера ${provider}?`)) return;
    try {
      await deleteProviderKey(provider);
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight">Ключи и провайдеры</h2>
          <p className="mt-1 text-sm text-ink-muted">
            API-ключи LLM. Anthropic, OpenAI, Google — нативные; всё остальное идёт
            через универсальный OpenAI-compatible адаптер.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="focus-ring inline-flex items-center gap-2 rounded-xl bg-accent px-3 py-1.5 text-sm font-semibold text-surface hover:bg-accent-hover"
        >
          <Plus size={14} /> Добавить провайдер
        </button>
      </div>

      {loading ? (
        <div className="inline-flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 size={14} className="animate-spin" /> Загружаем провайдеров…
        </div>
      ) : keys.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-elevated/40 px-4 py-8 text-center text-sm text-ink-muted">
          Пока нет ни одного провайдера. Добавь первый через «+ Добавить провайдер».
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {keys.map((k) => (
            <li
              key={k.provider}
              className="flex flex-col gap-2 rounded-2xl border border-line bg-elevated p-4 shadow-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <KeyRound size={16} className="text-ink-muted" />
                  <div>
                    <p className="font-display text-base font-semibold tracking-tight">
                      {k.display_name}
                    </p>
                    <p className="text-xs text-ink-faint">
                      {k.provider}
                      {k.is_openai_compatible ? " · OpenAI-compatible" : ""}
                    </p>
                  </div>
                </div>
                <span
                  className={
                    "inline-flex h-6 items-center rounded-full px-2 text-[11px] font-semibold uppercase " +
                    (k.has_key ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800")
                  }
                >
                  {k.has_key ? "key" : "no key"}
                </span>
              </div>
              {k.key_preview && (
                <p className="font-mono text-xs text-ink-muted">{k.key_preview}</p>
              )}
              {k.base_url && (
                <p className="truncate text-xs text-ink-faint" title={k.base_url}>
                  {k.base_url}
                </p>
              )}
              {testResult && testResult.provider === k.provider && (
                <p
                  className={
                    "rounded-lg px-2 py-1 text-xs " +
                    (testResult.ok
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-rose-50 text-rose-800")
                  }
                >
                  {testResult.ok ? "✓ " : "✗ "} {testResult.message}
                </p>
              )}
              <div className="mt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleTest(k.provider)}
                  disabled={testing === k.provider}
                  className="focus-ring inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2 text-xs text-ink hover:border-line-strong disabled:opacity-50"
                  title="Проверить"
                >
                  {testing === k.provider ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <RefreshCw size={12} />
                  )}
                  Проверить
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(k.provider)}
                  className="focus-ring inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2 text-xs text-ink-muted hover:border-rose-200 hover:text-rose-700"
                  title="Удалить"
                >
                  <Trash2 size={12} /> Удалить
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      )}

      {addOpen && (
        <AddProviderModal
          presets={presets}
          existing={new Set(keys.map((k) => k.provider))}
          onClose={() => setAddOpen(false)}
          onSaved={() => {
            setAddOpen(false);
            void reload();
          }}
        />
      )}
    </section>
  );
}

function AddProviderModal({
  presets,
  existing,
  onClose,
  onSaved,
}: {
  presets: ProviderPreset[];
  existing: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [chosenPreset, setChosenPreset] = useState<ProviderPreset | null>(null);
  // Custom-провайдер: id, base_url, display_name заполняет Влад.
  const [custom, setCustom] = useState({ id: "", display_name: "", base_url: "" });
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function pickPreset(p: ProviderPreset) {
    if (existing.has(p.id)) {
      // Если ключ уже есть — позволяем обновить, но предупреждаем.
      if (!confirm(`Провайдер «${p.display_name}» уже подключён. Перезаписать ключ?`)) return;
    }
    setChosenPreset(p);
    setCustom({ id: "", display_name: "", base_url: "" });
    setStep(2);
  }

  function pickCustom() {
    setChosenPreset(null);
    setStep(2);
  }

  function buildInput() {
    if (chosenPreset) {
      return {
        provider: chosenPreset.id,
        key: apiKey.trim(),
        // setApiKey сам дозаполнит base_url/display_name из preset'а,
        // но явно передаём для надёжности.
        base_url: chosenPreset.base_url,
        display_name: chosenPreset.display_name,
        is_openai_compatible: chosenPreset.is_openai_compatible,
        models: chosenPreset.models,
      };
    }
    return {
      provider: custom.id.trim().toLowerCase(),
      key: apiKey.trim(),
      base_url: custom.base_url.trim() || null,
      display_name: custom.display_name.trim() || custom.id.trim(),
      is_openai_compatible: true,
      models: [],
    };
  }

  function validate(): string | null {
    const input = buildInput();
    if (!input.provider) return "Укажи slug провайдера.";
    if (!/^[a-z][a-z0-9_-]{0,40}$/.test(input.provider))
      return "slug: латиница, цифры, дефисы, подчёркивания.";
    if (!input.key) return "Ключ обязателен.";
    if (!chosenPreset && !input.base_url) return "Custom-провайдеру нужен base_url.";
    return null;
  }

  async function handleTest() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setTestMessage(null);
    setTesting(true);
    try {
      // Тест требует, чтобы ключ был уже в БД (testKey читает team_api_keys).
      // Сохраняем во временный slot и сразу тестируем — компромисс: при ошибке
      // ключ остаётся в БД, но в этом нет утечки (всё равно нужен был для теста).
      const input = buildInput();
      await saveProviderKey(input);
      const result = await testProviderKey(input.provider);
      setTestMessage(result.success ? "Ключ работает ✓" : result.error ?? "не удалось");
    } catch (err) {
      setTestMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

  async function handleSave() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await saveProviderKey(buildInput());
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-stretch justify-center sm:items-center sm:p-4">
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={saving ? undefined : onClose}
        role="presentation"
      />
      <div className="relative z-10 flex h-full max-h-screen w-full max-w-2xl flex-col overflow-hidden bg-surface shadow-pop sm:h-auto sm:max-h-[90vh] sm:rounded-2xl sm:border sm:border-line">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Шаг {step} из 2
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
              {step === 1 ? "Выбери провайдера" : "Введи ключ"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="focus-ring -mr-2 inline-flex h-9 w-9 items-center justify-center rounded-xl text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-50"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5">
          {step === 1 && (
            <div className="flex flex-col gap-2">
              {presets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pickPreset(p)}
                  className="focus-ring flex items-start justify-between gap-3 rounded-xl border border-line bg-elevated/40 p-3 text-left transition hover:border-line-strong hover:bg-elevated"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-semibold text-ink">
                      {p.display_name}
                      {existing.has(p.id) && (
                        <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                          <Check size={10} /> подключён
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-ink-faint">
                      {p.id}
                      {p.is_openai_compatible ? " · OpenAI-compatible" : ""}
                    </p>
                    {p.base_url && (
                      <p className="mt-0.5 truncate font-mono text-[11px] text-ink-faint">
                        {p.base_url}
                      </p>
                    )}
                  </div>
                  <a
                    href={p.help_url}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="focus-ring inline-flex h-7 items-center gap-1 self-center rounded-lg border border-line bg-surface px-2 text-[11px] text-ink-muted hover:text-ink"
                    title="Где получить ключ"
                  >
                    <ExternalLink size={11} /> Ключ
                  </a>
                </button>
              ))}
              <button
                type="button"
                onClick={pickCustom}
                className="focus-ring mt-3 rounded-xl border border-dashed border-line px-3 py-3 text-sm font-medium text-ink-muted hover:border-line-strong hover:text-ink"
              >
                + Custom-провайдер (укажу base_url и slug сам)
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              {chosenPreset ? (
                <div className="rounded-xl border border-line bg-elevated/40 p-3">
                  <p className="font-display text-base font-semibold">{chosenPreset.display_name}</p>
                  <p className="text-xs text-ink-faint">
                    {chosenPreset.id}
                    {chosenPreset.base_url ? ` · ${chosenPreset.base_url}` : ""}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-3 rounded-xl border border-line bg-elevated/40 p-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-ink-muted">Slug провайдера</span>
                    <input
                      type="text"
                      value={custom.id}
                      onChange={(e) => setCustom((c) => ({ ...c, id: e.target.value }))}
                      placeholder="например: mistral"
                      className="focus-ring rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-ink-muted">
                      Отображаемое имя
                    </span>
                    <input
                      type="text"
                      value={custom.display_name}
                      onChange={(e) => setCustom((c) => ({ ...c, display_name: e.target.value }))}
                      placeholder="Например: Mistral AI"
                      className="focus-ring rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-medium text-ink-muted">Base URL</span>
                    <input
                      type="url"
                      value={custom.base_url}
                      onChange={(e) => setCustom((c) => ({ ...c, base_url: e.target.value }))}
                      placeholder="https://api.example.com/v1"
                      className="focus-ring rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
                    />
                  </label>
                </div>
              )}

              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-ink">API-ключ</span>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                  className="focus-ring rounded-lg border border-line bg-surface px-3 py-1.5 text-sm"
                  autoComplete="off"
                />
              </label>

              {testMessage && (
                <p
                  className={
                    "rounded-lg px-3 py-2 text-sm " +
                    (testMessage.startsWith("Ключ работает")
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-rose-50 text-rose-800")
                  }
                >
                  {testMessage}
                </p>
              )}

              {error && (
                <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-3">
          {step === 2 ? (
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={saving || testing}
              className="focus-ring rounded-xl border border-line bg-surface px-3 py-1.5 text-sm text-ink hover:border-line-strong disabled:opacity-50"
            >
              ← Назад
            </button>
          ) : (
            <span />
          )}
          {step === 2 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleTest()}
                disabled={saving || testing}
                className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm text-ink hover:border-line-strong disabled:opacity-50"
              >
                {testing && <Loader2 size={14} className="animate-spin" />}
                Проверить
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || !apiKey.trim()}
                className="focus-ring inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-1.5 text-sm font-semibold text-surface hover:bg-accent-hover disabled:opacity-50"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                Сохранить
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
