"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Trash2, X } from "lucide-react";
import {
  COLOR_KEYS,
  COLOR_LABELS,
  ENTITY_COLORS,
  type EntityColor,
} from "@/lib/tagColors";
import EntityChip from "./EntityChip";

export interface ManageEntity {
  id: string;
  name: string;
  color: EntityColor;
}

interface EntityManageModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  entities: ManageEntity[];
  onRename: (id: string, name: string) => Promise<void>;
  onRecolor: (id: string, color: EntityColor) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  // Подпись предупреждения при удалении («Удалить категорию?»).
  deleteConfirmHint: string;
}

// Модалка управления коллекцией (категории / теги). Внутри — список с инлайн
// переименованием, выбором цвета через свотчер и удалением (с подтверждением).
export default function EntityManageModal({
  open,
  onClose,
  title,
  entities,
  onRename,
  onRecolor,
  onDelete,
  deleteConfirmHint,
}: EntityManageModalProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={onClose}
        role="presentation"
      />

      <div className="relative z-10 flex max-h-[80vh] w-full max-w-lg flex-col rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted transition hover:bg-elevated hover:text-ink"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {entities.length === 0 ? (
            <p className="px-4 py-6 text-sm text-ink-faint">
              Пока ничего не создано.
            </p>
          ) : (
            entities.map((e) => (
              <ManageRow
                key={e.id}
                entity={e}
                onRename={onRename}
                onRecolor={onRecolor}
                onDelete={onDelete}
                deleteConfirmHint={deleteConfirmHint}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function ManageRow({
  entity,
  onRename,
  onRecolor,
  onDelete,
  deleteConfirmHint,
}: {
  entity: ManageEntity;
  onRename: (id: string, name: string) => Promise<void>;
  onRecolor: (id: string, color: EntityColor) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  deleteConfirmHint: string;
}) {
  const [name, setName] = useState(entity.name);
  const [colorOpen, setColorOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const colorBtnRef = useRef<HTMLButtonElement>(null);

  // Синкаем локальный name, если родитель прислал новое значение.
  useEffect(() => {
    setName(entity.name);
  }, [entity.name]);

  async function commitName() {
    const trimmed = name.trim();
    if (!trimmed || trimmed === entity.name) {
      setName(entity.name);
      return;
    }
    setBusy(true);
    try {
      await onRename(entity.id, trimmed);
    } catch (err) {
      // Откат при ошибке (например, дубликат имени).
      setName(entity.name);
      alert((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleColor(c: EntityColor) {
    setColorOpen(false);
    if (c === entity.color) return;
    await onRecolor(entity.id, c);
  }

  async function handleDelete() {
    if (!confirm(deleteConfirmHint)) return;
    setBusy(true);
    try {
      await onDelete(entity.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-elevated">
      <div className="relative">
        <button
          ref={colorBtnRef}
          type="button"
          onClick={() => setColorOpen((v) => !v)}
          className={`focus-ring h-6 w-6 rounded-full ${ENTITY_COLORS[entity.color].swatch}`}
          aria-label="Выбрать цвет"
          title="Цвет"
        />
        {colorOpen && (
          <ColorPopover
            current={entity.color}
            onPick={handleColor}
            onClose={() => setColorOpen(false)}
            anchorRef={colorBtnRef}
          />
        )}
      </div>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setName(entity.name);
            (e.target as HTMLInputElement).blur();
          }
        }}
        disabled={busy}
        className="focus-ring h-9 flex-1 rounded-md border border-transparent bg-transparent px-2 text-sm text-ink hover:border-line focus:border-line focus:bg-canvas"
      />

      <span className="hidden sm:block">
        <EntityChip name={entity.name} color={entity.color} size="sm" />
      </span>

      <button
        type="button"
        onClick={handleDelete}
        disabled={busy}
        className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-faint transition hover:bg-accent-soft hover:text-accent disabled:opacity-50"
        title="Удалить"
        aria-label="Удалить"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function ColorPopover({
  current,
  onPick,
  onClose,
  anchorRef,
}: {
  current: EntityColor;
  onPick: (c: EntityColor) => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    function onPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t)) return;
      // Сам поповер тоже не должен закрывать клик внутри — отметим data-атрибутом.
      const el = (e.target as HTMLElement).closest("[data-color-popover]");
      if (el) return;
      onClose();
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [onClose, anchorRef]);

  return (
    <div
      data-color-popover
      className="absolute left-0 top-8 z-[95] grid grid-cols-6 gap-1 rounded-lg border border-line bg-surface p-2 shadow-pop"
    >
      {COLOR_KEYS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          title={COLOR_LABELS[c]}
          className={`relative h-6 w-6 rounded-full ${ENTITY_COLORS[c].swatch} transition hover:scale-110`}
        >
          {c === current && (
            <Check
              size={12}
              className="absolute inset-0 m-auto text-white drop-shadow"
            />
          )}
        </button>
      ))}
    </div>
  );
}
