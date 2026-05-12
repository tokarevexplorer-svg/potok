"use client";

// Сессия 34: рендер группы клонов задачи для мульти-LLM сравнения.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchComparisonGroup } from "@/lib/team/teamBackendClient";
import { formatUsd } from "@/lib/team/format";

interface ComparedTask {
  id: string;
  type: string;
  title: string | null;
  status: string;
  provider: string | null;
  model: string | null;
  cost_usd: number | null;
  result: string | null;
  params: Record<string, unknown> | null;
  created_at: string;
}

interface Props {
  groupId: string;
}

export default function TaskComparisonView({ groupId }: Props) {
  const [tasks, setTasks] = useState<ComparedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchComparisonGroup(groupId)
      .then((res) => {
        if (cancelled) return;
        setTasks((res.tasks as ComparedTask[]) ?? []);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [groupId]);

  if (loading) {
    return (
      <div className="mt-8 inline-flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 size={14} className="animate-spin" /> Загружаем группу…
      </div>
    );
  }

  if (error) {
    return (
      <p className="mt-8 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
        {error}
      </p>
    );
  }

  if (tasks.length === 0) {
    return (
      <p className="mt-8 rounded-2xl border border-dashed border-line bg-elevated/40 px-4 py-6 text-sm text-ink-muted">
        В группе {groupId} нет задач.
      </p>
    );
  }

  // Общий бриф — берём user_input первой задачи.
  const sharedBrief = (tasks[0]?.params?.user_input ?? "").toString();

  return (
    <div className="mt-8 flex flex-col gap-6">
      <details className="rounded-2xl border border-line bg-elevated/40 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-ink">
          Общий бриф ({sharedBrief.length} символов)
        </summary>
        <pre className="mt-2 whitespace-pre-wrap text-xs text-ink-muted">{sharedBrief}</pre>
      </details>

      <div
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${tasks.length}, minmax(0, 1fr))` }}
      >
        {tasks.map((task, idx) => (
          <TaskColumn key={task.id} task={task} index={idx} />
        ))}
      </div>
    </div>
  );
}

function TaskColumn({ task, index }: { task: ComparedTask; index: number }) {
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-ink-faint">
            Вариант {index + 1}
          </p>
          <p className="truncate font-display text-base font-semibold text-ink">
            {task.model || task.provider || "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span
            className={
              "inline-flex items-center rounded-full px-2 py-0.5 " +
              (task.status === "done" || task.status === "marked_done"
                ? "bg-emerald-100 text-emerald-800"
                : task.status === "running"
                  ? "bg-amber-100 text-amber-800"
                  : task.status === "error"
                    ? "bg-rose-100 text-rose-800"
                    : "bg-canvas text-ink-muted")
            }
          >
            {task.status}
          </span>
          {typeof task.cost_usd === "number" && task.cost_usd > 0 && (
            <span className="font-mono text-ink-muted">{formatUsd(task.cost_usd)}</span>
          )}
        </div>
      </header>

      {task.status === "running" || task.status === "clarifying" || task.status === "awaiting_input" || task.status === "awaiting_resource" ? (
        <p className="rounded-lg bg-canvas px-3 py-2 text-xs text-ink-muted">
          Задача ещё в работе…
        </p>
      ) : task.status === "error" ? (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
          Ошибка выполнения. Открой задачу из лога, чтобы увидеть детали.
        </p>
      ) : task.result ? (
        <article className="prose-team max-h-[60vh] overflow-y-auto">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.result}</ReactMarkdown>
        </article>
      ) : (
        <p className="rounded-lg border border-dashed border-line bg-canvas px-3 py-2 text-xs text-ink-faint">
          Результата нет.
        </p>
      )}
    </article>
  );
}
