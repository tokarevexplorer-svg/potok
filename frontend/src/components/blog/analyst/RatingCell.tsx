"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Star } from "lucide-react";
import clsx from "clsx";
import type { Rating } from "@/lib/types";
import { RATING_ORDER, RATINGS } from "@/lib/rating";

interface RatingCellProps {
  videoId: string;
  ratings: Rating[];
  onChange: (videoId: string, ratings: Rating[]) => Promise<void>;
}

const POPOVER_WIDTH = 240;

// Кнопка-эмодзи рядом с превью. Multi-select: можно проставить несколько
// оценок одновременно, каждая независима. Поповер не закрывается на клик —
// удобно проставить сразу две (например, ✅ + 🔥).
export default function RatingCell({ videoId, ratings, onChange }: RatingCellProps) {
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

  async function handleToggle(r: Rating) {
    const next = ratings.includes(r)
      ? ratings.filter((x) => x !== r)
      : [...ratings, r];
    await onChange(videoId, next);
  }

  async function handleClear() {
    setOpen(false);
    if (ratings.length === 0) return;
    await onChange(videoId, []);
  }

  const hasAny = ratings.length > 0;
  const summary = RATING_ORDER.filter((r) => ratings.includes(r))
    .map((r) => RATINGS[r].label)
    .join(", ");

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={hasAny ? `Оценки: ${summary}` : "Поставить оценку"}
        title={hasAny ? summary : "Поставить оценку"}
        className={clsx(
          "focus-ring inline-flex h-7 items-center justify-center rounded-md text-base transition",
          hasAny
            ? "bg-elevated px-1.5 hover:bg-line"
            : "w-7 text-ink-faint opacity-0 hover:bg-elevated hover:text-ink-muted group-hover:opacity-100 focus:opacity-100",
        )}
      >
        {hasAny ? (
          <span className="inline-flex items-center gap-0.5 leading-none">
            {RATING_ORDER.filter((r) => ratings.includes(r)).map((r) => (
              <span key={r}>{RATINGS[r].emoji}</span>
            ))}
          </span>
        ) : (
          <Star size={14} />
        )}
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
                const on = ratings.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => handleToggle(r)}
                    aria-pressed={on}
                    className="focus-ring flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-elevated"
                  >
                    <span className="flex items-center gap-2">
                      <span className="text-base leading-none">{item.emoji}</span>
                      <span className="text-ink">{item.label}</span>
                    </span>
                    {on && <Check size={16} className="shrink-0 text-accent" />}
                  </button>
                );
              })}

              {hasAny && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="focus-ring mt-1 flex items-center gap-2 rounded-md border-t border-line px-2 py-1.5 text-left text-xs text-ink-muted transition hover:bg-elevated hover:text-ink"
                >
                  Снять все оценки
                </button>
              )}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
