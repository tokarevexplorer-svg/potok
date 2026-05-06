"use client";

import { useEffect, useRef, useState } from "react";
import {
  Archive,
  Check,
  ChevronDown,
  Cpu,
  Loader2,
  MessageSquarePlus,
  Pencil,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { TeamTask } from "@/lib/team/types";
import { formatUsd } from "@/lib/team/format";
import {
  archiveTask,
  markTaskDone,
  renameTask,
} from "@/lib/team/teamBackendClient";
import { formatRelative, statusBadge, taskTypeLabel } from "./taskTypeMeta";
import WriteTextEditor from "./WriteTextEditor";
import AppendQuestionModal from "./AppendQuestionModal";

interface TaskViewerModalProps {
  task: TeamTask;
  onClose: () => void;
  // Когда задача обновлена через действие — caller получает свежую версию,
  // оптимистично кладёт в локальный state.
  onTaskUpdated: (task: TeamTask) => void;
}

// Модалка просмотра одной задачи. Логика отображения тела зависит от типа:
//   • write_text — встраиваем WriteTextEditor с тремя режимами (read/direct/ai)
//     и переключателем версий.
//   • research_direct — показываем результат + кнопку «Задать дополнительный
//     вопрос», которая открывает AppendQuestionModal.
//   • остальные — простой markdown-рендер результата.
//
// Действия снизу (архив / пометить готовой / переименовать) одинаковы
// для всех типов.
export default function TaskViewerModal({
  task,
  onClose,
  onTaskUpdated,
}: TaskViewerModalProps) {
  const [busy, setBusy] = useState<null | "archive" | "done" | "rename">(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title ?? "");
  const [promptOpen, setPromptOpen] = useState(false);
  // Локальный override task.result — после прямой правки или AI-правки
  // показываем свежий контент, не дожидаясь поллинга. Сбрасывается на null
  // при смене task.id.
  const [localContent, setLocalContent] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitleDraft(task.title ?? "");
    setLocalContent(null);
  }, [task.id, task.title]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !busy && !askOpen) {
        if (editingTitle) {
          setEditingTitle(false);
          setTitleDraft(task.title ?? "");
        } else {
          onClose();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [busy, onClose, editingTitle, task.title, askOpen]);

  useEffect(() => {
    if (editingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [editingTitle]);

  const badge = statusBadge(task.status);

  async function handleArchive() {
    if (busy) return;
    setBusy("archive");
    setActionError(null);
    try {
      const updated = await archiveTask(task.id);
      onTaskUpdated(updated);
      onClose();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleMarkDone() {
    if (busy) return;
    setBusy("done");
    setActionError(null);
    try {
      const updated = await markTaskDone(task.id);
      onTaskUpdated(updated);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleRename() {
    const next = titleDraft.trim();
    if (!next || next === (task.title ?? "")) {
      setEditingTitle(false);
      setTitleDraft(task.title ?? "");
      return;
    }
    if (busy) return;
    setBusy("rename");
    setActionError(null);
    try {
      const updated = await renameTask(task.id, next);
      onTaskUpdated(updated);
      setEditingTitle(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  const tokens = task.tokens ?? {};
  const totalTokens = (tokens.input ?? 0) + (tokens.output ?? 0);
  const isWriteText = task.type === "write_text";
  const isResearch = task.type === "research_direct";
  const displayContent = localContent ?? task.result ?? "";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-viewer-title"
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={busy || askOpen ? undefined : onClose}
        role="presentation"
      />

      <div className="relative z-10 flex h-full max-h-screen w-full max-w-3xl flex-col overflow-hidden bg-surface shadow-pop sm:h-auto sm:max-h-[90vh] sm:rounded-2xl sm:border sm:border-line">
        {/* Шапка */}
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={
                  "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide " +
                  badge.className
                }
              >
                {task.status === "running" && (
                  <Loader2 size={10} className="mr-1 animate-spin" />
                )}
                {badge.label}
              </span>
              <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
                {taskTypeLabel(task.type)}
              </p>
            </div>

            {editingTitle ? (
              <div className="mt-2 flex items-center gap-2">
                <input
                  ref={titleInputRef}
                  type="text"
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void handleRename();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setEditingTitle(false);
                      setTitleDraft(task.title ?? "");
                    }
                  }}
                  onBlur={handleRename}
                  className="focus-ring w-full rounded-lg border border-line bg-canvas px-3 py-2 font-display text-lg font-semibold text-ink"
                />
              </div>
            ) : (
              <h2
                id="task-viewer-title"
                className="mt-1.5 flex items-center gap-2 font-display text-xl font-semibold tracking-tight text-ink"
              >
                <span className="break-words">{task.title || "(без названия)"}</span>
                <button
                  type="button"
                  onClick={() => setEditingTitle(true)}
                  className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-faint transition hover:bg-elevated hover:text-ink"
                  aria-label="Переименовать"
                  title="Переименовать"
                >
                  <Pencil size={14} />
                </button>
              </h2>
            )}

            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-faint">
              <span title={task.createdAt}>Создана {formatRelative(task.createdAt)}</span>
              {task.finishedAt && (
                <span title={task.finishedAt}>
                  Завершена {formatRelative(task.finishedAt)}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Cpu size={12} /> {task.model || "—"}
                {task.provider ? ` · ${task.provider}` : ""}
              </span>
              {totalTokens > 0 && (
                <span>
                  Токены: {(tokens.input ?? 0).toLocaleString("ru")} →{" "}
                  {(tokens.output ?? 0).toLocaleString("ru")}
                  {tokens.cached ? ` (кеш ${tokens.cached.toLocaleString("ru")})` : ""}
                </span>
              )}
              {typeof task.costUsd === "number" && task.costUsd > 0 && (
                <span className="font-medium text-ink-muted">
                  {formatUsd(task.costUsd)}
                </span>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={busy !== null}
            className="focus-ring inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-ink-muted transition hover:bg-elevated hover:text-ink disabled:opacity-50"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        {/* Тело */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {task.status === "running" && (
            <div className="flex items-center gap-3 rounded-xl border border-line bg-elevated px-4 py-3 text-sm text-ink-muted">
              <Loader2 size={16} className="animate-spin" />
              Задача выполняется. Результат появится здесь автоматически.
            </div>
          )}

          {task.status === "error" && task.error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              <p className="font-semibold">Ошибка выполнения</p>
              <p className="mt-1 whitespace-pre-wrap">{task.error}</p>
            </div>
          )}

          {/* Тело результата зависит от типа задачи */}
          {displayContent && task.status !== "running" && task.status !== "error" && (
            <>
              {isWriteText ? (
                <WriteTextEditor
                  taskId={task.id}
                  initialContent={displayContent}
                  onVersionCreated={(info) => {
                    setLocalContent(info.content);
                  }}
                />
              ) : (
                <article className="prose-team mt-2">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayContent}</ReactMarkdown>
                </article>
              )}
            </>
          )}

          {!displayContent && task.status !== "running" && task.status !== "error" && (
            <p className="rounded-xl border border-dashed border-line bg-elevated/40 px-4 py-6 text-center text-sm text-ink-faint">
              У задачи нет результата.
            </p>
          )}

          {/* Кнопка «Задать дополнительный вопрос» — только для research_direct */}
          {isResearch && task.status !== "running" && task.status !== "error" && (
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setAskOpen(true)}
                className="focus-ring inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink-muted transition hover:border-line-strong hover:text-ink"
              >
                <MessageSquarePlus size={14} />
                Задать дополнительный вопрос
              </button>
            </div>
          )}

          {/* Промпт */}
          <div className="mt-6 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setPromptOpen((v) => !v)}
              className="focus-ring inline-flex w-fit items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
            >
              <ChevronDown
                size={14}
                className={"transition " + (promptOpen ? "rotate-0" : "-rotate-90")}
              />
              Использованный промпт
              {task.promptOverrideUsed && (
                <em className="text-accent not-italic">(отредактирован)</em>
              )}
            </button>
            {promptOpen && (
              <div className="flex flex-col gap-3 rounded-xl border border-line bg-elevated p-4">
                <PromptBlock label="System" value={task.prompt?.system ?? ""} />
                <PromptBlock label="User" value={task.prompt?.user ?? ""} />
                {task.prompt?.template && (
                  <p className="text-xs text-ink-faint">
                    Шаблон: <span className="font-mono">{task.prompt.template}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Артефакт */}
          {task.artifactPath && (
            <p className="mt-4 text-xs text-ink-faint">
              Артефакт сохранён в Storage:{" "}
              <span className="font-mono break-all">{task.artifactPath}</span>
            </p>
          )}
        </div>

        {/* Футер с действиями */}
        <div className="border-t border-line bg-elevated/40 px-6 py-4">
          {actionError && (
            <p className="mb-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
              {actionError}
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleArchive}
              disabled={busy !== null || task.status === "archived"}
              className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink-muted transition hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              {busy === "archive" ? <Loader2 size={14} className="animate-spin" /> : <Archive size={14} />}
              В архив
            </button>
            <button
              type="button"
              onClick={handleMarkDone}
              disabled={
                busy !== null ||
                task.status === "marked_done" ||
                task.status === "running" ||
                task.status === "archived"
              }
              className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-surface shadow-card transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === "done" ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Пометить готовой
            </button>
          </div>
        </div>
      </div>

      {/* Дополнительный вопрос — отдельная модалка поверх */}
      {askOpen && isResearch && (
        <AppendQuestionModal
          taskId={task.id}
          taskTitle={task.title || taskTypeLabel(task.type)}
          onClose={() => setAskOpen(false)}
          onAppended={({ appendedText }) => {
            // Подмерджим дополнение к содержимому, чтобы пользователь увидел
            // ответ сразу. Поллинг через ~3 сек подменит на серверный снапшот.
            setLocalContent((displayContent ?? "") + appendedText);
            setAskOpen(false);
          }}
        />
      )}
    </div>
  );
}

function PromptBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-ink">
        {value || "(пусто)"}
      </pre>
    </div>
  );
}
