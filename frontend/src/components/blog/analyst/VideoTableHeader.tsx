"use client";

import { type CSSProperties, useMemo } from "react";
import clsx from "clsx";
import { ChevronRight } from "lucide-react";
import {
  CHECKBOX_COLUMN_WIDTH,
  columnGroupLabels,
  type ColumnGroup,
} from "@/lib/videoTableColumns";
import {
  isFrozenAt,
  type RenderedColumn,
} from "@/lib/tableLayout";
import GroupHeaderCell from "./GroupHeaderCell";
import ColumnResizeHandle from "./ColumnResizeHandle";

interface VideoTableHeaderProps {
  rendered: RenderedColumn[];
  // offset[i] = накопительная ширина для позиции i. offset[0]=0 (чекбокс),
  // offset[1] = ширина чекбокса, offset[i+1] = offset[i] + width(rendered[i-1]).
  cumulativeOffsets: number[];
  frozenCount: number;
  selectionState: "none" | "all" | "some";
  onToggleAll: () => void;
  onToggleGroupCollapsed: (g: ColumnGroup) => void;
  onMoveGroup: (from: ColumnGroup, to: ColumnGroup) => void;
  onResizeColumn: (key: string, width: number) => void;
}

// Сегмент верхней строки (шапка группы или плейсхолдер свёрнутой группы).
type Row1Segment =
  | { kind: "data"; group: ColumnGroup; startIdx: number; span: number }
  | { kind: "collapsed"; group: ColumnGroup; idx: number };

function buildRow1Segments(rendered: RenderedColumn[]): Row1Segment[] {
  const segments: Row1Segment[] = [];
  let i = 0;
  while (i < rendered.length) {
    const it = rendered[i];
    if (it.kind === "collapsed") {
      segments.push({ kind: "collapsed", group: it.group, idx: i });
      i += 1;
      continue;
    }
    const group = it.group;
    let span = 0;
    while (i + span < rendered.length) {
      const nx = rendered[i + span];
      if (nx.kind !== "data" || nx.group !== group) break;
      span += 1;
    }
    segments.push({ kind: "data", group, startIdx: i, span });
    i += span;
  }
  return segments;
}

function stickyStyle(offsetPx: number, isLastFrozen: boolean): CSSProperties {
  return {
    position: "sticky",
    left: offsetPx,
    zIndex: 25,
    boxShadow: isLastFrozen ? "2px 0 4px rgba(15,16,17,0.06)" : undefined,
  };
}

export default function VideoTableHeader({
  rendered,
  cumulativeOffsets,
  frozenCount,
  selectionState,
  onToggleAll,
  onToggleGroupCollapsed,
  onMoveGroup,
  onResizeColumn,
}: VideoTableHeaderProps) {
  const segments = useMemo(() => buildRow1Segments(rendered), [rendered]);

  // Индекс последней «закреплённой» колонки в rendered — нужно для теневой границы.
  const lastFrozenIdx = useMemo(() => {
    let last = -1;
    for (let j = 0; j < rendered.length; j++) {
      if (isFrozenAt(rendered, j, frozenCount)) last = j;
    }
    return last;
  }, [rendered, frozenCount]);

  return (
    <thead className="bg-elevated/60">
      <tr className="border-b border-line">
        {/* Чекбокс — всегда закреплён слева, занимает обе строки шапки. */}
        <th
          rowSpan={2}
          style={{
            position: "sticky",
            left: 0,
            zIndex: 35,
            width: CHECKBOX_COLUMN_WIDTH,
            minWidth: CHECKBOX_COLUMN_WIDTH,
          }}
          className="border-r border-line/70 bg-elevated/95 px-3 py-2 align-middle backdrop-blur-sm"
        >
          <CheckAll state={selectionState} onToggle={onToggleAll} />
        </th>
        {segments.map((seg) => {
          if (seg.kind === "collapsed") {
            const item = rendered[seg.idx];
            const sticky = isFrozenAt(rendered, seg.idx, frozenCount);
            const isLastFrozen = seg.idx === lastFrozenIdx;
            return (
              <th
                key={`row1-collapsed-${seg.idx}`}
                rowSpan={2}
                style={{
                  width: item.width,
                  minWidth: item.width,
                  ...(sticky ? stickyStyle(cumulativeOffsets[seg.idx + 1], isLastFrozen) : {}),
                  ...(sticky ? { background: "#FAFAF7" } : {}),
                }}
                className="border-r border-line/70 align-middle"
              >
                <button
                  type="button"
                  onClick={() => onToggleGroupCollapsed(seg.group)}
                  className="focus-ring flex h-full w-full items-center justify-center text-ink-muted transition hover:bg-line/30 hover:text-ink"
                  aria-label={`Развернуть «${columnGroupLabels[seg.group]}»`}
                  title={`Развернуть «${columnGroupLabels[seg.group]}»`}
                >
                  <ChevronRight size={14} />
                </button>
              </th>
            );
          }
          // data-сегмент: обычная шапка группы. Не sticky (см. CLAUDE.md/решения).
          return (
            <GroupHeaderCell
              key={`row1-${seg.group}`}
              group={seg.group}
              colSpan={seg.span}
              collapsed={false}
              onToggleCollapsed={() => onToggleGroupCollapsed(seg.group)}
              onMoveGroup={onMoveGroup}
            />
          );
        })}
      </tr>
      <tr className="border-b border-line-strong">
        {rendered.map((it, idx) => {
          if (it.kind === "collapsed") return null; // покрыто rowSpan=2 в row 1
          const sticky = isFrozenAt(rendered, idx, frozenCount);
          const isLastFrozen = idx === lastFrozenIdx;
          return (
            <th
              key={`row2-${it.column.key}`}
              style={{
                width: it.width,
                minWidth: it.width,
                // maxWidth обязателен: без него table-layout: auto растягивает
                // колонку под длинный контент — width/minWidth недостаточно,
                // и line-clamp/truncate внутри ячеек не сработают.
                maxWidth: it.width,
                ...(sticky
                  ? {
                      ...stickyStyle(cumulativeOffsets[idx + 1], isLastFrozen),
                      background: "#FAFAF7",
                    }
                  : {}),
              }}
              className={clsx(
                "group/resize relative whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-ink-muted",
                it.column.align === "right" ? "text-right" : "",
              )}
            >
              <span className="block truncate">{it.column.label}</span>
              <ColumnResizeHandle
                currentWidth={it.width}
                onResize={(w) => onResizeColumn(it.column.key, w)}
                ariaLabel={`Изменить ширину «${it.column.label}»`}
              />
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

// Чекбокс с indeterminate.
function CheckAll({
  state,
  onToggle,
}: {
  state: "none" | "all" | "some";
  onToggle: () => void;
}) {
  return (
    <label className="inline-flex h-5 w-5 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        checked={state === "all"}
        ref={(el) => {
          if (el) el.indeterminate = state === "some";
        }}
        onChange={onToggle}
        aria-label="Выбрать все"
        className="h-4 w-4 cursor-pointer accent-accent"
      />
    </label>
  );
}
