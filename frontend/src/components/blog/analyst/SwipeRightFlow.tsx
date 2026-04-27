"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Plus, Sparkles } from "lucide-react";
import clsx from "clsx";
import type { MyCategory, Rating, Tag, Video } from "@/lib/types";
import { ENTITY_COLORS } from "@/lib/tagColors";
import { formatAiCategory } from "@/lib/aiCategories";
import { RATINGS, RATING_ORDER } from "@/lib/rating";
import EntityChip from "./EntityChip";
import type { SwipeRightPayload } from "@/lib/manualFieldsService";

interface SwipeRightFlowProps {
  video: Video;
  myCategories: MyCategory[];
  tags: Tag[];
  onCreateMyCategory: (name: string) => Promise<MyCategory>;
  onCreateTag: (name: string) => Promise<Tag>;
  // Сохраняет всё, что заполнил пользователь, и переходит к следующей карточке.
  onSubmit: (videoId: string, payload: SwipeRightPayload) => Promise<void>;
  // Закрытие без сохранения (карточка остаётся, не листаем).
  onCancel: () => void;
}

type Step = 1 | 2 | 3;

// Воронка после свайпа вправо: категория → заметка+теги → оценка. Все шаги
// можно пропустить, сохраняется только то, что пользователь успел заполнить.
// Свайп вправо = одобрение, поэтому оценка по умолчанию — verified.
export default function SwipeRightFlow({
  video,
  myCategories,
  tags,
  onCreateMyCategory,
  onCreateTag,
  onSubmit,
  onCancel,
}: SwipeRightFlowProps) {
  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);

  // Накопленное состояние воронки. undefined = пользователь шаг не трогал.
  const [myCategoryId, setMyCategoryId] = useState<string | null | undefined>(
    undefined,
  );
  const [note, setNote] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  // Свайп вправо = «одобрено», поэтому verified включён по умолчанию. Можно
  // докинуть ещё 🔥/🔄 — multi-select.
  const [ratings, setRatings] = useState<Rating[]>(["verified"]);

  // Esc на любом шаге = закрыть воронку.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  async function commit(extraOverrides?: Partial<SwipeRightPayload>) {
    if (busy) return;
    setBusy(true);
    const payload: SwipeRightPayload = {};
    if (myCategoryId !== undefined) payload.myCategoryId = myCategoryId;
    const trimmed = note.trim();
    if (trimmed.length > 0) payload.note = trimmed;
    if (tagIds.length > 0) payload.tagIdsToAttach = tagIds;
    payload.ratings = ratings;
    Object.assign(payload, extraOverrides ?? {});
    try {
      await onSubmit(video.id, payload);
    } catch (e) {
      setBusy(false);
      alert((e as Error).message);
    }
    // Если успех — родитель размонтирует компонент. busy не сбрасываем.
  }

  return (
    <div
      className="absolute inset-0 z-[110] flex items-stretch justify-center bg-ink/70 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex w-full max-w-md flex-col gap-4 self-end overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-pop sm:self-auto">
        <Header step={step} onCancel={onCancel} busy={busy} />

        {step === 1 && (
          <CategoryStep
            video={video}
            categories={myCategories}
            selectedId={myCategoryId === undefined ? null : myCategoryId}
            onPick={(id) => {
              setMyCategoryId(id);
              setStep(2);
            }}
            onCreate={onCreateMyCategory}
            onSkip={() => setStep(2)}
          />
        )}

        {step === 2 && (
          <NoteTagsStep
            note={note}
            onNoteChange={setNote}
            tags={tags}
            selectedTagIds={tagIds}
            onToggleTag={(id) =>
              setTagIds((prev) =>
                prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
              )
            }
            onCreateTag={async (name) => {
              const created = await onCreateTag(name);
              setTagIds((prev) =>
                prev.includes(created.id) ? prev : [...prev, created.id],
              );
            }}
            onNext={() => setStep(3)}
            onSkip={() => setStep(3)}
          />
        )}

        {step === 3 && (
          <RatingStep
            ratings={ratings}
            onToggle={(r) =>
              setRatings((prev) =>
                prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
              )
            }
            onSubmit={() => commit()}
            onSkip={() => commit({ ratings: ["verified"] })}
            busy={busy}
          />
        )}
      </div>
    </div>
  );
}

// ---------- Шапка ----------

function Header({
  step,
  onCancel,
  busy,
}: {
  step: Step;
  onCancel: () => void;
  busy: boolean;
}) {
  const titles: Record<Step, string> = {
    1: "Категория",
    2: "Заметка и теги",
    3: "Оценка",
  };
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Шаг {step} из 3
        </div>
        <h3 className="font-display text-lg leading-tight text-ink">
          {titles[step]}
        </h3>
      </div>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="focus-ring shrink-0 rounded-md px-2 py-1 text-xs text-ink-faint transition hover:bg-elevated hover:text-ink-muted disabled:opacity-50"
      >
        Закрыть
      </button>
    </div>
  );
}

// ---------- Шаг 1: Категория ----------

function CategoryStep({
  video,
  categories,
  selectedId,
  onPick,
  onCreate,
  onSkip,
}: {
  video: Video;
  categories: MyCategory[];
  selectedId: string | null;
  onPick: (id: string | null) => void;
  onCreate: (name: string) => Promise<MyCategory>;
  onSkip: () => void;
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);

  const aiHint = formatAiCategory(video.aiCategory, video.aiCategorySuggestion);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, query]);

  const trimmed = query.trim();
  const exactMatch = trimmed
    ? categories.find((c) => c.name.toLowerCase() === trimmed.toLowerCase())
    : null;
  const canCreate = Boolean(trimmed) && !exactMatch;

  async function handleCreate() {
    if (!canCreate || busy) return;
    setBusy(true);
    try {
      const created = await onCreate(trimmed);
      setQuery("");
      onPick(created.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {aiHint && (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-elevated px-3 py-2 text-xs text-ink-muted">
          <Sparkles size={14} className="shrink-0 text-accent" />
          <span className="min-w-0 truncate">
            AI считает: <span className="font-medium text-ink">{aiHint}</span>
          </span>
        </div>
      )}

      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (canCreate) handleCreate();
            else if (filtered.length === 1) onPick(filtered[0].id);
          }
        }}
        placeholder="Найти или создать…"
        className="focus-ring h-10 w-full rounded-lg border border-line bg-canvas px-3 text-sm text-ink placeholder:text-ink-faint"
      />

      <div className="-mx-1 flex max-h-56 flex-col overflow-y-auto px-1">
        {filtered.length === 0 && !canCreate && (
          <div className="px-2 py-3 text-xs text-ink-faint">
            Категорий пока нет — введи название и нажми Enter.
          </div>
        )}
        {filtered.map((c) => {
          const selected = c.id === selectedId;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onPick(c.id)}
              className="focus-ring flex items-center justify-between gap-2 rounded-md px-2 py-2 text-left transition hover:bg-elevated"
            >
              <EntityChip name={c.name} color={c.color} size="sm" />
              {selected && <Check size={16} className="shrink-0 text-accent" />}
            </button>
          );
        })}
        {canCreate && (
          <button
            type="button"
            onClick={handleCreate}
            disabled={busy}
            className="focus-ring mt-1 flex items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-ink-muted transition hover:bg-elevated hover:text-ink disabled:opacity-50"
          >
            <Plus size={14} />
            <span className="truncate">Создать категорию «{trimmed}»</span>
          </button>
        )}
      </div>

      <div className="flex items-center justify-end pt-1">
        <button
          type="button"
          onClick={onSkip}
          className="focus-ring rounded-md px-2 py-1 text-xs text-ink-faint transition hover:text-ink-muted"
        >
          Пропустить →
        </button>
      </div>
    </div>
  );
}

// ---------- Шаг 2: Заметка + теги ----------

function NoteTagsStep({
  note,
  onNoteChange,
  tags,
  selectedTagIds,
  onToggleTag,
  onCreateTag,
  onNext,
  onSkip,
}: {
  note: string;
  onNoteChange: (v: string) => void;
  tags: Tag[];
  selectedTagIds: string[];
  onToggleTag: (id: string) => void;
  onCreateTag: (name: string) => Promise<void>;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [tagQuery, setTagQuery] = useState("");
  const [busyCreate, setBusyCreate] = useState(false);
  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Автофокус на заметке — основной ввод шага.
  useEffect(() => {
    noteRef.current?.focus();
  }, []);

  const trimmed = tagQuery.trim();
  const exact = trimmed
    ? tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase())
    : null;
  const canCreate = Boolean(trimmed) && !exact;

  async function handleCreate() {
    if (!canCreate || busyCreate) return;
    setBusyCreate(true);
    try {
      await onCreateTag(trimmed);
      setTagQuery("");
    } finally {
      setBusyCreate(false);
    }
  }

  const filteredTags = useMemo(() => {
    const q = trimmed.toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, trimmed]);

  return (
    <div className="flex flex-col gap-3">
      <textarea
        ref={noteRef}
        value={note}
        onChange={(e) => onNoteChange(e.target.value)}
        onKeyDown={(e) => {
          // Ctrl/Cmd+Enter — быстрый next, чтобы не тянуться к мыши.
          if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
            e.preventDefault();
            onNext();
          }
        }}
        rows={3}
        placeholder="Что зацепило в этом видео?"
        className="focus-ring w-full resize-none rounded-lg border border-line bg-canvas px-3 py-2 text-sm leading-snug text-ink placeholder:text-ink-faint"
      />

      <div className="flex flex-col gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Теги
        </div>

        {tags.length === 0 && !trimmed && (
          <div className="text-xs text-ink-faint">
            Тегов ещё нет — создай первый.
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {filteredTags.map((t) => {
            const on = selectedTagIds.includes(t.id);
            const c = ENTITY_COLORS[t.color];
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onToggleTag(t.id)}
                className={clsx(
                  "focus-ring inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                  on
                    ? c.chip
                    : "border-line bg-canvas text-ink-muted hover:bg-elevated",
                )}
                aria-pressed={on}
              >
                {on && <Check size={12} className="shrink-0" />}
                <span className="truncate">{t.name}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-stretch gap-2">
          <input
            value={tagQuery}
            onChange={(e) => setTagQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (canCreate) handleCreate();
              }
            }}
            placeholder="Новый тег…"
            className="focus-ring h-9 flex-1 rounded-lg border border-line bg-canvas px-3 text-sm text-ink placeholder:text-ink-faint"
          />
          <button
            type="button"
            onClick={handleCreate}
            disabled={!canCreate || busyCreate}
            className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-canvas px-3 text-xs font-medium text-ink-muted transition hover:bg-elevated hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus size={14} />
            Создать
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onSkip}
          className="focus-ring rounded-md px-2 py-1 text-xs text-ink-faint transition hover:text-ink-muted"
        >
          Пропустить →
        </button>
        <button
          type="button"
          onClick={onNext}
          className="focus-ring inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 text-sm font-medium text-surface shadow-card transition hover:bg-accent-hover"
        >
          Далее
        </button>
      </div>
    </div>
  );
}

// ---------- Шаг 3: Оценка ----------

function RatingStep({
  ratings,
  onToggle,
  onSubmit,
  onSkip,
  busy,
}: {
  ratings: Rating[];
  onToggle: (r: Rating) => void;
  onSubmit: () => void;
  onSkip: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2">
        {RATING_ORDER.map((r) => {
          const meta = RATINGS[r];
          const on = ratings.includes(r);
          return (
            <button
              key={r}
              type="button"
              onClick={() => onToggle(r)}
              aria-pressed={on}
              className={clsx(
                "focus-ring flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 text-xs font-medium transition",
                on
                  ? "border-accent bg-accent-soft text-ink shadow-card"
                  : "border-line bg-canvas text-ink-muted hover:bg-elevated hover:text-ink",
              )}
            >
              <span className="text-2xl leading-none">{meta.emoji}</span>
              <span className="text-center leading-tight">{meta.label}</span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-ink-faint">
        Свайп вправо = одобрено: ✅ Верифицировано включено по умолчанию. Можно
        дополнительно выбрать 🔥 и/или 🔄 — сохранятся все отмеченные. Повторный
        клик снимает оценку.
      </p>

      <div className="flex items-center justify-between pt-1">
        <button
          type="button"
          onClick={onSkip}
          disabled={busy}
          className="focus-ring rounded-md px-2 py-1 text-xs text-ink-faint transition hover:text-ink-muted disabled:opacity-50"
        >
          Пропустить →
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy}
          className="focus-ring inline-flex h-10 items-center justify-center rounded-lg bg-accent px-5 text-sm font-medium text-surface shadow-card transition hover:bg-accent-hover disabled:opacity-50"
        >
          {busy ? "Сохраняю…" : "Готово"}
        </button>
      </div>
    </div>
  );
}
