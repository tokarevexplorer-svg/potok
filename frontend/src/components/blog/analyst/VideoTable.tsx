"use client";

import { useMemo } from "react";
import type { MyCategory, Tag, Video } from "@/lib/types";
import {
  CHECKBOX_COLUMN_WIDTH,
  type ColumnGroup,
} from "@/lib/videoTableColumns";
import {
  getCumulativeOffsets,
  getFrozenTotalWidth,
  isFrozenAt,
  type RenderedColumn,
  type TableLayoutState,
} from "@/lib/tableLayout";
import VideoTableHeader from "./VideoTableHeader";
import VideoTableRow, { type VideoTableRowCallbacks } from "./VideoTableRow";
import FreezeDivider from "./FreezeDivider";

interface VideoTableProps extends VideoTableRowCallbacks {
  videos: Video[];
  myCategories: MyCategory[];
  tags: Tag[];
  selectedIds: Set<string>;
  onToggleAll: () => void;
  // Состояние раскладки таблицы (порядок групп, сворачивание, freeze, ширины).
  layoutState: TableLayoutState;
  rendered: RenderedColumn[];
  onToggleGroupCollapsed: (g: ColumnGroup) => void;
  onMoveGroup: (from: ColumnGroup, to: ColumnGroup) => void;
  onResizeColumn: (key: string, width: number) => void;
  onSetFrozenCount: (count: number) => void;
}

function deriveSelectionState(
  videos: Video[],
  selectedIds: Set<string>,
): "none" | "all" | "some" {
  if (videos.length === 0 || selectedIds.size === 0) return "none";
  let selectedHere = 0;
  for (const v of videos) if (selectedIds.has(v.id)) selectedHere += 1;
  if (selectedHere === 0) return "none";
  if (selectedHere === videos.length) return "all";
  return "some";
}

export default function VideoTable({
  videos,
  myCategories,
  tags,
  selectedIds,
  onToggleAll,
  layoutState,
  rendered,
  onToggleGroupCollapsed,
  onMoveGroup,
  onResizeColumn,
  onSetFrozenCount,
  ...callbacks
}: VideoTableProps) {
  const selectionState = deriveSelectionState(videos, selectedIds);

  // Накопительные offsets: индекс 0 = чекбокс (always 0),
  // индекс i+1 = sum(чекбокс + rendered[0..i].width).
  const widths = useMemo(
    () => [CHECKBOX_COLUMN_WIDTH, ...rendered.map((r) => r.width)],
    [rendered],
  );
  const cumulativeOffsets = useMemo(() => getCumulativeOffsets(widths), [widths]);

  const lastFrozenIdx = useMemo(() => {
    let last = -1;
    for (let j = 0; j < rendered.length; j++) {
      if (isFrozenAt(rendered, j, layoutState.frozenCount)) last = j;
    }
    return last;
  }, [rendered, layoutState.frozenCount]);

  const frozenWidth = useMemo(
    () =>
      getFrozenTotalWidth(rendered, layoutState.frozenCount, CHECKBOX_COLUMN_WIDTH),
    [rendered, layoutState.frozenCount],
  );

  return (
    <div className="relative flex h-full w-full max-w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="w-full flex-1 overflow-auto overscroll-contain">
        <table
          className="border-separate text-sm"
          style={{ borderSpacing: 0, width: "max-content", minWidth: "100%" }}
        >
          <VideoTableHeader
            rendered={rendered}
            cumulativeOffsets={cumulativeOffsets}
            frozenCount={layoutState.frozenCount}
            selectionState={selectionState}
            onToggleAll={onToggleAll}
            onToggleGroupCollapsed={onToggleGroupCollapsed}
            onMoveGroup={onMoveGroup}
            onResizeColumn={onResizeColumn}
          />
          <tbody>
            {videos.map((video) => (
              <VideoTableRow
                key={video.id}
                video={video}
                myCategories={myCategories}
                tags={tags}
                selected={selectedIds.has(video.id)}
                rendered={rendered}
                cumulativeOffsets={cumulativeOffsets}
                frozenCount={layoutState.frozenCount}
                lastFrozenIdx={lastFrozenIdx}
                {...callbacks}
              />
            ))}
          </tbody>
        </table>
      </div>
      {/* Freeze-перегородка живёт в относительном внешнем контейнере, чтобы при
          горизонтальном скролле оставаться на границе закреплённой зоны. */}
      <FreezeDivider
        leftPx={frozenWidth}
        rendered={rendered}
        checkboxWidth={CHECKBOX_COLUMN_WIDTH}
        frozenCount={layoutState.frozenCount}
        onChange={onSetFrozenCount}
      />
    </div>
  );
}
