"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { readArtifactText } from "@/lib/team/teamArtifactsService";
import { uploadArtifact } from "@/lib/team/teamBackendClient";

interface ArtifactViewerModalProps {
  path: string;
  name: string;
  onClose: () => void;
  // Вызывается после успешного сохранения, чтобы родительский браузер
  // обновил список (updated_at у файла поменяется).
  onChanged?: () => void;
}

// Просмотр / редактирование одного артефакта. Markdown-файлы — рендер через
// react-markdown в режиме просмотра, обычная textarea в режиме редактирования.
// JSON / txt — редактируется как plain text без markdown-рендера.
export default function ArtifactViewerModal({
  path,
  name,
  onClose,
  onChanged,
}: ArtifactViewerModalProps) {
  const [text, setText] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const lockRef = useRef(false);

  const lower = name.toLowerCase();
  const isMarkdown = lower.endsWith(".md") || lower.endsWith(".markdown");

  useEffect(() => {
    let cancelled = false;
    setText(null);
    setLoadError(null);
    readArtifactText(path)
      .then((t) => {
        if (cancelled) return;
        setText(t);
        setDraft(t);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  // Esc + блок скролла фона. Если editing с правками — не закрываем, чтобы
  // не потерять.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (saving) return;
      if (editing && draft !== (text ?? "")) {
        if (lockRef.current) return;
        lockRef.current = true;
        const ok = confirm(
          "Есть несохранённые правки. Закрыть без сохранения?",
        );
        lockRef.current = false;
        if (!ok) return;
      }
      onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [editing, draft, text, saving, onClose]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await uploadArtifact(path, draft);
      setText(draft);
      setEditing(false);
      onChanged?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={name}
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={saving ? undefined : onClose}
        role="presentation"
      />
      <div className="relative z-10 flex h-full max-h-screen w-full max-w-3xl flex-col overflow-hidden bg-surface shadow-pop sm:h-auto sm:max-h-[90vh] sm:rounded-2xl sm:border sm:border-line">
        {/* Шапка */}
        <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
              {path.split("/").slice(0, -1).join(" / ") || "team-database"}
            </p>
            <h2 className="mt-0.5 truncate font-display text-lg font-semibold text-ink">
              {name}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {!editing && text !== null && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm text-ink-muted transition hover:border-line-strong hover:text-ink"
              >
                <Pencil size={14} /> Править
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted transition hover:bg-elevated hover:text-ink disabled:opacity-50"
              aria-label="Закрыть"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Тело */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {text === null && !loadError && (
            <div className="flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 size={14} className="animate-spin" /> Грузим файл…
            </div>
          )}
          {loadError && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {loadError}
            </p>
          )}
          {text !== null && !editing && (
            <>
              {isMarkdown ? (
                <article className="prose-team">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
                </article>
              ) : (
                <pre className="whitespace-pre-wrap break-words rounded-xl border border-line bg-canvas px-4 py-3 font-mono text-xs leading-relaxed text-ink">
                  {text}
                </pre>
              )}
            </>
          )}
          {text !== null && editing && (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck
              className="focus-ring h-[60vh] w-full resize-none rounded-xl border border-line bg-canvas p-4 font-mono text-sm leading-relaxed text-ink"
            />
          )}
        </div>

        {/* Футер действий — виден только в режиме редактирования */}
        {editing && (
          <div className="border-t border-line bg-elevated/40 px-6 py-4">
            {saveError && (
              <p className="mb-3 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
                {saveError}
              </p>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setDraft(text ?? "");
                  setSaveError(null);
                }}
                disabled={saving}
                className="focus-ring inline-flex h-10 items-center rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink-muted transition hover:border-line-strong hover:text-ink disabled:opacity-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving || draft === (text ?? "")}
                className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-surface transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Сохранить
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
