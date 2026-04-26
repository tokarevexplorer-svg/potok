"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { X } from "lucide-react";
import Button from "@/components/ui/Button";
import { addVideoAction } from "@/lib/actions/addVideo";
import {
  addVideoInitialState,
  type AddVideoState,
} from "@/lib/actions/addVideo.types";

interface AddVideoModalProps {
  open: boolean;
  onClose: () => void;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Сохраняю…" : "Добавить"}
    </Button>
  );
}

export default function AddVideoModal({ open, onClose }: AddVideoModalProps) {
  const [state, action] = useActionState<AddVideoState, FormData>(
    addVideoAction,
    addVideoInitialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // После успешной вставки — сбрасываем форму и закрываем модалку.
  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      onClose();
    }
  }, [state, onClose]);

  // Блокируем скролл фона и закрытие по Esc, пока модалка открыта.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-video-title"
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={onClose}
        role="presentation"
      />

      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2
            id="add-video-title"
            className="font-display text-lg font-semibold tracking-tight"
          >
            Добавить видео
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

        <form ref={formRef} action={action} className="flex flex-col gap-5 p-6">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">
              Ссылка на Reels
            </span>
            <input
              name="url"
              type="url"
              inputMode="url"
              placeholder="https://www.instagram.com/reel/... или /p/..."
              required
              autoFocus
              autoComplete="off"
              className="focus-ring h-12 rounded-xl border border-line bg-canvas px-4 text-base text-ink placeholder:text-ink-faint"
            />
            <span className="text-xs text-ink-faint">
              Добавим строку в таблицу и запустим обработку. Данные появятся
              через 30–60 секунд — можно обновить страницу.
            </span>
          </label>

          {state.status === "error" && state.error && (
            <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
              {state.error}
            </p>
          )}

          <div className="mt-1 flex items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <SubmitButton />
          </div>
        </form>
      </div>
    </div>
  );
}
