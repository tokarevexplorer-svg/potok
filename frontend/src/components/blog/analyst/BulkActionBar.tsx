"use client";

import { Trash2, X } from "lucide-react";

interface BulkActionBarProps {
  count: number;
  onClear: () => void;
  onDelete: () => void;
}

// Плавающая панель снизу — появляется, когда выбрана хотя бы одна строка.
// Стиль: «toast»-bar, центрированный, темный фон, контраст с канвасом.
export default function BulkActionBar({
  count,
  onClear,
  onDelete,
}: BulkActionBarProps) {
  if (count === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[80] flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-line bg-ink px-4 py-3 text-canvas shadow-pop">
        <span className="text-sm font-medium">
          Выбрано: {count} {plural(count, "видео", "видео", "видео")}
        </span>

        <span className="h-5 w-px bg-canvas/20" aria-hidden />

        <button
          type="button"
          onClick={onDelete}
          className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-white transition hover:bg-accent/90"
        >
          <Trash2 size={14} />
          Удалить
        </button>

        <button
          type="button"
          onClick={onClear}
          className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-xl text-canvas/70 transition hover:bg-canvas/10 hover:text-canvas"
          title="Снять выделение"
          aria-label="Снять выделение"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
