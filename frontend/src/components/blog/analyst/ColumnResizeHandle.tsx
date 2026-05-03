"use client";

import { useCallback } from "react";

interface ColumnResizeHandleProps {
  // Текущая ширина в px — нужна для вычисления новой при drag.
  currentWidth: number;
  onResize: (newWidth: number) => void;
  // Опциональная подпись для accessibility.
  ariaLabel?: string;
}

// Тонкая вертикальная ручка у правого края заголовка столбца.
// Поведение: mousedown → перехват глобальных mousemove → mouseup. Меняет ширину
// в реальном времени, чтобы пользователь сразу видел результат.
export default function ColumnResizeHandle({
  currentWidth,
  onResize,
  ariaLabel,
}: ColumnResizeHandleProps) {
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Resize не должен открывать сортировку или drag группы — гасим всё.
      e.stopPropagation();
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = currentWidth;

      function onMove(ev: PointerEvent) {
        const dx = ev.clientX - startX;
        onResize(startWidth + dx);
      }
      function onUp() {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onUp);
      // Курсор и блокировка выделения текста на время перетаскивания.
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [currentWidth, onResize],
  );

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel ?? "Изменить ширину столбца"}
      onPointerDown={onPointerDown}
      // 8px-зона захвата справа от заголовка. Сама полоса узкая (1px),
      // но кликабельная зона шире, чтобы попадать без прицеливания.
      className="absolute right-0 top-0 z-20 flex h-full w-2 -translate-x-px cursor-col-resize items-stretch justify-end"
    >
      <span
        aria-hidden
        className="block h-full w-px bg-line/0 transition-colors group-hover/resize:bg-line-strong hover:bg-accent"
      />
    </span>
  );
}
