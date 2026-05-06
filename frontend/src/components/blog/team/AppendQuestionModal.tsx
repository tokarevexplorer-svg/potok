"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import VoiceInput from "./VoiceInput";
import ModelSelector from "./ModelSelector";
import { appendQuestion } from "@/lib/team/teamBackendClient";
import type { TeamTaskModelChoice } from "@/lib/team/types";

interface AppendQuestionModalProps {
  taskId: string;
  taskTitle: string;
  onClose: () => void;
  // Когда вопрос успешно добавлен — caller обновляет state и закрывает модалку.
  // appendedText — markdown-фрагмент, дописанный к артефакту, чтобы можно было
  // сразу подмерджить его к task.result в UI без перезагрузки.
  onAppended: (info: { appendedText: string; costUsd: number }) => void;
}

const DEFAULT_MODEL: TeamTaskModelChoice = { preset: "balanced" };

export default function AppendQuestionModal({
  taskId,
  taskTitle,
  onClose,
  onAppended,
}: AppendQuestionModalProps) {
  const [question, setQuestion] = useState("");
  const [model, setModel] = useState<TeamTaskModelChoice>(DEFAULT_MODEL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [submitting, onClose]);

  async function handleSubmit() {
    const trimmed = question.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await appendQuestion(taskId, trimmed, model);
      onAppended({
        appendedText: result.appended_text,
        costUsd: result.cost_usd,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[90] flex items-stretch justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="append-question-title"
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={submitting ? undefined : onClose}
        role="presentation"
      />

      <div className="relative z-10 flex h-full max-h-screen w-full max-w-xl flex-col overflow-hidden bg-surface shadow-pop sm:h-auto sm:max-h-[85vh] sm:rounded-2xl sm:border sm:border-line">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Дополнительный вопрос
            </p>
            <h2
              id="append-question-title"
              className="mt-0.5 truncate font-display text-lg font-semibold tracking-tight"
            >
              {taskTitle}
            </h2>
            <p className="mt-1 text-xs text-ink-faint">
              Ответ дописывается к артефакту исходной задачи. Источник перекачивается заново.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="focus-ring inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg text-ink-muted transition hover:bg-elevated hover:text-ink disabled:opacity-50"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          className="flex flex-1 flex-col gap-5 overflow-y-auto p-6"
        >
          <label className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">
                Что ещё хочешь узнать
                <span className="ml-1 text-accent">*</span>
              </span>
              <VoiceInput
                ariaLabel="Надиктовать вопрос"
                onTranscribed={(text) => {
                  const sep = question && !question.endsWith(" ") ? " " : "";
                  setQuestion((question || "") + sep + text);
                }}
              />
            </div>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={4}
              required
              autoFocus
              placeholder="Например: какие экономические последствия были у этого решения?"
              className="focus-ring w-full resize-y rounded-xl border border-line bg-canvas px-4 py-3 text-sm leading-relaxed text-ink placeholder:text-ink-faint"
            />
          </label>

          <div className="rounded-xl border border-line bg-elevated p-4">
            <ModelSelector value={model} onChange={setModel} taskType="research_direct" />
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
          )}

          <div className="flex items-center justify-end gap-3 border-t border-line pt-5">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="focus-ring inline-flex h-11 items-center rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink-muted transition hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!question.trim() || submitting}
              className="focus-ring inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-surface shadow-card transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Спрашиваю…
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Задать
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
