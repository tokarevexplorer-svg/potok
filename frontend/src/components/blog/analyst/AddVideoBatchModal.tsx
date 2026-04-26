"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertTriangle, Info, X } from "lucide-react";
import Button from "@/components/ui/Button";
import { addVideoBatchAction } from "@/lib/actions/addVideoBatch";
import {
  addVideoBatchInitialState,
  type AddVideoBatchState,
} from "@/lib/actions/addVideoBatch.types";
import {
  estimateBatch,
  MAX_BATCH_SIZE,
  parseReelsList,
  WARN_BATCH_SIZE,
} from "@/lib/reelsUrlParser";

interface AddVideoBatchModalProps {
  open: boolean;
  onClose: () => void;
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? "Сохраняю…" : "Запустить обработку"}
    </Button>
  );
}

export default function AddVideoBatchModal({ open, onClose }: AddVideoBatchModalProps) {
  const [state, action] = useActionState<AddVideoBatchState, FormData>(
    addVideoBatchAction,
    addVideoBatchInitialState,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Live-предпросмотр: парсим текст в браузере на каждое изменение, чтобы Влад
  // видел сколько ссылок реально уйдёт в работу до отправки.
  const [text, setText] = useState("");
  const preview = useMemo(() => parseReelsList(text), [text]);
  const overLimit = preview.urls.length > MAX_BATCH_SIZE;
  const showWarn = preview.urls.length >= WARN_BATCH_SIZE && !overLimit;
  const estimate = useMemo(
    () => estimateBatch(preview.urls.length),
    [preview.urls.length],
  );

  // После успешной вставки — закрываем и сбрасываем форму. Тулбар таблицы сам
  // покажет прогресс-бар, потому что в БД появились pending-строки.
  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      setText("");
      onClose();
    }
  }, [state, onClose]);

  // Esc + блокировка скролла фона.
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    // Автофокус с задержкой — иначе первый Esc может не сработать в Safari.
    setTimeout(() => textareaRef.current?.focus(), 50);
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
      aria-labelledby="add-batch-title"
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={onClose}
        role="presentation"
      />

      <div className="relative z-10 flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-line bg-surface shadow-pop">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <h2
            id="add-batch-title"
            className="font-display text-lg font-semibold tracking-tight"
          >
            Добавить много видео
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

        <form
          ref={formRef}
          action={action}
          className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6"
        >
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">
              Список ссылок на Reels
            </span>
            <textarea
              ref={textareaRef}
              name="urls"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={
                "https://www.instagram.com/reel/ABC123/\nhttps://www.instagram.com/p/DEF456/\n..."
              }
              rows={10}
              required
              spellCheck={false}
              className="focus-ring resize-y rounded-xl border border-line bg-canvas px-4 py-3 font-mono text-sm text-ink placeholder:text-ink-faint"
            />
            <span className="text-xs text-ink-faint">
              По одной ссылке на строку. Запятые, точки с запятой и переносы
              работают как разделители. Лимит — {MAX_BATCH_SIZE} ссылок за раз.
            </span>
          </label>

          {/* Live-предпросмотр того, что пойдёт в работу */}
          {preview.totalLines > 0 && (
            <div className="rounded-xl border border-line bg-canvas px-4 py-3">
              <div className="grid grid-cols-3 gap-2 text-sm">
                <Stat label="Распознано" value={preview.urls.length} accent={preview.urls.length > 0} />
                <Stat label="Дублей" value={preview.duplicates} muted />
                <Stat label="Невалидных" value={preview.invalid.length} muted />
              </div>
              {preview.invalid.length > 0 && (
                <details className="mt-3 text-xs text-ink-muted">
                  <summary className="cursor-pointer select-none font-medium hover:text-ink">
                    Показать невалидные ({preview.invalid.length})
                  </summary>
                  <ul className="mt-2 space-y-1 break-all font-mono">
                    {preview.invalid.map((line, i) => (
                      <li key={i} className="text-ink-faint">
                        {line}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* Оценка времени и стоимости — показываем только когда уже большая пачка */}
          {showWarn && (
            <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">
                  Это большая пачка — {preview.urls.length} видео.
                </div>
                <div className="mt-1 text-amber-800">
                  Обработка займёт ≈ {estimate.hoursMin}–{estimate.hoursMax} ч.
                  Ориентировочная стоимость API: ~${estimate.costMin}–${estimate.costMax}{" "}
                  (Apify + OpenAI). Можно закрыть браузер — обработка идёт на
                  сервере.
                </div>
              </div>
            </div>
          )}

          {overLimit && (
            <div className="flex gap-3 rounded-xl border border-accent/40 bg-accent-soft px-4 py-3 text-sm text-accent">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-medium">
                  Превышен лимит: {preview.urls.length} {"> "}
                  {MAX_BATCH_SIZE}.
                </div>
                <div className="mt-1">
                  Раздели список на пачки по {MAX_BATCH_SIZE} ссылок.
                </div>
              </div>
            </div>
          )}

          {!showWarn && !overLimit && preview.urls.length > 0 && (
            <div className="flex gap-3 rounded-xl border border-line bg-elevated px-4 py-3 text-sm text-ink-muted">
              <Info size={18} className="mt-0.5 shrink-0 text-ink-faint" />
              <div>
                Обработка ≈ {estimate.hoursMin}–{estimate.hoursMax} ч в фоне.
                Браузер можно закрыть — статус будет в таблице.
              </div>
            </div>
          )}

          {/* Серверная ошибка из server action */}
          {state.status === "error" && state.error && (
            <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
              {state.error}
            </p>
          )}

          <div className="mt-2 flex items-center justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Отмена
            </Button>
            <SubmitButton disabled={preview.urls.length === 0 || overLimit} />
          </div>
        </form>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  muted,
}: {
  label: string;
  value: number;
  accent?: boolean;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-ink-faint">{label}</span>
      <span
        className={
          accent
            ? "font-display text-2xl font-semibold text-accent"
            : muted
              ? "font-display text-2xl font-semibold text-ink-muted"
              : "font-display text-2xl font-semibold text-ink"
        }
      >
        {value}
      </span>
    </div>
  );
}
