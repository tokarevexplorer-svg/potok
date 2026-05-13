"use client";

// Сессия 45: CRUD по записям пользовательской базы.
// Не пытаемся переписать всю таблицу — на серверной странице она уже
// отрендерена. Здесь — overlay с кнопкой «+ Добавить запись», на каждой
// строке — кнопки «Редактировать» / «Удалить» (по data-record-id), при
// успехе делаем router.refresh() и серверная страница перерисуется.
//
// Используется в [slug]/page.tsx через клиентский слой над таблицей.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  addDatabaseRecord,
  deleteDatabaseRecord,
  updateDatabaseRecord,
  type CustomColumnType,
} from "@/lib/team/teamBackendClient";

interface ColumnDef {
  key: string;
  label: string;
  type?: CustomColumnType;
  options?: string[];
}

interface Props {
  databaseId: string;
  columns: ColumnDef[];
  records: Record<string, unknown>[];
}

export default function CustomDbRecordEditor({ databaseId, columns, records }: Props) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);

  async function handleDelete(recordId: string) {
    if (!confirm("Удалить запись?")) return;
    try {
      await deleteDatabaseRecord(databaseId, recordId);
      router.refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <div className="mt-6 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="focus-ring inline-flex items-center gap-2 rounded-xl bg-accent px-3 py-1.5 text-sm font-semibold text-surface hover:bg-accent-hover"
        >
          <Plus size={14} /> Добавить запись
        </button>
      </div>

      {/* Накладываем над таблицей лёгкую панель действий: рендерим
          невидимый блок с расположением «attach below table». Делаем
          через absolute-overlay карточки, чтобы не переписывать всю
          серверную разметку — серверная таблица показывает данные,
          этот клиентский слой показывает кнопки. */}
      {records.length > 0 && (
        <div className="mt-4 rounded-xl border border-line bg-elevated/30 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Действия по записям
          </p>
          <div className="flex flex-wrap gap-2">
            {records.map((rec, idx) => {
              const id = String(rec.id ?? `_${idx}`);
              const displayName =
                (rec[columns[0]?.key ?? "id"] as string | undefined) ?? id.slice(0, 8);
              return (
                <div
                  key={id}
                  className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 text-xs"
                >
                  <span className="max-w-[180px] truncate text-ink">{displayName}</span>
                  <button
                    type="button"
                    onClick={() => setEditing(rec)}
                    className="focus-ring rounded p-0.5 text-ink-muted hover:text-ink"
                    title="Редактировать"
                    aria-label="Редактировать"
                  >
                    <Pencil size={12} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(id)}
                    className="focus-ring rounded p-0.5 text-ink-muted hover:text-rose-700"
                    title="Удалить"
                    aria-label="Удалить"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(addOpen || editing) && (
        <RecordModal
          databaseId={databaseId}
          columns={columns}
          record={editing}
          onClose={() => {
            setAddOpen(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAddOpen(false);
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function defaultForType(type: CustomColumnType | undefined): unknown {
  if (type === "boolean") return false;
  if (type === "multi_select") return [];
  return "";
}

function RecordModal({
  databaseId,
  columns,
  record,
  onClose,
  onSaved,
}: {
  databaseId: string;
  columns: ColumnDef[];
  record: Record<string, unknown> | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!record;
  const [values, setValues] = useState<Record<string, unknown>>(() => {
    const init: Record<string, unknown> = {};
    for (const c of columns) {
      if (record && record[c.key] !== undefined && record[c.key] !== null) {
        init[c.key] = record[c.key];
      } else {
        init[c.key] = defaultForType(c.type);
      }
    }
    return init;
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField(key: string, value: unknown) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function save() {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Подготовка payload: убираем пустые строки в null, кастуем числа.
      const payload: Record<string, unknown> = {};
      for (const c of columns) {
        const v = values[c.key];
        if (c.type === "boolean") {
          payload[c.key] = Boolean(v);
          continue;
        }
        if (c.type === "number") {
          if (v === "" || v === null || v === undefined) payload[c.key] = null;
          else payload[c.key] = Number(v);
          continue;
        }
        if (c.type === "multi_select") {
          payload[c.key] = Array.isArray(v) ? v : [];
          continue;
        }
        if (typeof v === "string" && v.trim() === "") {
          payload[c.key] = null;
          continue;
        }
        payload[c.key] = v;
      }
      if (isEdit && record?.id) {
        await updateDatabaseRecord(databaseId, String(record.id), payload);
      } else {
        await addDatabaseRecord(databaseId, payload);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={submitting ? undefined : onClose}
        role="presentation"
      />
      <div className="relative z-10 flex h-full max-h-screen w-full max-w-xl flex-col overflow-hidden bg-surface shadow-pop sm:h-auto sm:max-h-[90vh] sm:rounded-2xl sm:border sm:border-line">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {isEdit ? "Изменить запись" : "Новая запись"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="focus-ring -mr-2 inline-flex h-9 w-9 items-center justify-center rounded-xl text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-50"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-4">
          <div className="flex flex-col gap-3">
            {columns.map((c) => (
              <FieldEditor
                key={c.key}
                column={c}
                value={values[c.key]}
                onChange={(v) => setField(c.key, v)}
              />
            ))}
          </div>
          {error && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {error}
            </p>
          )}
        </div>
        <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="focus-ring rounded-xl border border-line bg-surface px-3 py-1.5 text-sm text-ink hover:border-line-strong disabled:opacity-50"
          >
            Отмена
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={submitting}
            className="focus-ring inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-1.5 text-sm font-semibold text-surface hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? "Сохранить" : "Добавить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldEditor({
  column,
  value,
  onChange,
}: {
  column: ColumnDef;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const label = column.label || column.key;
  const baseClass =
    "focus-ring w-full rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink";

  if (column.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="accent-accent"
        />
        <span>{label}</span>
      </label>
    );
  }
  if (column.type === "long_text") {
    return (
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-ink">{label}</span>
        <textarea
          rows={3}
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={baseClass}
        />
      </label>
    );
  }
  if (column.type === "select") {
    const opts = column.options ?? [];
    return (
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-ink">{label}</span>
        <select
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className={baseClass}
        >
          <option value="">— не выбрано —</option>
          {opts.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (column.type === "multi_select") {
    const opts = column.options ?? [];
    const current = Array.isArray(value) ? (value as string[]) : [];
    return (
      <fieldset className="flex flex-col gap-1">
        <legend className="text-sm font-medium text-ink">{label}</legend>
        <div className="flex flex-wrap gap-3 pt-1">
          {opts.length === 0 ? (
            <span className="text-xs italic text-ink-faint">
              В схеме базы не заданы варианты.
            </span>
          ) : (
            opts.map((o) => (
              <label key={o} className="inline-flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={current.includes(o)}
                  onChange={(e) => {
                    if (e.target.checked) onChange([...current, o]);
                    else onChange(current.filter((x) => x !== o));
                  }}
                  className="accent-accent"
                />
                <span>{o}</span>
              </label>
            ))
          )}
        </div>
      </fieldset>
    );
  }
  if (column.type === "date") {
    return (
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-ink">{label}</span>
        <input
          type="date"
          value={typeof value === "string" ? value.slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value)}
          className={baseClass}
        />
      </label>
    );
  }
  if (column.type === "number") {
    return (
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-ink">{label}</span>
        <input
          type="number"
          value={typeof value === "number" ? value : (value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={baseClass}
        />
      </label>
    );
  }
  // text, url, default
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-medium text-ink">{label}</span>
      <input
        type={column.type === "url" ? "url" : "text"}
        value={typeof value === "string" ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        className={baseClass}
      />
    </label>
  );
}
