"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, Plus, Settings2 } from "lucide-react";
import { ENTITY_COLORS, type EntityColor } from "@/lib/tagColors";

export interface ColoredEntity {
  id: string;
  name: string;
  color: EntityColor;
}

interface EntitySelectPopoverProps {
  open: boolean;
  onClose: () => void;
  // Якорь — относительно него позиционируем поповер.
  anchorRef: React.RefObject<HTMLElement | null>;
  entities: ColoredEntity[];
  selectedIds: string[];
  onToggle: (entity: ColoredEntity) => void;
  // Не передан — кнопка «Создать» не показывается (например, в фильтрах).
  onCreate?: (name: string) => Promise<void> | void;
  onManage?: () => void;
  // Текст пустого состояния, когда вообще нет сущностей.
  emptyHint?: string;
  // Заголовок «создать N» — например, «Создать категорию» или «Создать тег».
  createLabel?: string;
}

const POPOVER_WIDTH = 280;

export default function EntitySelectPopover({
  open,
  onClose,
  anchorRef,
  entities,
  selectedIds,
  onToggle,
  onCreate,
  onManage,
  emptyHint = "Пока нет вариантов — введи имя и нажми Enter.",
  createLabel = "Создать",
}: EntitySelectPopoverProps) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Позиционируем поповер под якорем. fixed → не зависит от overflow таблицы.
  useLayoutEffect(() => {
    if (!open) return;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(window.innerWidth - POPOVER_WIDTH - 8, rect.left),
    );
    const top = rect.bottom + 4;
    setPos({ left, top });
  }, [open, anchorRef]);

  // Сброс запроса и фокус при открытии.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  // Закрытие по Esc и клику вне поповера/якоря.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    function onPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    }
    function onScroll() {
      // Прокрутка таблицы / страницы → поповер уезжает от якоря, проще закрыть.
      onClose();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, onClose, anchorRef]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entities;
    return entities.filter((e) => e.name.toLowerCase().includes(q));
  }, [entities, query]);

  const trimmed = query.trim();
  const exactMatch = trimmed
    ? entities.find((e) => e.name.toLowerCase() === trimmed.toLowerCase())
    : null;
  const canCreate = Boolean(trimmed) && !exactMatch && Boolean(onCreate);

  async function handleCreate() {
    if (!canCreate || busy || !onCreate) return;
    setBusy(true);
    try {
      await onCreate(trimmed);
      setQuery("");
    } finally {
      setBusy(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (canCreate) {
        handleCreate();
        return;
      }
      // Enter при единственном совпадении — выбрать его.
      if (filtered.length === 1) onToggle(filtered[0]);
    }
  }

  if (!open || !pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: "fixed",
        left: pos.left,
        top: pos.top,
        width: POPOVER_WIDTH,
      }}
      className="z-[80] flex max-h-[60vh] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
      role="dialog"
      aria-modal="false"
    >
      <div className="border-b border-line p-2">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Найти или создать…"
          className="focus-ring h-9 w-full rounded-lg border border-line bg-canvas px-3 text-sm text-ink placeholder:text-ink-faint"
        />
      </div>

      <div className="flex-1 overflow-y-auto p-1">
        {filtered.length === 0 && !canCreate && (
          <div className="px-3 py-4 text-xs text-ink-faint">{emptyHint}</div>
        )}

        {filtered.map((e) => {
          const selected = selectedIds.includes(e.id);
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onToggle(e)}
              className="focus-ring flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left transition hover:bg-elevated"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className={`inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ENTITY_COLORS[e.color].chip}`}
                >
                  <span className="truncate">{e.name}</span>
                </span>
              </span>
              {selected && <Check size={16} className="shrink-0 text-accent" />}
            </button>
          );
        })}

        {canCreate && (
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy}
            className="focus-ring mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink-muted transition hover:bg-elevated hover:text-ink disabled:opacity-50"
          >
            <Plus size={14} />
            <span className="truncate">
              {createLabel} «{trimmed}»
            </span>
          </button>
        )}
      </div>

      {onManage && (
        <button
          type="button"
          onClick={onManage}
          className="focus-ring flex items-center gap-2 border-t border-line px-3 py-2 text-xs text-ink-muted transition hover:bg-elevated hover:text-ink"
        >
          <Settings2 size={14} />
          Управление
        </button>
      )}
    </div>,
    document.body,
  );
}
