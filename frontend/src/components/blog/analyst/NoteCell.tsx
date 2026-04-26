"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

interface NoteCellProps {
  videoId: string;
  initialValue: string | null;
  onSave: (videoId: string, value: string | null) => Promise<void>;
}

const POPOVER_WIDTH = 320;

// Превью заметки в ячейке + поповер с textarea при клике.
// Сохранение — на blur или Esc (тоже сохраняет, как Notion).
export default function NoteCell({
  videoId,
  initialValue,
  onSave,
}: NoteCellProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialValue ?? "");
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Если из родителя пришло новое значение (обновление с сервера) — синкаем.
  useEffect(() => {
    if (!open) setValue(initialValue ?? "");
  }, [initialValue, open]);

  useLayoutEffect(() => {
    if (!open) return;
    const a = anchorRef.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    const left = Math.max(
      8,
      Math.min(window.innerWidth - POPOVER_WIDTH - 8, r.left),
    );
    setPos({ left, top: r.bottom + 4 });
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [open]);

  async function commit() {
    const trimmed = value.trim();
    const next = trimmed === "" ? null : trimmed;
    const prev = initialValue ?? null;
    if (next === prev) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await onSave(videoId, next);
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  // Esc и клик вне — коммит. Это привычное Notion-поведение: уходишь — сохранилось.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        commit();
      }
    }
    function onPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      commit();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, value, initialValue]);

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring -mx-1 block w-full rounded-md px-1 py-0.5 text-left text-sm transition hover:bg-elevated"
        title="Заметка"
      >
        {initialValue ? (
          <span className="line-clamp-2 text-ink">{initialValue}</span>
        ) : (
          <span className="text-ink-faint">Добавить заметку…</span>
        )}
      </button>

      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              width: POPOVER_WIDTH,
            }}
            className="z-[80] rounded-xl border border-line bg-surface p-2 shadow-pop"
          >
            <textarea
              ref={textareaRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={4}
              placeholder="Заметка к видео…"
              className="focus-ring w-full resize-none rounded-lg border border-line bg-canvas p-2 text-sm text-ink placeholder:text-ink-faint"
            />
            <div className="mt-1 flex items-center justify-between px-1 text-[11px] text-ink-faint">
              <span>{busy ? "Сохраняю…" : "Сохранится при закрытии"}</span>
              <span>Esc — закрыть</span>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
