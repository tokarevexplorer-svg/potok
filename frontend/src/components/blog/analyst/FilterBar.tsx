"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowDownNarrowWide, ArrowUpWideNarrow, Filter, Search, X } from "lucide-react";
import clsx from "clsx";
import { aiCategoryLabels } from "@/lib/aiCategories";
import {
  initialFilterState,
  type ContentTypeFilter,
  type FilterState,
  type IsReferenceFilter,
  type RatingFilter,
  type SortKey,
  type TranscriptFilter,
} from "@/lib/videoFilters";
import { RATING_ORDER, RATINGS } from "@/lib/rating";
import { contentTypeLabels } from "@/lib/contentType";
import type { AiCategory, ContentType, MyCategory, Tag } from "@/lib/types";
import EntityChip from "./EntityChip";
import EntitySelectPopover, {
  type ColoredEntity,
} from "./EntitySelectPopover";

interface FilterBarProps {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  authors: string[];
  myCategories: MyCategory[];
  tags: Tag[];
  totalCount: number;
  filteredCount: number;
}

const sortLabels: Record<SortKey, string> = {
  createdAt: "Дате добавления",
  publishedAt: "Дате публикации",
  views: "Просмотрам",
  likes: "Лайкам",
  virality: "Вирусности",
};

const transcriptLabels: Record<TranscriptFilter, string> = {
  any: "Любая",
  with: "С транскрипцией",
  without: "Без транскрипции",
};

const isReferenceLabels: Record<IsReferenceFilter, string> = {
  any: "Все",
  true: "✅ Для блога",
  false: "❌ Другое",
  unset: "Не определено",
};

// Список значений для селекта «Тип» — порядок имеет значение для UX.
const contentTypeOrder: ContentTypeFilter[] = ["any", "video", "image", "carousel"];

export default function FilterBar({
  filters,
  onChange,
  authors,
  myCategories,
  tags,
  totalCount,
  filteredCount,
}: FilterBarProps) {
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const tagBtnRef = useRef<HTMLButtonElement>(null);

  function update<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    onChange({ ...filters, [key]: value });
  }

  function reset() {
    onChange({ ...initialFilterState });
  }

  const isDirty = useMemo(
    () =>
      filters.search !== "" ||
      filters.aiCategory !== "any" ||
      filters.myCategoryId !== "any" ||
      filters.tagIds.length > 0 ||
      filters.author !== "any" ||
      filters.transcript !== "any" ||
      filters.rating !== "any" ||
      filters.contentType !== "any" ||
      filters.isReference !== "any" ||
      filters.sortBy !== initialFilterState.sortBy ||
      filters.sortAsc !== initialFilterState.sortAsc,
    [filters],
  );

  const selectedTagsLabel =
    filters.tagIds.length === 0
      ? "Любые"
      : filters.tagIds.length === 1
        ? tags.find((t) => t.id === filters.tagIds[0])?.name ?? "1 тег"
        : `${filters.tagIds.length} тегов`;

  function toggleTagFilter(entity: ColoredEntity) {
    const has = filters.tagIds.includes(entity.id);
    update(
      "tagIds",
      has
        ? filters.tagIds.filter((id) => id !== entity.id)
        : [...filters.tagIds, entity.id],
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"
          />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => update("search", e.target.value)}
            placeholder="Поиск по транскрипции, саммари, описанию, заметкам…"
            className="focus-ring h-10 w-full rounded-xl border border-line bg-canvas pl-9 pr-3 text-sm text-ink placeholder:text-ink-faint"
          />
        </div>

        {isDirty && (
          <button
            type="button"
            onClick={reset}
            className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm text-ink-muted transition hover:border-line-strong hover:text-ink"
          >
            <X size={14} />
            Сбросить
          </button>
        )}

        <span className="ml-auto text-xs text-ink-faint">
          {filteredCount === totalCount
            ? `${totalCount} видео`
            : `${filteredCount} из ${totalCount}`}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <FilterChip icon={<Filter size={14} />} label="Категория AI">
          <select
            value={filters.aiCategory}
            onChange={(e) => update("aiCategory", e.target.value as AiCategory | "any")}
            className="bg-transparent text-sm text-ink outline-none"
          >
            <option value="any">Любая</option>
            {(Object.keys(aiCategoryLabels) as AiCategory[]).map((k) => (
              <option key={k} value={k}>
                {aiCategoryLabels[k]}
              </option>
            ))}
          </select>
        </FilterChip>

        <FilterChip label="Категория Я">
          <select
            value={filters.myCategoryId}
            onChange={(e) => update("myCategoryId", e.target.value)}
            className="bg-transparent text-sm text-ink outline-none"
          >
            <option value="any">Любая</option>
            {myCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </FilterChip>

        <button
          ref={tagBtnRef}
          type="button"
          onClick={() => setTagPickerOpen((v) => !v)}
          className="focus-ring inline-flex h-9 items-center gap-2 rounded-full border border-line bg-canvas px-3 text-sm text-ink-muted transition hover:border-line-strong hover:text-ink"
        >
          <span className="text-ink-faint">Теги:</span>
          <span className="text-ink">{selectedTagsLabel}</span>
        </button>

        <FilterChip label="Автор">
          <select
            value={filters.author}
            onChange={(e) => update("author", e.target.value)}
            className="max-w-[180px] truncate bg-transparent text-sm text-ink outline-none"
          >
            <option value="any">Любой</option>
            {authors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </FilterChip>

        <FilterChip label="Транскрипция">
          <select
            value={filters.transcript}
            onChange={(e) => update("transcript", e.target.value as TranscriptFilter)}
            className="bg-transparent text-sm text-ink outline-none"
          >
            {(Object.keys(transcriptLabels) as TranscriptFilter[]).map((k) => (
              <option key={k} value={k}>
                {transcriptLabels[k]}
              </option>
            ))}
          </select>
        </FilterChip>

        <FilterChip label="Оценка">
          <select
            value={filters.rating}
            onChange={(e) => update("rating", e.target.value as RatingFilter)}
            className="bg-transparent text-sm text-ink outline-none"
          >
            <option value="any">Любая</option>
            <option value="none">Не оценено</option>
            {RATING_ORDER.map((r) => (
              <option key={r} value={r}>
                {RATINGS[r].emoji} {RATINGS[r].label}
              </option>
            ))}
          </select>
        </FilterChip>

        <FilterChip label="Тип">
          <select
            value={filters.contentType}
            onChange={(e) =>
              update("contentType", e.target.value as ContentTypeFilter)
            }
            className="bg-transparent text-sm text-ink outline-none"
          >
            {contentTypeOrder.map((k) => (
              <option key={k} value={k}>
                {k === "any" ? "Все" : contentTypeLabels[k as ContentType]}
              </option>
            ))}
          </select>
        </FilterChip>

        <FilterChip label="Референс">
          <select
            value={filters.isReference}
            onChange={(e) =>
              update("isReference", e.target.value as IsReferenceFilter)
            }
            className="bg-transparent text-sm text-ink outline-none"
          >
            {(Object.keys(isReferenceLabels) as IsReferenceFilter[]).map((k) => (
              <option key={k} value={k}>
                {isReferenceLabels[k]}
              </option>
            ))}
          </select>
        </FilterChip>

        <div className="ml-auto flex items-center gap-2">
          <FilterChip label="Сортировка">
            <select
              value={filters.sortBy}
              onChange={(e) => update("sortBy", e.target.value as SortKey)}
              className="bg-transparent text-sm text-ink outline-none"
            >
              {(Object.keys(sortLabels) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  По {sortLabels[k].toLowerCase()}
                </option>
              ))}
            </select>
          </FilterChip>
          <button
            type="button"
            onClick={() => update("sortAsc", !filters.sortAsc)}
            className="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-full border border-line bg-canvas text-ink-muted transition hover:border-line-strong hover:text-ink"
            title={filters.sortAsc ? "По возрастанию" : "По убыванию"}
          >
            {filters.sortAsc ? (
              <ArrowUpWideNarrow size={16} />
            ) : (
              <ArrowDownNarrowWide size={16} />
            )}
          </button>
        </div>
      </div>

      {filters.tagIds.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {filters.tagIds.map((id) => {
            const t = tags.find((x) => x.id === id);
            if (!t) return null;
            return (
              <button
                key={id}
                type="button"
                onClick={() =>
                  update(
                    "tagIds",
                    filters.tagIds.filter((x) => x !== id),
                  )
                }
                className="group focus-ring inline-flex items-center gap-1"
                title="Убрать из фильтра"
              >
                <EntityChip name={t.name} color={t.color} size="sm" />
                <X
                  size={12}
                  className="text-ink-faint transition group-hover:text-accent"
                />
              </button>
            );
          })}
        </div>
      )}

      <EntitySelectPopover
        open={tagPickerOpen}
        onClose={() => setTagPickerOpen(false)}
        anchorRef={tagBtnRef}
        entities={tags}
        selectedIds={filters.tagIds}
        onToggle={toggleTagFilter}
        // В фильтре создавать теги не разрешаем — это смущает контекст.
        onCreate={() => {
          /* noop */
        }}
        emptyHint="Создай теги, помечая видео в таблице."
        createLabel=""
      />
    </div>
  );
}

function FilterChip({
  label,
  icon,
  children,
  className,
}: {
  label: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={clsx(
        "inline-flex h-9 items-center gap-2 rounded-full border border-line bg-canvas px-3 text-sm transition hover:border-line-strong",
        className,
      )}
    >
      {icon}
      <span className="text-ink-faint">{label}:</span>
      {children}
    </label>
  );
}
