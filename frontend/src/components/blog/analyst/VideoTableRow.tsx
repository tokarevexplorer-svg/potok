"use client";

import { type CSSProperties } from "react";
import { Trash2 } from "lucide-react";
import clsx from "clsx";
import type {
  AiStatus,
  MyCategory,
  ProcessingStatus,
  Rating,
  Tag,
  TranscriptStatus,
  Video,
} from "@/lib/types";
import { CHECKBOX_COLUMN_WIDTH } from "@/lib/videoTableColumns";
import { isFrozenAt, type RenderedColumn } from "@/lib/tableLayout";
import { formatAiCategory } from "@/lib/aiCategories";
import { ENTITY_COLORS } from "@/lib/tagColors";
import { getViralityLevel } from "@/lib/viralityLevel";
import {
  contentTypeEmoji,
  contentTypeLabels,
  formatDuration,
} from "@/lib/contentType";
import ExpandableText from "./ExpandableText";
import MyCategoryCell from "./MyCategoryCell";
import TagsCell from "./TagsCell";
import NoteCell from "./NoteCell";
import ThumbnailCell from "./ThumbnailCell";
import IsReferenceCell from "./IsReferenceCell";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});
const numberFormatter = new Intl.NumberFormat("ru-RU");

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return dateFormatter.format(new Date(iso));
  } catch {
    return "—";
  }
}
function formatNumber(n: number | null): string {
  return n === null || n === undefined ? "—" : numberFormatter.format(n);
}

function Placeholder({ children = "—" }: { children?: React.ReactNode }) {
  return <span className="text-ink-faint">{children}</span>;
}

function StatusHint({ status }: { status: ProcessingStatus }) {
  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-ink-faint">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        Обрабатывается…
      </span>
    );
  }
  if (status === "pending") return <span className="text-ink-faint">В очереди</span>;
  if (status === "error") return <span className="text-accent">Ошибка обработки</span>;
  return <Placeholder />;
}

function refCell(value: React.ReactNode | null, status: ProcessingStatus) {
  if (value) return value;
  if (status === "done") return <Placeholder />;
  return <StatusHint status={status} />;
}

function statCell(value: number | null, status: ProcessingStatus) {
  if (value !== null && value !== undefined) return formatNumber(value);
  if (status === "done") return "—";
  return <StatusHint status={status} />;
}

function renderSummaryCell(video: Video) {
  const status: AiStatus = video.aiStatus;
  if (video.aiSummary) {
    return (
      <ExpandableText
        title="Саммари"
        text={video.aiSummary}
        previewClassName="text-ink"
      />
    );
  }
  if (status === "skipped") return <Placeholder>Недостаточно данных</Placeholder>;
  if (status === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-ink-faint">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        Анализирую…
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="text-accent" title={video.aiError ?? undefined}>
        Ошибка анализа
      </span>
    );
  }
  return <Placeholder>Ждёт анализа</Placeholder>;
}

function renderCategoryCell(video: Video) {
  const label = formatAiCategory(video.aiCategory, video.aiCategorySuggestion);
  if (label) {
    return (
      <span className="inline-flex items-center rounded-full border border-line bg-elevated px-2.5 py-1 text-xs font-medium text-ink">
        {label}
      </span>
    );
  }
  if (video.aiStatus === "processing") return <span className="text-ink-faint">…</span>;
  return <Placeholder>—</Placeholder>;
}

function renderTranscriptCell(video: Video) {
  const tStatus: TranscriptStatus = video.transcriptStatus;
  if (video.transcript) {
    return (
      <ExpandableText
        title="Транскрипция"
        text={video.transcript}
        previewClassName="text-ink-muted"
      />
    );
  }
  if (tStatus === "no_speech") return <Placeholder>Без речи (музыка/визуал)</Placeholder>;
  if (tStatus === "processing") {
    return (
      <span className="inline-flex items-center gap-1.5 text-ink-faint">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        Расшифровывается…
      </span>
    );
  }
  if (tStatus === "error") {
    return (
      <span className="text-accent" title={video.transcriptError ?? undefined}>
        Ошибка расшифровки
      </span>
    );
  }
  return <Placeholder>Ждёт расшифровки</Placeholder>;
}

export interface VideoTableRowCallbacks {
  onSelectMyCategory: (videoId: string, categoryId: string | null) => Promise<void>;
  onCreateMyCategory: (name: string) => Promise<MyCategory>;
  onAttachTag: (videoId: string, tagId: string) => Promise<void>;
  onDetachTag: (videoId: string, tagId: string) => Promise<void>;
  onCreateTag: (name: string) => Promise<Tag>;
  onSaveNote: (videoId: string, value: string | null) => Promise<void>;
  onUpdateRatings: (videoId: string, ratings: Rating[]) => Promise<void>;
  onUpdateIsReference: (videoId: string, value: boolean | null) => Promise<void>;
  onManageMyCategories: () => void;
  onManageTags: () => void;
  onToggleSelected: (videoId: string) => void;
  onRequestDelete: (videoId: string) => void;
}

interface VideoTableRowProps extends VideoTableRowCallbacks {
  video: Video;
  myCategories: MyCategory[];
  tags: Tag[];
  selected: boolean;
  rendered: RenderedColumn[];
  cumulativeOffsets: number[];
  frozenCount: number;
  lastFrozenIdx: number;
}

export default function VideoTableRow({
  video,
  myCategories,
  tags,
  selected,
  rendered,
  cumulativeOffsets,
  frozenCount,
  lastFrozenIdx,
  onSelectMyCategory,
  onCreateMyCategory,
  onAttachTag,
  onDetachTag,
  onCreateTag,
  onSaveNote,
  onUpdateRatings,
  onUpdateIsReference,
  onManageMyCategories,
  onManageTags,
  onToggleSelected,
  onRequestDelete,
}: VideoTableRowProps) {
  const status = video.processingStatus;
  const title =
    status === "error" && video.processingError
      ? `Ошибка: ${video.processingError}`
      : undefined;

  // Цвет фона для sticky-ячеек: должен «закрашивать» содержимое, проезжающее
  // под ними при горизонтальном скролле. surface — белый (как у таблицы),
  // accent-soft — для выделенных строк. Hover-эффект под sticky не работает —
  // у sticky-ячеек собственный фон.
  const stickyBg = selected ? "#FFEDE4" : "#FFFFFF";

  function renderCell(key: string) {
    switch (key) {
      case "thumbnail":
        return (
          <ThumbnailCell
            url={video.thumbnailUrl}
            videoId={video.id}
            ratings={video.ratings}
            onUpdateRatings={onUpdateRatings}
          />
        );
      case "publishedAt":
        return refCell(
          video.publishedAt ? (
            <a
              href={video.url}
              target="_blank"
              rel="noreferrer"
              className="focus-ring rounded text-ink underline-offset-4 hover:underline"
              title="Открыть видео в Instagram"
            >
              {formatDate(video.publishedAt)}
            </a>
          ) : null,
          status,
        );
      case "duration": {
        if (video.contentType !== "video") {
          return (
            <span
              className="inline-flex items-center gap-1.5 text-ink-muted"
              title={contentTypeLabels[video.contentType]}
            >
              <span aria-hidden>{contentTypeEmoji[video.contentType]}</span>
              {contentTypeLabels[video.contentType]}
            </span>
          );
        }
        const formatted = formatDuration(video.duration);
        if (formatted) return <span className="tabular-nums text-ink">{formatted}</span>;
        if (status === "done") return <Placeholder />;
        return <StatusHint status={status} />;
      }
      case "author":
        if (video.author) {
          return video.authorUrl ? (
            <a
              href={video.authorUrl}
              target="_blank"
              rel="noreferrer"
              className="text-ink hover:text-accent"
            >
              {video.author}
            </a>
          ) : (
            video.author
          );
        }
        return refCell(null, status);
      case "caption":
        return video.caption ? (
          <ExpandableText
            title="Описание под видео"
            text={video.caption}
            previewClassName="text-ink-muted"
          />
        ) : (
          refCell(null, status)
        );
      case "views":
        return statCell(video.views, status);
      case "likes":
        return statCell(video.likes, status);
      case "comments":
        return statCell(video.comments, status);
      case "virality":
        if (video.viralityScore !== null && video.viralityScore !== undefined) {
          return video.viralityScore.toFixed(2);
        }
        if (status === "done") return "—";
        return <StatusHint status={status} />;
      case "viralityLevel": {
        const level = getViralityLevel(video.viralityScore);
        if (!level) {
          if (status === "done") return <Placeholder />;
          return <StatusHint status={status} />;
        }
        return (
          <span
            className={clsx(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
              ENTITY_COLORS[level.color].chip,
            )}
          >
            {level.label}
          </span>
        );
      }
      case "aiSummary":
        return renderSummaryCell(video);
      case "transcript":
        return renderTranscriptCell(video);
      case "aiCategory":
        return renderCategoryCell(video);
      case "isReference":
        return (
          <IsReferenceCell
            videoId={video.id}
            value={video.isReference}
            aiStatus={video.aiStatus}
            onChange={onUpdateIsReference}
          />
        );
      case "myCategory":
        return (
          <MyCategoryCell
            videoId={video.id}
            selectedId={video.myCategoryId}
            categories={myCategories}
            onSelect={onSelectMyCategory}
            onCreate={onCreateMyCategory}
            onManage={onManageMyCategories}
          />
        );
      case "tags":
        return (
          <TagsCell
            videoId={video.id}
            selectedIds={video.tagIds}
            tags={tags}
            onAttach={onAttachTag}
            onDetach={onDetachTag}
            onCreate={onCreateTag}
            onManage={onManageTags}
          />
        );
      case "note":
        return (
          <NoteCell
            videoId={video.id}
            initialValue={video.note}
            onSave={onSaveNote}
          />
        );
      default:
        return <Placeholder />;
    }
  }

  return (
    <tr
      className={clsx(
        "group border-b border-line/70 transition-colors",
        selected ? "bg-accent-soft/40" : "hover:bg-elevated/60",
      )}
      title={title}
    >
      <td
        className="px-3 py-4 align-top"
        style={{
          position: "sticky",
          left: 0,
          zIndex: 5,
          width: CHECKBOX_COLUMN_WIDTH,
          minWidth: CHECKBOX_COLUMN_WIDTH,
          background: stickyBg,
        }}
      >
        <div className="flex items-center justify-center">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelected(video.id)}
            aria-label="Выбрать видео"
            className="h-4 w-4 cursor-pointer accent-accent"
          />
        </div>
        <button
          type="button"
          onClick={() => onRequestDelete(video.id)}
          className="focus-ring mt-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint opacity-0 transition hover:bg-accent-soft hover:text-accent group-hover:opacity-100 focus:opacity-100"
          aria-label="Удалить видео"
          title="Удалить"
        >
          <Trash2 size={14} />
        </button>
      </td>
      {rendered.map((it, idx) => {
        if (it.kind === "collapsed") {
          // Свёрнутая группа: пустая узкая ячейка. Если попадает в frozen-зону —
          // тоже sticky, чтобы не «провалилась» через границу.
          const sticky = isFrozenAt(rendered, idx, frozenCount);
          const isLastFrozen = idx === lastFrozenIdx;
          const style: CSSProperties = {
            width: it.width,
            minWidth: it.width,
            maxWidth: it.width,
            ...(sticky
              ? {
                  position: "sticky",
                  left: cumulativeOffsets[idx + 1],
                  zIndex: 4,
                  background: stickyBg,
                  boxShadow: isLastFrozen
                    ? "2px 0 4px rgba(15,16,17,0.06)"
                    : undefined,
                }
              : {}),
          };
          return (
            <td
              key={`row-collapsed-${idx}`}
              style={style}
              className="border-r border-line/40"
              aria-hidden
            />
          );
        }
        const sticky = isFrozenAt(rendered, idx, frozenCount);
        const isLastFrozen = idx === lastFrozenIdx;
        const style: CSSProperties = {
          width: it.width,
          minWidth: it.width,
          // maxWidth обязателен: без него длинный текст растягивает колонку
          // мимо заданной ширины и ломает line-clamp/truncate.
          maxWidth: it.width,
          ...(sticky
            ? {
                position: "sticky",
                left: cumulativeOffsets[idx + 1],
                zIndex: 4,
                background: stickyBg,
                boxShadow: isLastFrozen
                  ? "2px 0 4px rgba(15,16,17,0.06)"
                  : undefined,
              }
            : {}),
        };
        return (
          <td
            key={it.column.key}
            style={style}
            className={clsx(
              "px-4 py-4 align-top text-sm",
              it.column.align === "right" ? "text-right tabular-nums" : "",
              it.column.isText ? "overflow-hidden" : "",
            )}
          >
            {renderCell(it.column.key)}
          </td>
        );
      })}
    </tr>
  );
}
