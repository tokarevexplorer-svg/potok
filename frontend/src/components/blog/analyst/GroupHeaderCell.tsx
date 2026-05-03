"use client";

import { useState, type CSSProperties } from "react";
import { ChevronDown, ChevronRight, GripVertical } from "lucide-react";
import clsx from "clsx";
import { columnGroupLabels, type ColumnGroup } from "@/lib/videoTableColumns";

interface GroupHeaderCellProps {
  group: ColumnGroup;
  // Сколько столбцов «под» этой шапкой (для colSpan). Свёрнутая = 1.
  colSpan: number;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onMoveGroup: (from: ColumnGroup, to: ColumnGroup) => void;
  // Sticky-параметры (если шапка относится к закреплённым колонкам).
  sticky?: { left: number; isLastFrozen: boolean };
}

// Шапка группы с шевроном (свернуть/развернуть) и drag-handle (перенос группы).
// Перетаскивание реализовано на нативных HTML5 drag events.
export default function GroupHeaderCell({
  group,
  colSpan,
  collapsed,
  onToggleCollapsed,
  onMoveGroup,
  sticky,
}: GroupHeaderCellProps) {
  const [dragOver, setDragOver] = useState(false);

  const style: CSSProperties = sticky
    ? {
        position: "sticky",
        left: sticky.left,
        zIndex: 30,
        boxShadow: sticky.isLastFrozen ? "2px 0 4px rgba(15,16,17,0.06)" : undefined,
      }
    : {};

  const label = columnGroupLabels[group];

  // Свёрнутая шапка — узкая ячейка с одним только chevron-right. Название
  // раздела ушло в title (тултип): полноразмерный заголовок в узком столбце
  // выглядит уродливо, а вертикальный текст — ещё хуже на горизонтальной
  // таблице.
  if (collapsed) {
    return (
      <th
        colSpan={colSpan}
        style={style}
        className="border-r border-line/70 bg-elevated/60 p-0 align-middle last:border-r-0"
      >
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="focus-ring inline-flex h-full w-full items-center justify-center text-ink-muted transition hover:bg-line/40 hover:text-ink"
          aria-label={`Развернуть «${label}»`}
          title={`Развернуть «${label}»`}
        >
          <ChevronRight size={14} />
        </button>
      </th>
    );
  }

  return (
    <th
      colSpan={colSpan}
      style={style}
      className={clsx(
        "group/grouphdr border-r border-line/70 bg-elevated/60 px-3 py-2 text-left align-middle last:border-r-0",
        dragOver && "bg-accent-soft/60",
      )}
      onDragOver={(e) => {
        const from = e.dataTransfer.types.includes("application/x-potok-group");
        if (!from) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        const fromGroup = e.dataTransfer.getData("application/x-potok-group") as ColumnGroup;
        setDragOver(false);
        if (fromGroup && fromGroup !== group) onMoveGroup(fromGroup, group);
      }}
    >
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="focus-ring inline-flex h-6 w-6 items-center justify-center rounded text-ink-muted transition hover:bg-line/40 hover:text-ink"
          aria-label={`Свернуть «${label}»`}
          title="Свернуть"
        >
          <ChevronDown size={14} />
        </button>
        <span
          // HTML5 drag: handle с draggable=true. Включаем drag только за иконку,
          // чтобы случайный drag по тексту шапки не запускал перенос группы.
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("application/x-potok-group", group);
            e.dataTransfer.effectAllowed = "move";
          }}
          className="inline-flex h-6 w-5 cursor-grab items-center justify-center text-ink-faint opacity-0 transition hover:text-ink-muted group-hover/grouphdr:opacity-100 active:cursor-grabbing"
          title="Перетащить раздел"
          aria-label={`Перетащить раздел «${label}»`}
        >
          <GripVertical size={14} />
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          {label}
        </span>
      </div>
    </th>
  );
}
