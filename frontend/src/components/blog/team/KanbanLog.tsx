"use client";

import { useMemo, useState } from "react";
import { Archive, ChevronDown } from "lucide-react";
import type { TeamTask } from "@/lib/team/types";
import type { TeamAgent } from "@/lib/team/teamAgentsService";
import type { TeamProject } from "@/lib/team/teamBackendClient";
import TaskCard from "./TaskCard";
import { KANBAN_COLUMNS, statusToColumn } from "./taskTypeMeta";

interface KanbanLogProps {
  tasks: TeamTask[];
  onOpenTask: (task: TeamTask) => void;
  // Сессия 16: справочники для подписей на карточках.
  agentsById?: Map<string, TeamAgent>;
  projectsById?: Map<string, TeamProject>;
}

// Канбан-лог задач: три колонки в верхней сетке (В работе / Готово к ревью /
// Готово), плюс отдельный коллапсируемый список архива внизу. Группировка
// идёт по статусу через statusToColumn — едина и для UI, и для подсчётов.
//
// Архивированные и hidden-типы (edit_text_fragments) сюда не попадают:
// первые — потому что архив отдельным блоком, вторые — потому что они
// биллятся к родительской write_text задаче и отдельной карточкой не нужны.
export default function KanbanLog({
  tasks,
  onOpenTask,
  agentsById,
  projectsById,
}: KanbanLogProps) {
  const [archiveOpen, setArchiveOpen] = useState(false);

  const visible = useMemo(
    () =>
      tasks.filter(
        (t) => t.type !== "edit_text_fragments" && t.status !== "archived",
      ),
    [tasks],
  );
  const archived = useMemo(
    () =>
      tasks.filter(
        (t) => t.type !== "edit_text_fragments" && t.status === "archived",
      ),
    [tasks],
  );

  const grouped = useMemo(() => {
    const buckets: Record<string, TeamTask[]> = {
      running: [],
      done: [],
      marked_done: [],
    };
    for (const task of visible) {
      const col = statusToColumn(task.status);
      if (col && buckets[col]) buckets[col].push(task);
    }
    return buckets;
  }, [visible]);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {KANBAN_COLUMNS.map((col) => {
          const items = grouped[col.id] ?? [];
          return (
            <div
              key={col.id}
              className="flex min-h-[120px] flex-col gap-3 rounded-2xl border border-line bg-elevated/40 p-4"
            >
              <div className="flex items-baseline justify-between">
                <h2 className="font-display text-sm font-semibold uppercase tracking-wide text-ink">
                  {col.label}
                </h2>
                <span className="text-xs font-semibold text-ink-faint">
                  {items.length}
                </span>
              </div>
              <p className="text-xs text-ink-faint">{col.hint}</p>

              <div className="flex flex-col gap-3">
                {items.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-line bg-surface/40 px-3 py-6 text-center text-xs text-ink-faint">
                    {emptyHint(col.id)}
                  </div>
                ) : (
                  items.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      onClick={() => onOpenTask(task)}
                      agentsById={agentsById}
                      projectsById={projectsById}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {archived.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface">
          <button
            type="button"
            onClick={() => setArchiveOpen((v) => !v)}
            className="focus-ring flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-medium text-ink-muted hover:text-ink"
          >
            <span className="inline-flex items-center gap-2">
              <Archive size={16} />
              Архив ({archived.length})
            </span>
            <ChevronDown
              size={16}
              className={"transition " + (archiveOpen ? "rotate-180" : "rotate-0")}
            />
          </button>
          {archiveOpen && (
            <div className="grid gap-3 border-t border-line p-4 md:grid-cols-3">
              {archived.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onClick={() => onOpenTask(task)}
                  agentsById={agentsById}
                  projectsById={projectsById}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function emptyHint(col: string): string {
  if (col === "running") return "Новые задачи появляются здесь";
  if (col === "done") return "Готовые задачи ждут проверки";
  if (col === "marked_done") return "Принятые задачи остаются в истории";
  return "Пусто";
}
