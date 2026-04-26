"use client";

import type { MyCategory, Tag, Video } from "@/lib/types";
import VideoTableHeader from "./VideoTableHeader";
import VideoTableRow, { type VideoTableRowCallbacks } from "./VideoTableRow";

interface VideoTableProps extends VideoTableRowCallbacks {
  videos: Video[];
  myCategories: MyCategory[];
  tags: Tag[];
  selectedIds: Set<string>;
  onToggleAll: () => void;
}

// Состояние «галочки в шапке» зависит от того, сколько строк выбрано
// относительно отфильтрованного списка.
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
  ...callbacks
}: VideoTableProps) {
  const selectionState = deriveSelectionState(videos, selectedIds);

  return (
    <div className="flex h-full w-full max-w-full flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div className="w-full flex-1 overflow-auto overscroll-contain">
        <table className="w-full border-collapse text-sm">
          <VideoTableHeader
            selectionState={selectionState}
            onToggleAll={onToggleAll}
          />
          <tbody>
            {videos.map((video) => (
              <VideoTableRow
                key={video.id}
                video={video}
                myCategories={myCategories}
                tags={tags}
                selected={selectedIds.has(video.id)}
                {...callbacks}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
