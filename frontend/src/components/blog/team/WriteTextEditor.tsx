"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Eye,
  Loader2,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import VoiceInput from "./VoiceInput";
import ModelSelector from "./ModelSelector";
import {
  applyAiEdit,
  fetchTaskVersions,
  fetchVersionContent,
  saveDirectEdit,
  type AiEdit,
  type TaskVersion,
} from "@/lib/team/teamBackendClient";
import type { TeamTaskModelChoice } from "@/lib/team/types";

// Режимы редактора:
//   read   — markdown-рендер выбранной версии (по умолчанию)
//   direct — textarea с содержимым; «Сохранить» создаёт vN+1 без LLM
//   ai     — выделение фрагментов, добавление инструкций, «Применить» — LLM
//            создаёт vN+1, биллится против исходной задачи
type Mode = "read" | "direct" | "ai";

interface WriteTextEditorProps {
  taskId: string;
  // Изначальный контент — берём из task.result (то, что было записано
  // последним handler'ом). После загрузки версий — синкаемся с выбранной.
  initialContent: string;
  // Когда применили правку или прямую правку — caller обновляет state
  // (например, чтобы подменить task.result на новое содержимое и triggerть
  // обновление шапки модалки).
  onVersionCreated?: (info: { content: string; version: number; path: string }) => void;
}

interface PendingEdit extends AiEdit {
  id: string;
}

const DEFAULT_MODEL: TeamTaskModelChoice = { preset: "balanced" };

export default function WriteTextEditor({
  taskId,
  initialContent,
  onVersionCreated,
}: WriteTextEditorProps) {
  const [mode, setMode] = useState<Mode>("read");
  const [versions, setVersions] = useState<TaskVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState<string | null>(null);
  // path → content. initialContent кешируем под путь самой свежей версии,
  // если он есть; иначе под ключом `__initial`.
  const [contentCache, setContentCache] = useState<Record<string, string>>({});
  const [activePath, setActivePath] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [savingDirect, setSavingDirect] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // AI-режим
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [editPopupAt, setEditPopupAt] = useState<{
    fragment: string;
    x: number;
    y: number;
  } | null>(null);
  const [editInstruction, setEditInstruction] = useState("");
  const [generalInstruction, setGeneralInstruction] = useState("");
  const [aiModel, setAiModel] = useState<TeamTaskModelChoice>(DEFAULT_MODEL);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const readPaneRef = useRef<HTMLDivElement>(null);

  // Активный контент: для самой свежей версии может быть в initialContent;
  // для остальных — лезем в cache → fetchVersionContent.
  const activeContent = useMemo(() => {
    if (activePath && contentCache[activePath] !== undefined) {
      return contentCache[activePath];
    }
    return initialContent;
  }, [activePath, contentCache, initialContent]);

  const loadVersions = useCallback(async () => {
    setVersionsLoading(true);
    setVersionsError(null);
    try {
      const list = await fetchTaskVersions(taskId);
      setVersions(list);
      if (list.length > 0 && !activePath) {
        // Самая свежая версия (наибольший N) — у неё контент уже есть в task.result.
        const latest = list[0];
        setActivePath(latest.path);
        setContentCache((prev) => ({ ...prev, [latest.path]: initialContent }));
      }
    } catch (err) {
      setVersionsError(err instanceof Error ? err.message : String(err));
    } finally {
      setVersionsLoading(false);
    }
  }, [taskId, activePath, initialContent]);

  useEffect(() => {
    void loadVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  // При входе в direct-режим заполняем textarea текущим контентом.
  useEffect(() => {
    if (mode === "direct") {
      setDraft(activeContent);
      setSaveError(null);
    }
    if (mode === "ai") {
      setAiError(null);
    }
    if (mode !== "ai") {
      setPendingEdits([]);
      setGeneralInstruction("");
      setEditPopupAt(null);
    }
  }, [mode, activeContent]);

  async function handleSelectVersion(path: string) {
    if (path === activePath) return;
    setActivePath(path);
    if (contentCache[path] !== undefined) return;
    try {
      const content = await fetchVersionContent(taskId, path);
      setContentCache((prev) => ({ ...prev, [path]: content }));
    } catch (err) {
      setVersionsError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleSaveDirect() {
    if (!draft.trim()) {
      setSaveError("Текст не может быть пустым");
      return;
    }
    if (draft === activeContent) {
      setSaveError("Изменений нет");
      return;
    }
    setSavingDirect(true);
    setSaveError(null);
    try {
      const result = await saveDirectEdit(taskId, draft);
      onVersionCreated?.({ content: draft, version: result.version, path: result.path });
      // Обновляем список версий и переключаемся на новую.
      await loadVersions();
      setActivePath(result.path);
      setContentCache((prev) => ({ ...prev, [result.path]: draft }));
      setMode("read");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSavingDirect(false);
    }
  }

  // --- AI mode ---

  function handleSelectionInRead() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setEditPopupAt(null);
      return;
    }
    const text = sel.toString().trim();
    if (!text || text.length < 4) return;
    // Координаты выделения для попапа.
    const range = sel.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = readPaneRef.current?.getBoundingClientRect();
    if (!containerRect) return;
    setEditPopupAt({
      fragment: text,
      x: rect.left + rect.width / 2 - containerRect.left,
      y: rect.bottom - containerRect.top + 6,
    });
    setEditInstruction("");
  }

  function commitEdit() {
    if (!editPopupAt) return;
    const instruction = editInstruction.trim();
    if (!instruction) return;
    const pending: PendingEdit = {
      id: `edit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      fragment: editPopupAt.fragment,
      instruction,
    };
    setPendingEdits((prev) => [...prev, pending]);
    setEditPopupAt(null);
    setEditInstruction("");
    // Сбрасываем выделение, чтобы пользователь видел: правка добавлена.
    window.getSelection()?.removeAllRanges();
  }

  function removePending(id: string) {
    setPendingEdits((prev) => prev.filter((e) => e.id !== id));
  }

  async function handleApplyAi() {
    if (aiBusy) return;
    if (pendingEdits.length === 0 && !generalInstruction.trim()) {
      setAiError("Добавь хотя бы одну правку или общую инструкцию");
      return;
    }
    setAiBusy(true);
    setAiError(null);
    try {
      const result = await applyAiEdit(taskId, {
        fullText: activeContent,
        edits: pendingEdits.map(({ fragment, instruction }) => ({
          fragment,
          instruction,
        })),
        generalInstruction: generalInstruction.trim() || undefined,
        modelChoice: aiModel,
      });
      // Получаем содержимое новой версии и переключаемся на неё.
      const freshContent = await fetchVersionContent(taskId, result.path);
      onVersionCreated?.({
        content: freshContent,
        version: result.version,
        path: result.path,
      });
      await loadVersions();
      setActivePath(result.path);
      setContentCache((prev) => ({ ...prev, [result.path]: freshContent }));
      setPendingEdits([]);
      setGeneralInstruction("");
      setMode("read");
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Шапка: переключатель режимов + версии */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-elevated/60 px-3 py-2">
        <div
          className="inline-flex rounded-lg border border-line bg-surface p-0.5"
          role="tablist"
        >
          <ModeButton
            active={mode === "read"}
            onClick={() => setMode("read")}
            icon={<Eye size={14} />}
            label="Чтение"
          />
          <ModeButton
            active={mode === "direct"}
            onClick={() => setMode("direct")}
            icon={<Pencil size={14} />}
            label="Прямая правка"
          />
          <ModeButton
            active={mode === "ai"}
            onClick={() => setMode("ai")}
            icon={<Wand2 size={14} />}
            label="Правка через AI"
          />
        </div>
        <VersionPicker
          versions={versions}
          activePath={activePath}
          onSelect={handleSelectVersion}
          loading={versionsLoading}
          error={versionsError}
        />
      </div>

      {/* Тело — зависит от режима */}
      {mode === "read" && (
        <article className="prose-team">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeContent}</ReactMarkdown>
        </article>
      )}

      {mode === "direct" && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-ink-faint">
            Отредактируй текст и сохрани — появится новая версия. LLM не вызывается, биллинг = 0.
          </p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={20}
            className="focus-ring w-full resize-y rounded-xl border border-line bg-canvas px-4 py-3 font-mono text-sm leading-relaxed text-ink"
          />
          {saveError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {saveError}
            </p>
          )}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setMode("read")}
              disabled={savingDirect}
              className="focus-ring inline-flex h-10 items-center rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink-muted transition hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleSaveDirect}
              disabled={savingDirect || !draft.trim() || draft === activeContent}
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-surface shadow-card transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {savingDirect ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Сохраняю…
                </>
              ) : (
                "Сохранить версию"
              )}
            </button>
          </div>
        </div>
      )}

      {mode === "ai" && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-ink-faint">
            Выдели фрагмент мышкой → появится попап «Добавить правку». Накопи список инструкций и нажми «Применить» — AI создаст новую версию.
          </p>
          <div
            ref={readPaneRef}
            onMouseUp={handleSelectionInRead}
            className="relative rounded-xl border border-line bg-canvas px-5 py-4"
          >
            <article className="prose-team">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeContent}</ReactMarkdown>
            </article>
            {editPopupAt && (
              <div
                className="absolute z-10 w-72 rounded-xl border border-line bg-surface p-3 shadow-pop"
                style={{
                  left: Math.max(8, Math.min(editPopupAt.x - 144, (readPaneRef.current?.clientWidth ?? 600) - 296)),
                  top: editPopupAt.y,
                }}
              >
                <div className="flex items-start justify-between gap-2 pb-2">
                  <span className="text-xs font-medium text-ink-faint">
                    Что сделать с фрагментом?
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditPopupAt(null)}
                    className="text-ink-faint hover:text-ink"
                    aria-label="Закрыть"
                  >
                    <X size={12} />
                  </button>
                </div>
                <p className="line-clamp-2 rounded-md bg-elevated px-2 py-1 text-xs italic text-ink-muted">
                  «{editPopupAt.fragment}»
                </p>
                <textarea
                  value={editInstruction}
                  onChange={(e) => setEditInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                      e.preventDefault();
                      commitEdit();
                    }
                  }}
                  rows={3}
                  autoFocus
                  placeholder="Например: переписать короче и без штампов"
                  className="focus-ring mt-2 w-full resize-y rounded-md border border-line bg-canvas px-2 py-1.5 text-xs leading-relaxed text-ink placeholder:text-ink-faint"
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditPopupAt(null)}
                    className="text-xs text-ink-muted hover:text-ink"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={commitEdit}
                    disabled={!editInstruction.trim()}
                    className="focus-ring inline-flex h-7 items-center gap-1 rounded-md bg-accent px-2 text-xs font-semibold text-surface disabled:opacity-50"
                  >
                    <Plus size={10} /> Добавить
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Список накопленных правок */}
          {pendingEdits.length > 0 && (
            <div className="flex flex-col gap-2 rounded-xl border border-line bg-elevated/60 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
                Правки ({pendingEdits.length})
              </p>
              <ul className="flex flex-col gap-2">
                {pendingEdits.map((edit, idx) => (
                  <li
                    key={edit.id}
                    className="flex items-start gap-2 rounded-lg border border-line bg-surface px-3 py-2"
                  >
                    <span className="mt-0.5 text-xs font-mono text-ink-faint">{idx + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs italic text-ink-muted">
                        «{edit.fragment}»
                      </p>
                      <p className="mt-1 text-sm text-ink">{edit.instruction}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removePending(edit.id)}
                      className="focus-ring inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-ink-faint transition hover:bg-rose-50 hover:text-rose-700"
                      aria-label="Удалить правку"
                      title="Удалить правку"
                    >
                      <Trash2 size={13} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Общая инструкция */}
          <label className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">
                Общая инструкция (применяется ко всему тексту)
              </span>
              <VoiceInput
                ariaLabel="Надиктовать общую инструкцию"
                onTranscribed={(text) => {
                  const sep =
                    generalInstruction && !generalInstruction.endsWith(" ") ? " " : "";
                  setGeneralInstruction((generalInstruction || "") + sep + text);
                }}
              />
            </div>
            <textarea
              value={generalInstruction}
              onChange={(e) => setGeneralInstruction(e.target.value)}
              rows={3}
              placeholder="Например: сократи на 20%, убери канцеляризмы, добавь живых деталей"
              className="focus-ring w-full resize-y rounded-xl border border-line bg-canvas px-4 py-3 text-sm leading-relaxed text-ink placeholder:text-ink-faint"
            />
          </label>

          <div className="rounded-xl border border-line bg-elevated p-4">
            <ModelSelector
              value={aiModel}
              onChange={setAiModel}
              taskType="edit_text_fragments"
            />
          </div>

          {aiError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
              {aiError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setMode("read")}
              disabled={aiBusy}
              className="focus-ring inline-flex h-10 items-center rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink-muted transition hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              onClick={handleApplyAi}
              disabled={
                aiBusy ||
                (pendingEdits.length === 0 && !generalInstruction.trim())
              }
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-sm font-semibold text-surface shadow-card transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {aiBusy ? (
                <>
                  <Loader2 size={14} className="animate-spin" /> Применяю…
                </>
              ) : (
                <>
                  <Sparkles size={14} /> Применить ({pendingEdits.length})
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ModeButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "focus-ring inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition " +
        (active
          ? "bg-accent text-surface shadow-sm"
          : "text-ink-muted hover:bg-elevated hover:text-ink")
      }
      aria-pressed={active}
    >
      {icon}
      {label}
    </button>
  );
}

function VersionPicker({
  versions,
  activePath,
  onSelect,
  loading,
  error,
}: {
  versions: TaskVersion[];
  activePath: string | null;
  onSelect: (path: string) => void;
  loading: boolean;
  error: string | null;
}) {
  if (loading) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-ink-faint">
        <Loader2 size={12} className="animate-spin" /> версии…
      </span>
    );
  }
  if (error) {
    return (
      <span className="text-xs text-rose-700" title={error}>
        Не удалось загрузить версии
      </span>
    );
  }
  if (versions.length === 0) {
    return <span className="text-xs text-ink-faint">Версий пока нет</span>;
  }
  if (versions.length === 1) {
    const v = versions[0];
    return (
      <span className="inline-flex items-center gap-2 text-xs text-ink-faint">
        <span className="rounded-md bg-accent-soft px-2 py-0.5 font-mono text-accent">
          v{v.version}
        </span>
        {v.size != null && <span>· {formatSize(v.size)}</span>}
      </span>
    );
  }
  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      <span className="text-xs text-ink-faint">Версия:</span>
      {versions.map((v) => {
        const active = v.path === activePath;
        return (
          <button
            key={v.path}
            type="button"
            onClick={() => onSelect(v.path)}
            title={[
              v.createdAt ? new Date(v.createdAt).toLocaleString("ru") : null,
              v.size != null ? formatSize(v.size) : null,
            ]
              .filter(Boolean)
              .join(" · ")}
            className={
              "focus-ring inline-flex h-7 items-center rounded-md px-2 font-mono text-xs transition " +
              (active
                ? "bg-accent text-surface"
                : "border border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink")
            }
          >
            v{v.version}
          </button>
        );
      })}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
