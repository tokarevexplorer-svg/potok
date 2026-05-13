"use client";

// Сессия 45: мастер «+ Создать базу». Кликабельная кнопка + 3-шаговая модалка:
//   Шаг 1 — имя + описание
//   Шаг 2 — колонки (имя + тип + опции для select/multi_select)
//   Шаг 3 — превью + подтверждение
//
// После успешного создания делает router.refresh() — серверная страница
// /blog/databases перерисовывается с новой карточкой.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import {
  createCustomDatabase,
  type CustomColumnSpec,
  type CustomColumnType,
} from "@/lib/team/teamBackendClient";

const TYPE_LABELS: { value: CustomColumnType; label: string; hint: string }[] = [
  { value: "text", label: "Короткий текст", hint: "одна строка" },
  { value: "long_text", label: "Длинный текст", hint: "абзацы" },
  { value: "number", label: "Число", hint: "целое или дробное" },
  { value: "url", label: "Ссылка", hint: "URL" },
  { value: "select", label: "Выбор из списка", hint: "один из вариантов" },
  { value: "multi_select", label: "Мультивыбор", hint: "несколько вариантов" },
  { value: "date", label: "Дата", hint: "ДД.ММ.ГГГГ" },
  { value: "boolean", label: "Да/Нет", hint: "галочка" },
];

interface DraftColumn extends CustomColumnSpec {
  optionsRaw?: string; // строка из textarea, парсится перед сабмитом
}

function blankColumn(): DraftColumn {
  return { name: "", label: "", type: "text" };
}

export default function CreateDatabaseButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [columns, setColumns] = useState<DraftColumn[]>([blankColumn()]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setStep(1);
    setName("");
    setDescription("");
    setColumns([blankColumn()]);
    setError(null);
    setSubmitting(false);
  }

  function closeAll() {
    setOpen(false);
    reset();
  }

  function updateColumn(idx: number, patch: Partial<DraftColumn>) {
    setColumns((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function addColumn() {
    setColumns((prev) => [...prev, blankColumn()]);
  }
  function removeColumn(idx: number) {
    setColumns((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));
  }

  // Подготовка финального payload: парсим options из строки, чистим label.
  function buildPayload(): { name: string; description: string | null; columns: CustomColumnSpec[] } {
    const cols: CustomColumnSpec[] = columns.map((c) => {
      const spec: CustomColumnSpec = {
        name: c.name.trim(),
        label: c.label?.trim() || c.name.trim(),
        type: c.type,
      };
      if (c.type === "select" || c.type === "multi_select") {
        const opts = (c.optionsRaw ?? "")
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean);
        spec.options = opts;
      }
      return spec;
    });
    return {
      name: name.trim(),
      description: description.trim() || null,
      columns: cols,
    };
  }

  function canGoStep2(): boolean {
    return name.trim().length > 0;
  }
  function canGoStep3(): boolean {
    return columns.length > 0 && columns.every((c) => c.name.trim().length > 0);
  }

  async function handleSubmit() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const payload = buildPayload();
      const created = await createCustomDatabase(payload);
      // Закрываем модалку, перерисовываем индекс + переходим в новую базу.
      closeAll();
      router.refresh();
      router.push(`/blog/databases/${encodeURIComponent(created.name)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-surface shadow-card transition hover:bg-accent-hover"
      >
        <Plus size={16} /> Создать базу
      </button>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={submitting ? undefined : closeAll}
        role="presentation"
      />
      <div className="relative z-10 flex h-full max-h-screen w-full max-w-2xl flex-col overflow-hidden bg-surface shadow-pop sm:h-auto sm:max-h-[90vh] sm:rounded-2xl sm:border sm:border-line">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Шаг {step} из 3
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-tight">
              {step === 1
                ? "Имя базы"
                : step === 2
                  ? "Колонки"
                  : "Подтверждение"}
            </h2>
          </div>
          <button
            type="button"
            onClick={closeAll}
            disabled={submitting}
            className="focus-ring -mr-2 inline-flex h-9 w-9 items-center justify-center rounded-xl text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-50"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-5">
          {step === 1 && (
            <div className="flex flex-col gap-4">
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-ink">Имя базы</span>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Например: Контент-план"
                  className="focus-ring rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-sm font-medium text-ink">
                  Описание <span className="text-xs text-ink-faint">(опционально)</span>
                </span>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Одна короткая строка"
                  className="focus-ring rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-3">
              {columns.map((col, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-line bg-elevated/40 p-3"
                >
                  <div className="flex flex-wrap items-end gap-3">
                    <label className="flex min-w-[160px] flex-1 flex-col gap-1">
                      <span className="text-xs font-medium text-ink-muted">
                        Имя поля (латиница, как в БД)
                      </span>
                      <input
                        type="text"
                        value={col.name}
                        onChange={(e) =>
                          updateColumn(idx, { name: e.target.value.toLowerCase() })
                        }
                        placeholder="например: title"
                        className="focus-ring rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink"
                      />
                    </label>
                    <label className="flex min-w-[140px] flex-1 flex-col gap-1">
                      <span className="text-xs font-medium text-ink-muted">
                        Подпись (показывается в UI)
                      </span>
                      <input
                        type="text"
                        value={col.label ?? ""}
                        onChange={(e) => updateColumn(idx, { label: e.target.value })}
                        placeholder="например: Название"
                        className="focus-ring rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink"
                      />
                    </label>
                    <label className="flex min-w-[160px] flex-col gap-1">
                      <span className="text-xs font-medium text-ink-muted">Тип</span>
                      <select
                        value={col.type}
                        onChange={(e) =>
                          updateColumn(idx, { type: e.target.value as CustomColumnType })
                        }
                        className="focus-ring rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink"
                      >
                        {TYPE_LABELS.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => removeColumn(idx)}
                      disabled={columns.length <= 1}
                      className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-canvas hover:text-rose-700 disabled:opacity-30"
                      aria-label="Удалить колонку"
                      title="Удалить колонку"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {(col.type === "select" || col.type === "multi_select") && (
                    <label className="mt-3 flex flex-col gap-1">
                      <span className="text-xs font-medium text-ink-muted">
                        Варианты (через запятую или с новой строки)
                      </span>
                      <textarea
                        value={col.optionsRaw ?? ""}
                        onChange={(e) =>
                          updateColumn(idx, { optionsRaw: e.target.value })
                        }
                        rows={2}
                        placeholder="Идея, В работе, Готово"
                        className="focus-ring rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink"
                      />
                    </label>
                  )}
                </div>
              ))}
              <button
                type="button"
                onClick={addColumn}
                className="focus-ring inline-flex items-center gap-2 self-start rounded-xl border border-dashed border-line px-3 py-1.5 text-sm font-medium text-ink-muted hover:border-line-strong hover:text-ink"
              >
                <Plus size={14} /> Добавить колонку
              </button>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl border border-line bg-elevated/40 p-4">
                <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                  {name.trim() || "(без имени)"}
                </h3>
                {description.trim() && (
                  <p className="mt-1 text-sm text-ink-muted">{description.trim()}</p>
                )}
              </div>
              <div className="rounded-xl border border-line bg-surface shadow-card">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-line bg-elevated/40 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    <tr>
                      <th className="px-4 py-2">Поле</th>
                      <th className="px-4 py-2">Подпись</th>
                      <th className="px-4 py-2">Тип</th>
                    </tr>
                  </thead>
                  <tbody>
                    {columns.map((c, i) => {
                      const typeMeta = TYPE_LABELS.find((t) => t.value === c.type);
                      return (
                        <tr key={i} className="border-b border-line last:border-b-0">
                          <td className="px-4 py-2 font-mono text-xs text-ink">{c.name}</td>
                          <td className="px-4 py-2 text-ink">{c.label || c.name}</td>
                          <td className="px-4 py-2 text-ink-muted">
                            {typeMeta?.label ?? c.type}
                            {(c.type === "select" || c.type === "multi_select") &&
                              c.optionsRaw && (
                                <div className="mt-0.5 text-[11px] text-ink-faint">
                                  {c.optionsRaw}
                                </div>
                              )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs italic text-ink-faint">
                После создания у базы появится отдельная страница со списком записей.
                Туда можно будет добавлять/редактировать данные.
              </p>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-3">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s === 2 ? 1 : 2))}
              disabled={submitting}
              className="focus-ring rounded-xl border border-line bg-surface px-3 py-1.5 text-sm text-ink hover:border-line-strong disabled:opacity-50"
            >
              ← Назад
            </button>
          ) : (
            <span />
          )}
          {step < 3 ? (
            <button
              type="button"
              onClick={() => setStep((s) => (s === 1 ? 2 : 3))}
              disabled={step === 1 ? !canGoStep2() : !canGoStep3()}
              className="focus-ring rounded-xl bg-accent px-4 py-1.5 text-sm font-semibold text-surface hover:bg-accent-hover disabled:opacity-50"
            >
              Далее →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="focus-ring inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-1.5 text-sm font-semibold text-surface hover:bg-accent-hover disabled:opacity-50"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Создать базу
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
