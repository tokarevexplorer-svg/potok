"use client";

import { useState } from "react";
import clsx from "clsx";
import type { AiStatus } from "@/lib/types";

interface IsReferenceCellProps {
  videoId: string;
  value: boolean | null;
  aiStatus: AiStatus;
  onChange: (videoId: string, value: boolean | null) => Promise<void>;
}

// Toggle-кнопка референса: ✅ (для блога) / ❌ (другое) / ничего (не определено).
// Клик циклически переключает: null → true → false → null. Простая трёхпозиционная
// кнопка без поповера — экономит клики, и по эмодзи сразу видно состояние.
export default function IsReferenceCell({
  videoId,
  value,
  aiStatus,
  onChange,
}: IsReferenceCellProps) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    if (busy) return;
    const next: boolean | null = value === null ? true : value === true ? false : null;
    setBusy(true);
    try {
      await onChange(videoId, next);
    } finally {
      setBusy(false);
    }
  }

  // Пока AI ещё анализирует и значения не пришло — показываем индикатор.
  if (value === null && aiStatus === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-ink-faint">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        Определяю…
      </span>
    );
  }

  const label =
    value === true ? "Для блога" : value === false ? "Другое" : "Не определено";
  const emoji = value === true ? "✅" : value === false ? "❌" : "·";
  const title = `${label} · клик: ${
    value === null ? "пометить как «для блога»" : value === true ? "пометить как «другое»" : "снять отметку"
  }`;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      title={title}
      aria-label={`Референс: ${label}`}
      className={clsx(
        "focus-ring inline-flex h-7 min-w-[2.25rem] items-center justify-center gap-1 rounded-full border px-2 text-sm transition disabled:opacity-50",
        value === true && "border-line bg-elevated text-ink hover:border-line-strong",
        value === false && "border-line bg-elevated text-ink-muted hover:border-line-strong",
        value === null && "border-dashed border-line bg-transparent text-ink-faint hover:border-line-strong hover:text-ink-muted",
      )}
    >
      <span aria-hidden>{emoji}</span>
    </button>
  );
}
