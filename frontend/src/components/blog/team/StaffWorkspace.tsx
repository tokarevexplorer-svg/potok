"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Archive, Loader2, Plus, User } from "lucide-react";
import {
  DEPARTMENT_LABELS,
  listAgents,
  STATUS_LABELS,
  type AgentStatus,
  type TeamAgent,
} from "@/lib/team/teamAgentsService";

// Сессия 9 этапа 2: страница раздела «Сотрудники».
//
// Простой список карточек агентов из team_agents — без мастера создания
// (он в пункте 12) и без перехода в карточку (тоже пункт 12). Карточки
// показывают аватар-заглушку, имя, должность, бейдж департамента и точку
// статуса.
//
// Фильтр по статусу: «Активные / Архив / Все». По умолчанию — «Активные».
// Кнопка «+ Добавить сотрудника» disabled с tooltip — мастер появится
// в Сессии 10.

const STATUS_TABS: { value: AgentStatus | "all"; label: string }[] = [
  { value: "active", label: "Активные" },
  { value: "archived", label: "Архив" },
  { value: "all", label: "Все" },
];

const STATUS_DOT_CLASS: Record<AgentStatus, string> = {
  active: "bg-emerald-500",
  paused: "bg-amber-500",
  archived: "bg-ink-faint",
};

function StatusDot({ status }: { status: AgentStatus }) {
  if (status === "archived") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-muted"
        title={STATUS_LABELS[status]}
      >
        <Archive size={12} />
        Архив
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs text-ink-muted"
      title={STATUS_LABELS[status]}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${STATUS_DOT_CLASS[status]}`}
        aria-hidden
      />
      {STATUS_LABELS[status]}
    </span>
  );
}

function DepartmentBadge({ department }: { department: TeamAgent["department"] }) {
  if (!department) {
    return (
      <span className="inline-flex items-center rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-muted">
        Без отдела
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
      {DEPARTMENT_LABELS[department]}
    </span>
  );
}

function AgentCard({ agent }: { agent: TeamAgent }) {
  return (
    <div
      className="group flex items-start gap-4 rounded-2xl border border-line bg-elevated p-5 shadow-card transition"
      title="Карточка появится в следующем обновлении"
      style={{ cursor: "not-allowed" }}
    >
      {agent.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={agent.avatar_url}
          alt={agent.display_name}
          className="h-14 w-14 flex-shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="inline-flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <User size={26} />
        </span>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
            {agent.display_name}
          </h3>
          <StatusDot status={agent.status} />
        </div>
        {agent.role_title && (
          <p className="mt-1 text-sm text-ink-muted">{agent.role_title}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <DepartmentBadge department={agent.department} />
          {agent.autonomy_level === 1 && (
            <span
              className="inline-flex items-center rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-muted"
              title="Может предлагать самозадачи"
            >
              Автономен
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StaffWorkspace() {
  const [statusFilter, setStatusFilter] = useState<AgentStatus | "all">("active");
  const [agents, setAgents] = useState<TeamAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listAgents(statusFilter)
      .then((items) => {
        if (cancelled) return;
        setAgents(items);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Не удалось получить список агентов");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [statusFilter]);

  const isEmpty = useMemo(() => !loading && !error && agents.length === 0, [loading, error, agents.length]);

  return (
    <div className="mt-8 flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-line bg-elevated p-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => setStatusFilter(tab.value)}
              className={`focus-ring rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                statusFilter === tab.value
                  ? "bg-accent text-surface shadow-card"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled
          title="Появится в следующем обновлении"
          className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line bg-elevated px-4 py-2 text-sm font-semibold text-ink-muted opacity-60"
        >
          <Plus size={16} />
          Добавить сотрудника
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 rounded-2xl border border-line bg-elevated p-6 text-sm text-ink-muted">
          <Loader2 size={16} className="animate-spin" />
          Загружаем список агентов…
        </div>
      )}

      {error && !loading && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-400/50 bg-amber-50/40 p-5 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Не удалось загрузить агентов</p>
            <p className="mt-1 opacity-80">{error}</p>
          </div>
        </div>
      )}

      {isEmpty && (
        <div className="max-w-2xl rounded-2xl border border-line bg-elevated p-6 shadow-card">
          <h2 className="font-display text-xl font-semibold tracking-tight">
            Сотрудники
          </h2>
          <p className="mt-2 text-sm text-ink-muted">
            {statusFilter === "archived"
              ? "В архиве пока никого нет."
              : "В команде пока нет агентов. Добавьте первого сотрудника через мастер создания."}
          </p>
          <button
            type="button"
            disabled
            title="Появится в следующем обновлении"
            className="focus-ring mt-4 inline-flex items-center gap-2 rounded-xl border border-line bg-canvas px-4 py-2 text-sm font-semibold text-ink-muted opacity-60"
          >
            <Plus size={16} />
            Добавить сотрудника
          </button>
        </div>
      )}

      {!loading && !error && agents.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  );
}
