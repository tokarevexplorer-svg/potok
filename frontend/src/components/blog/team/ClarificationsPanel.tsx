"use client";

// Сессия 31: панель уточняющих вопросов в карточке задачи.
//
// Появляется на статусах clarifying / awaiting_input / awaiting_resource:
//   - clarifying       → спиннер «Агент формулирует вопросы…».
//   - awaiting_input   → форма с textarea на каждый вопрос + «Продолжить».
//   - awaiting_resource → прогресс «Шаг N из M» (берётся из step_state).
//
// После сабмита: POST /api/team/tasks/:id/clarify → задача переходит в
// running, UI ждёт обновления через поллинг team_tasks.

import { useEffect, useMemo, useState } from "react";
import { Loader2, Send } from "lucide-react";
import {
  submitClarificationAnswers,
  type ClarificationAnswer,
} from "@/lib/team/teamBackendClient";
import type {
  TaskClarificationQuestion,
  TaskStepState,
  TeamTask,
} from "@/lib/team/types";

interface Props {
  task: TeamTask;
  /** caller-side оптимистичное обновление снапшота. */
  onTaskUpdated?: (task: TeamTask) => void;
}

export default function ClarificationsPanel({ task, onTaskUpdated }: Props) {
  if (task.status === "clarifying") {
    return (
      <section className="mt-5 flex items-center gap-3 rounded-2xl border border-line bg-elevated/40 px-4 py-3 text-sm text-ink-muted">
        <Loader2 size={16} className="animate-spin" />
        Агент формулирует уточняющие вопросы…
      </section>
    );
  }

  if (task.status === "awaiting_input") {
    return <ClarificationsForm task={task} onTaskUpdated={onTaskUpdated} />;
  }

  if (task.status === "awaiting_resource") {
    return <StepProgress stepState={task.stepState ?? null} />;
  }

  return null;
}

function ClarificationsForm({
  task,
  onTaskUpdated,
}: {
  task: TeamTask;
  onTaskUpdated?: (task: TeamTask) => void;
}) {
  const questions = useMemo<TaskClarificationQuestion[]>(
    () => (Array.isArray(task.clarificationQuestions) ? task.clarificationQuestions : []),
    [task.clarificationQuestions],
  );

  const [answers, setAnswers] = useState<string[]>(() => questions.map(() => ""));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAnswers(questions.map(() => ""));
    setError(null);
  }, [questions]);

  if (questions.length === 0) {
    return (
      <section className="mt-5 rounded-2xl border border-line bg-elevated/40 p-4 text-sm text-ink-muted">
        ❓ Уточняющих вопросов нет — задача готова стартовать. Обнови страницу
        через минуту.
      </section>
    );
  }

  async function handleSubmit() {
    if (submitting) return;
    // Все required — должны быть заполнены.
    for (let i = 0; i < questions.length; i++) {
      if (questions[i].required && !answers[i].trim()) {
        setError(`Заполни ответ на: «${questions[i].question}»`);
        return;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: ClarificationAnswer[] = questions
        .map((q, idx) => ({
          question: q.question,
          answer: (answers[idx] ?? "").trim(),
        }))
        .filter((e) => e.answer);
      await submitClarificationAnswers(task.id, payload);
      // Оптимистично переключаем статус — поллинг скоро подтянет реальный
      // снапшот, но UI не должен мерцать.
      onTaskUpdated?.({
        ...task,
        status: "running",
        clarificationAnswers: payload,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mt-5 rounded-2xl border border-line bg-elevated/40 p-4">
      <h3 className="mb-2 text-sm font-semibold text-ink">
        ❓ Вопросы агента ({questions.length})
      </h3>
      <p className="mb-3 text-xs text-ink-faint">
        Заполни ответы — задача перейдёт в работу. Звёздочка — обязательный вопрос.
      </p>
      <div className="flex flex-col gap-3">
        {questions.map((q, idx) => (
          <label key={idx} className="flex flex-col gap-1">
            <span className="text-sm text-ink">
              {q.question}
              {q.required && <span className="ml-1 text-rose-600">*</span>}
            </span>
            <textarea
              value={answers[idx] ?? ""}
              onChange={(e) => {
                const next = answers.slice();
                next[idx] = e.target.value;
                setAnswers(next);
              }}
              rows={2}
              disabled={submitting}
              placeholder="Ответ…"
              className="focus-ring rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint disabled:opacity-50"
            />
          </label>
        ))}
      </div>
      {error && (
        <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
          {error}
        </p>
      )}
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={submitting}
          className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-surface transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Send size={14} />
          )}
          Продолжить
        </button>
      </div>
    </section>
  );
}

function StepProgress({ stepState }: { stepState: TaskStepState | null }) {
  if (!stepState) {
    return (
      <section className="mt-5 rounded-2xl border border-line bg-elevated/40 px-4 py-3 text-sm text-ink-muted">
        Задача ждёт внешнего ресурса…
      </section>
    );
  }
  const total = Number(stepState.total_steps ?? 0);
  const current = Math.min(Number(stepState.current_step ?? 0), total);
  const steps = Array.isArray(stepState.steps) ? stepState.steps : [];
  const currentQuestion = steps[current]?.question ?? null;

  return (
    <section className="mt-5 rounded-2xl border border-line bg-elevated/40 p-4 text-sm">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-ink">
          Шаг {Math.min(current + 1, total)} из {total}
        </span>
        {stepState.synthesis_pending && (
          <span className="text-xs text-ink-faint">собирается финальный синтез…</span>
        )}
      </div>
      {currentQuestion && (
        <p className="mt-2 text-ink-muted">
          <span className="text-ink-faint">Текущий вопрос:</span> {currentQuestion}
        </p>
      )}
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-canvas">
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: total > 0 ? `${(current / total) * 100}%` : "0%" }}
        />
      </div>
    </section>
  );
}
