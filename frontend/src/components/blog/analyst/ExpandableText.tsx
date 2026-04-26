"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

interface ExpandableTextProps {
  // Заголовок для модалки (например, «Транскрипция»).
  title: string;
  // Полный текст. Может быть многострочным — в модалке сохраним переносы.
  text: string;
  // Кол-во строк до клика. По умолчанию 2.
  clampLines?: 1 | 2 | 3;
  // Дополнительные классы на превью (цвет текста и т.п.).
  previewClassName?: string;
}

// Ячейка с длинным текстом: превью (line-clamp) + клик → модалка с полным текстом.
// Используем для транскрипции, саммари, описания. Подложка с blur, закрытие по Esc и клику.
export default function ExpandableText({
  title,
  text,
  clampLines = 2,
  previewClassName = "text-ink-muted",
}: ExpandableTextProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const clampClass =
    clampLines === 1 ? "line-clamp-1" : clampLines === 3 ? "line-clamp-3" : "line-clamp-2";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // ВАЖНО: line-clamp использует `display: -webkit-box`, и если поставить
        // его прямо на <button>, браузер игнорирует — utility `block` или
        // user-agent-стили перебивают display. Поэтому line-clamp идёт на span
        // внутри, а кнопка — просто кликабельная обёртка во всю ширину ячейки.
        className="group block w-full cursor-pointer text-left"
        title="Нажмите, чтобы прочитать целиком"
      >
        <span
          className={[
            clampClass,
            previewClassName,
            "transition-colors group-hover:text-ink",
          ].join(" ")}
        >
          {text}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            role="presentation"
          />

          <div className="relative z-10 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl border border-line bg-surface shadow-pop">
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <h2 className="font-display text-lg font-semibold tracking-tight">
                {title}
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted transition hover:bg-elevated hover:text-ink"
                aria-label="Закрыть"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto px-6 py-5">
              <p className="whitespace-pre-wrap text-base leading-relaxed text-ink">
                {text}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
