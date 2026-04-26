"use client";

import { useRef, useState } from "react";
import EntityChip from "./EntityChip";
import EntitySelectPopover, {
  type ColoredEntity,
} from "./EntitySelectPopover";
import type { MyCategory } from "@/lib/types";

interface MyCategoryCellProps {
  videoId: string;
  selectedId: string | null;
  categories: MyCategory[];
  onSelect: (videoId: string, categoryId: string | null) => Promise<void>;
  onCreate: (name: string) => Promise<MyCategory>;
  onManage: () => void;
}

export default function MyCategoryCell({
  videoId,
  selectedId,
  categories,
  onSelect,
  onCreate,
  onManage,
}: MyCategoryCellProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const selected = categories.find((c) => c.id === selectedId) ?? null;

  async function handleToggle(entity: ColoredEntity) {
    // Single-select: повторный клик по выбранной — снимает её.
    const next = entity.id === selectedId ? null : entity.id;
    setOpen(false);
    await onSelect(videoId, next);
  }

  async function handleCreate(name: string) {
    const created = await onCreate(name);
    setOpen(false);
    await onSelect(videoId, created.id);
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="focus-ring -mx-1 inline-flex max-w-full items-center rounded-md px-1 py-0.5 transition hover:bg-elevated"
        title="Категория Я"
      >
        {selected ? (
          <EntityChip name={selected.name} color={selected.color} />
        ) : (
          <span className="text-sm text-ink-faint">Выбрать…</span>
        )}
      </button>

      <EntitySelectPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        entities={categories}
        selectedIds={selected ? [selected.id] : []}
        onToggle={handleToggle}
        onCreate={handleCreate}
        onManage={onManage}
        createLabel="Создать категорию"
        emptyHint="Категорий пока нет — введи название и нажми Enter."
      />
    </>
  );
}
