"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Star } from "lucide-react";
import clsx from "clsx";
import type { Rating } from "@/lib/types";
import { RATING_ORDER, RATINGS } from "@/lib/rating";

interface RatingCellProps {
  videoId: string;
  rating: Rating | null;
  onSelect: (videoId: string, rating: Rating | null) => Promise<void>;
}

const POPOVER_WIDTH = 220;

// Кнопка-эмодзи под/рядом с превью. Клик открывает поповер с тремя
// вариантами оценки + «Снять оценку». Single-select — повторный клик по той
// же оценке снимает её.
export default function RatingCell({ videoId, rating, onSelect }: RatingCellProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointer(e: MouseEvent) {
      const t = e.target as Node;
      if (popoverRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onScroll() {
      setOpen(false);
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
  }, [open]);

  async function handlePick(next: Rating) {
    setOpen(false);
    const value = next === rating ? null : next;
    await onSelect(videoId, value);
  }

  async function handleClear() {
    setOpen(false);
    await onSelect(videoId, null);
  }

  const meta = rating ? RATINGS[rating] : null;

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={meta ? `Оценка: ${meta.label}` : "Поставить оценку"}
        title={meta ? meta.label : "Поставить оценку"}
        className={clsx(
          "focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md text-base transition",
          meta
            ? "bg-elevated hover:bg-line"
            : "text-ink-faint opacity-0 hover:bg-elevated hover:text-ink-muted group-hover:opacity-100 focus:opacity-100",
        )}
      >
        {meta ? meta.emoji : <Star size={14} />}
      </button>

      {open && pos && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={popoverRef}
              style={{
                position: "fixed",
                left: pos.left,
                top: pos.top,
                width: POPOVER_WIDTH,
              }}
              className="z-[80] flex flex-col overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-pop"
              role="dialog"
              aria-modal="false"
            >
              {RATING_ORDER.map((r) => {
                const item = RATINGS[r];
                const selected = rating === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handlePick(r)}
                    className="focus-ring flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-elevated"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-base leading-none">{item.emoji}</span>
                      <span className="text-ink">{item.label}</span>
                    </span>
                    {selected && (
                      <Check size={16} className="shrink-0 text-accent" />
                    )}
                  </button>
                );
              })}

              {rating && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="focus-ring mt-1 flex items-center gap-2 rounded-md border-t border-line px-2 py-1.5 text-left text-xs text-ink-muted transition hover:bg-elevated hover:text-ink"
                >
                  Снять оценку
                </button>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
