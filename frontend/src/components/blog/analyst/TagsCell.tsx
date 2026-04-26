"use client";

import { useRef, useState } from "react";
import { Plus } from "lucide-react";
import EntityChip from "./EntityChip";
import EntitySelectPopover, {
  type ColoredEntity,
} from "./EntitySelectPopover";
import type { Tag } from "@/lib/types";

interface TagsCellProps {
  videoId: string;
  selectedIds: string[];
  tags: Tag[];
  onAttach: (videoId: string, tagId: string) => Promise<void>;
  onDetach: (videoId: string, tagId: string) => Promise<void>;
  onCreate: (name: string) => Promise<Tag>;
  onManage: () => void;
}

export default function TagsCell({
  videoId,
  selectedIds,
  tags,
  onAttach,
  onDetach,
  onCreate,
  onManage,
}: TagsCellProps) {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const selectedTags = selectedIds
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is Tag => Boolean(t));

  async function handleToggle(entity: ColoredEntity) {
    if (selectedIds.includes(entity.id)) {
      await onDetach(videoId, entity.id);
    } else {
      await onAttach(videoId, entity.id);
    }
    // Поповер не закрываем — даём накидать сразу несколько тегов.
  }

  async function handleCreate(name: string) {
    const created = await onCreate(name);
    await onAttach(videoId, created.id);
  }

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="focus-ring -mx-1 flex w-full max-w-full flex-wrap items-center gap-1 rounded-md px-1 py-0.5 text-left transition hover:bg-elevated"
        title="Теги"
      >
        {selectedTags.length === 0 ? (
          <span className="inline-flex items-center gap-1 text-sm text-ink-faint">
            <Plus size={14} />
            Добавить
          </span>
        ) : (
          selectedTags.map((t) => (
            <EntityChip key={t.id} name={t.name} color={t.color} size="sm" />
          ))
        )}
      </button>

      <EntitySelectPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        entities={tags}
        selectedIds={selectedIds}
        onToggle={handleToggle}
        onCreate={handleCreate}
        onManage={onManage}
        createLabel="Создать тег"
        emptyHint="Тегов пока нет — введи название и нажми Enter."
      />
    </>
  );
}
