"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  // tone="danger" — красная подсветка кнопки подтверждения для удалений.
  tone?: "danger" | "neutral";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// Универсальный диалог подтверждения. Используется для удаления видео;
// нативный confirm() не позволяет показать сколько строк удаляется в дизайне.
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  tone = "neutral",
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy) onCancel();
      if (e.key === "Enter" && !busy) onConfirm();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, busy, onConfirm, onCancel]);

  if (!open) return null;

  const confirmClasses =
    tone === "danger"
      ? "bg-accent text-white hover:bg-accent/90"
      : "bg-ink text-canvas hover:bg-ink/90";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={busy ? undefined : onCancel}
        role="presentation"
      />

      <div className="relative z-10 w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-pop">
        <div className="flex items-start gap-3">
          {tone === "danger" && (
            <span className="inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              <AlertTriangle size={20} />
            </span>
          )}
          <div className="flex-1">
            <h2 className="font-display text-lg font-semibold tracking-tight">
              {title}
            </h2>
            <div className="mt-2 text-sm text-ink-muted">{description}</div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="focus-ring inline-flex h-10 items-center rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink-muted transition hover:border-line-strong hover:text-ink disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`focus-ring inline-flex h-10 items-center rounded-xl px-4 text-sm font-semibold transition disabled:opacity-50 ${confirmClasses}`}
          >
            {busy ? "Удаляю…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
