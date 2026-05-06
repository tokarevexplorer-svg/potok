"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Sparkles, Loader2 } from "lucide-react";
import {
  fetchModelsConfig,
  type ModelsConfig,
  type PricingModel,
} from "@/lib/team/teamBackendClient";
import type { TeamTaskModelChoice } from "@/lib/team/types";

interface ModelSelectorProps {
  value: TeamTaskModelChoice;
  onChange: (next: TeamTaskModelChoice) => void;
  // Тип задачи нужен, чтобы при выборе пресета подсказать конкретную модель
  // (per-task override приоритетнее default — то же делает resolveModelChoice
  // на бэкенде).
  taskType: string;
}

// Дефолт-пресет — на случай отсутствия в presets.json. Совпадает с дефолтом
// taskRunner.resolveModelChoice. UI всё равно покажет пользователю активный
// preset, и он сможет переключить.
const DEFAULT_PRESET = "balanced";

// Извлекаем плоский список моделей из pricing.json. Поддерживаем оба формата:
// новый {models: [{id, provider, ...}]} и старый {provider: {model_id: {...}}}.
function flattenModels(pricing: ModelsConfig["pricing"]): PricingModel[] {
  const out: PricingModel[] = [];
  if (Array.isArray(pricing.models)) {
    for (const entry of pricing.models) {
      if (entry?.id) out.push(entry);
    }
    return out;
  }
  for (const [provider, models] of Object.entries(pricing)) {
    if (!models || typeof models !== "object" || Array.isArray(models)) continue;
    if (["_comment", "_units", "models", "audio"].includes(provider)) continue;
    for (const [id, meta] of Object.entries(models as Record<string, unknown>)) {
      const m = (meta ?? {}) as Record<string, unknown>;
      out.push({
        id,
        provider,
        label: typeof m.label === "string" ? m.label : null,
      });
    }
  }
  return out;
}

// Для пресета вычисляем фактическую модель с учётом per-task override.
function previewPresetModel(
  presets: ModelsConfig["presets"],
  presetName: string,
  taskType: string,
): { provider: string | null; model: string | null } {
  const preset = presets[presetName];
  if (!preset || typeof preset !== "object") return { provider: null, model: null };
  const taskOverride = (preset as Record<string, unknown>)[taskType];
  const model =
    typeof taskOverride === "string"
      ? taskOverride
      : typeof preset.default === "string"
        ? preset.default
        : null;
  return { provider: null, model };
}

export default function ModelSelector({ value, onChange, taskType }: ModelSelectorProps) {
  const [config, setConfig] = useState<ModelsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(
    Boolean(value.provider || value.model),
  );

  useEffect(() => {
    let cancelled = false;
    fetchModelsConfig()
      .then((cfg) => {
        if (!cancelled) {
          setConfig(cfg);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const presetNames = useMemo(() => {
    if (!config) return [];
    return Object.keys(config.presets).filter((k) => !k.startsWith("_"));
  }, [config]);

  const allModels = useMemo(() => {
    if (!config) return [];
    return flattenModels(config.pricing);
  }, [config]);

  const currentPreset = value.preset ?? DEFAULT_PRESET;
  const presetPreview = useMemo(() => {
    if (!config) return null;
    return previewPresetModel(config.presets, currentPreset, taskType);
  }, [config, currentPreset, taskType]);

  function selectPreset(preset: string) {
    // Снимаем явный provider/model — переключение на пресет означает
    // «доверяю пресету, провайдер/модель резолвятся на бэке».
    onChange({ preset });
  }

  function selectExplicitModel(modelId: string) {
    if (!modelId) {
      // Сброс — возвращаемся к пресету.
      onChange({ preset: currentPreset });
      return;
    }
    const found = allModels.find((m) => m.id === modelId);
    onChange({
      preset: currentPreset,
      provider: found?.provider ?? null,
      model: modelId,
    });
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-ink-faint">
        <Loader2 size={16} className="animate-spin" /> Загружаю список моделей…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-line bg-elevated px-3 py-2 text-sm text-ink-muted">
        Не удалось загрузить настройки моделей: {loadError}
        <br />
        Проверь, что в Storage → team-config есть presets.json и pricing.json.
      </div>
    );
  }

  if (!config || presetNames.length === 0) {
    return (
      <div className="rounded-xl border border-line bg-elevated px-3 py-2 text-sm text-ink-muted">
        В team-config нет presets.json или он пустой. Загрузи файл через Supabase
        Dashboard → Storage → team-config.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">
          Модель
        </span>
        <div className="flex flex-wrap gap-2">
          {presetNames.map((name) => {
            const isActive = currentPreset === name && !value.model;
            return (
              <button
                key={name}
                type="button"
                onClick={() => selectPreset(name)}
                className={
                  "focus-ring inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition " +
                  (isActive
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink")
                }
                title={
                  config.presets[name]?.description
                    ? String(config.presets[name].description)
                    : `Пресет «${name}»`
                }
              >
                {isActive && <Sparkles size={12} />}
                {presetLabel(name)}
              </button>
            );
          })}
        </div>
        {presetPreview?.model && !value.model && (
          <span className="text-xs text-ink-faint">
            Сейчас будет: <span className="font-mono">{presetPreview.model}</span>
          </span>
        )}
      </div>

      <button
        type="button"
        onClick={() => setAdvancedOpen((v) => !v)}
        className="focus-ring inline-flex w-fit items-center gap-1 rounded-md text-xs font-medium text-ink-muted hover:text-ink"
      >
        <ChevronDown
          size={14}
          className={"transition " + (advancedOpen ? "rotate-0" : "-rotate-90")}
        />
        Продвинутый выбор: указать конкретную модель
      </button>

      {advancedOpen && (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-elevated p-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink-muted">Модель напрямую</span>
            <select
              value={value.model ?? ""}
              onChange={(e) => selectExplicitModel(e.target.value)}
              className="focus-ring h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink"
            >
              <option value="">— использовать пресет «{presetLabel(currentPreset)}» —</option>
              {allModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                  {m.provider ? ` (${m.provider})` : ""}
                </option>
              ))}
            </select>
            <span className="text-xs text-ink-faint">
              Список берётся из pricing.json. Если не хватает модели — добавь её
              в Storage → team-config.
            </span>
          </label>
          {config.keys && (
            <div className="flex flex-wrap gap-2 text-xs">
              <KeyChip provider="anthropic" status={config.keys.anthropic} />
              <KeyChip provider="openai" status={config.keys.openai} />
              <KeyChip provider="google" status={config.keys.google} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function presetLabel(name: string): string {
  if (name === "fast") return "Быстро";
  if (name === "balanced") return "Сбалансированно";
  if (name === "best") return "Лучшее";
  return name;
}

function KeyChip({ provider, status }: { provider: string; status: boolean }) {
  return (
    <span
      className={
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 " +
        (status ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")
      }
      title={status ? "Ключ настроен" : "Ключ не задан в Админке"}
    >
      <span aria-hidden="true">{status ? "🟢" : "🔴"}</span>
      {provider}
    </span>
  );
}
