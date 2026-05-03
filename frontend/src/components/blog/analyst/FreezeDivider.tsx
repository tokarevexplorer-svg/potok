"use client";

import { useCallback } from "react";
import type { RenderedColumn } from "@/lib/tableLayout";

interface FreezeDividerProps {
  // Текущая суммарная ширина закреплённых колонок (включая чекбокс) — на этой
  // позиции (в px от левого края контейнера) рисуется ручка.
  leftPx: number;
  rendered: RenderedColumn[];
  checkboxWidth: number;
  frozenCount: number;
  onChange: (newCount: number) => void;
}

// Вертикальная перегородка между закреплёнными и обычными колонками.
// На drag — пересчитывает frozenCount по тому, сколько колонок «пройдено» курсором.
// Рендерится в координатах внешнего (нескроллящегося) контейнера, чтобы
// оставаться на месте при горизонтальном скролле тела таблицы.
export default function FreezeDivider({
  leftPx,
  rendered,
  checkboxWidth,
  frozenCount,
  onChange,
}: FreezeDividerProps) {
  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      // Список ширин ТОЛЬКО data-столбцов (свёрнутые группы между ними мы тоже
      // прицепляем визуально к закреплённым, но при подсчёте новой границы
      // считаем по data-столбцам, иначе drag воспринимался бы непредсказуемо).
      const dataWidths: number[] = [];
      for (const item of rendered) {
        if (item.kind === "data") dataWidths.push(item.width);
      }
      const startCount = frozenCount;

      function onMove(ev: PointerEvent) {
        const dx = ev.clientX - startX;
        let newCount = startCount;
        if (dx > 0) {
          // Расширяем «закреплённую зону» вправо: проходим столбцы пока
          // суммарно прошли больше половины очередного.
          let acc = 0;
          let n = startCount;
          while (n < dataWidths.length) {
            const next = dataWidths[n];
            if (acc + next / 2 < dx) {
              acc += next;
              n += 1;
            } else break;
          }
          newCount = n;
        } else {
          let acc = 0;
          let n = startCount;
          while (n > 0) {
            const prev = dataWidths[n - 1];
            if (acc + prev / 2 < -dx) {
              acc += prev;
              n -= 1;
            } else break;
          }
          newCount = n;
        }
        onChange(newCount);
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
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    },
    [rendered, frozenCount, onChange],
  );

  // Прячем перегородку, если суммарная ширина равна только чекбоксу — тащить
  // отрицательно нельзя, минимальная позиция и так у самого левого края.
  // Но кнопку drag'а оставляем для UX: пользователь может «вытянуть» из края.
  const visualLeft = Math.max(checkboxWidth - 6, leftPx - 6);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Перетащить, чтобы изменить количество закреплённых столбцов"
      onPointerDown={onPointerDown}
      style={{ left: visualLeft }}
      className="group/freeze pointer-events-auto absolute inset-y-0 z-40 flex w-3 cursor-ew-resize items-center justify-center"
      title="Закрепить столбцы (потяни ←/→)"
    >
      <span
        aria-hidden
        className="block h-full w-[3px] rounded-full bg-accent/30 transition-colors group-hover/freeze:bg-accent"
      />
    </div>
  );
}
