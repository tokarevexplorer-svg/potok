"use client";

import { ArrowDownUp } from "lucide-react";
import type { TeamAgent } from "@/lib/team/teamAgentsService";
import type { TeamProject } from "@/lib/team/teamBackendClient";

// Сессия 16: фильтры лога задач на дашборде. Контролируемый компонент —
// родитель держит state, фильтрация делается там же.

export type TaskStatusFilter =
  | "all"
  | "running"
  | "done"
  | "marked_done"
  | "error"
  | "archived";

export type PeriodFilter = "today" | "7d" | "30d" | "all";

export type SortBy = "updated" | "created";

export interface FilterState {
  agentId: string | "all";
  projectId: string | "all" | "none";
  statuses: Set<TaskStatusFilter>;
  period: PeriodFilter;
  sortBy: SortBy;
}

interface Props {
  agents: TeamAgent[];
  projects: TeamProject[];
  state: FilterState;
  onChange: (next: FilterState) => void;
}

const STATUS_OPTIONS: { value: TaskStatusFilter; label: string }[] = [
  { value: "running", label: "В работе" },
  { value: "done", label: "Готово" },
  { value: "marked_done", label: "Принято" },
  { value: "error", label: "Ошибка" },
];

const PERIOD_OPTIONS: { value: PeriodFilter; label: string }[] = [
  { value: "today", label: "Сегодня" },
  { value: "7d", label: "7 дней" },
  { value: "30d", label: "30 дней" },
  { value: "all", label: "Всё время" },
];

export default function TaskLogFilters({ agents, projects, state, onChange }: Props) {
  function setAgent(value: string) {
    onChange({ ...state, agentId: value === "all" ? "all" : value });
  }
  function setProject(value: string) {
    onChange({
      ...state,
      projectId: value === "all" || value === "none" ? value : value,
    });
  }
  function toggleStatus(value: TaskStatusFilter) {
    const next = new Set(state.statuses);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange({ ...state, statuses: next });
  }
  function setPeriod(value: PeriodFilter) {
    onChange({ ...state, period: value });
  }
  function toggleSort() {
    onChange({ ...state, sortBy: state.sortBy === "updated" ? "created" : "updated" });
  }

  return (
    <div className="flex flex-wrap items-end gap-4 rounded-2xl border border-line bg-surface px-4 py-3 sm:px-5 sm:py-4">
      <FilterSelect
        label="Сотрудник"
        value={state.agentId}
        onChange={setAgent}
        options={[
          { value: "all", label: "Все" },
          ...agents.map((a) => ({ value: a.id, label: a.display_name })),
        ]}
      />

      <FilterSelect
        label="Проект"
        value={state.projectId}
        onChange={setProject}
        options={[
          { value: "all", label: "Все" },
          { value: "none", label: "⚪ Без проекта" },
          ...projects.map((p) => ({ value: p.id, label: p.name })),
        ]}
      />

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
          Статус
        </span>
        <div className="inline-flex rounded-lg border border-line bg-canvas p-1">
          {STATUS_OPTIONS.map((opt) => {
            const active = state.statuses.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => toggleStatus(opt.value)}
                className={`focus-ring rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? "bg-accent text-surface shadow-card"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
          Период
        </span>
        <div className="inline-flex rounded-lg border border-line bg-canvas p-1">
          {PERIOD_OPTIONS.map((opt) => {
            const active = state.period === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setPeriod(opt.value)}
                className={`focus-ring rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? "bg-accent text-surface shadow-card"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={toggleSort}
        title={state.sortBy === "updated" ? "Сортировка по последнему обновлению" : "Сортировка по дате создания"}
        className="focus-ring ml-auto inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-canvas px-3 text-xs font-medium text-ink-muted transition hover:border-line-strong hover:text-ink"
      >
        <ArrowDownUp size={12} />
        {state.sortBy === "updated" ? "По обновлению" : "По созданию"}
      </button>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring h-10 rounded-lg border border-line bg-canvas px-3 text-sm text-ink"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// Применяет фильтры к массиву задач. Сортировка — в самом конце.
export function applyTaskFilters(
  tasks: { id: string; agentId: string | null; projectId: string | null; status: string; createdAt: string; updatedAt: string }[],
  state: FilterState,
) {
  const now = Date.now();
  const periodCutoff =
    state.period === "today"
      ? new Date(new Date().setHours(0, 0, 0, 0)).getTime()
      : state.period === "7d"
        ? now - 7 * 24 * 60 * 60 * 1000
        : state.period === "30d"
          ? now - 30 * 24 * 60 * 60 * 1000
          : null;

  const filtered = tasks.filter((t) => {
    if (state.agentId !== "all" && t.agentId !== state.agentId) return false;
    if (state.projectId === "none") {
      if (t.projectId) return false;
    } else if (state.projectId !== "all" && t.projectId !== state.projectId) {
      return false;
    }
    if (state.statuses.size > 0) {
      const allowed = state.statuses.has(t.status as TaskStatusFilter);
      if (!allowed) return false;
    }
    if (periodCutoff !== null) {
      const ts = new Date(t.createdAt).getTime();
      if (!Number.isFinite(ts) || ts < periodCutoff) return false;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const aT = new Date(state.sortBy === "updated" ? a.updatedAt : a.createdAt).getTime();
    const bT = new Date(state.sortBy === "updated" ? b.updatedAt : b.createdAt).getTime();
    return bT - aT;
  });
  return filtered;
}
