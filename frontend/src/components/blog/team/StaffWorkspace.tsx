"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  Lightbulb,
  Loader2,
  Plus,
  Sparkles,
  User,
} from "lucide-react";
import {
  DEPARTMENT_LABELS,
  listAgents,
  STATUS_LABELS,
  type AgentStatus,
  type TeamAgent,
} from "@/lib/team/teamAgentsService";
import { fetchCandidates } from "@/lib/team/teamMemoryService";
import { fetchAgentTools } from "@/lib/team/teamBackendClient";
import TaskCreationModal from "./TaskCreationModal";

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

function AgentCard({
  agent,
  toolsCount,
  onLaunchTask,
}: {
  agent: TeamAgent;
  toolsCount?: number;
  onLaunchTask?: (agentId: string) => void;
}) {
  const templatesCount = Array.isArray(agent.allowed_task_templates)
    ? agent.allowed_task_templates.length
    : 0;
  // Сессия 19: бейдж шаблонов. Пустой allowed = «все» (на бэкенде валидация
  // пропускает). 0 == «все», но Влад не различит «не настроил» и «специально
  // все»; UI явно говорит «Все шаблоны» для нулевого случая.
  const templatesBadge =
    templatesCount === 0
      ? { label: "Все шаблоны", warn: false }
      : { label: `${templatesCount} ${pluralizeTemplates(templatesCount)}`, warn: false };

  return (
    <div className="group relative flex items-start gap-4 rounded-2xl border border-line bg-elevated p-5 shadow-card transition hover:border-line-strong hover:shadow-lg">
      <Link
        href={`/blog/team/staff/${encodeURIComponent(agent.id)}`}
        className="focus-ring absolute inset-0 rounded-2xl"
        aria-label={`Открыть карточку ${agent.display_name}`}
      />
      {agent.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={agent.avatar_url}
          alt={agent.display_name}
          className="relative h-14 w-14 flex-shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="relative inline-flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
          <User size={26} />
        </span>
      )}

      <div className="relative min-w-0 flex-1">
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
          {/* Сессия 23: бейдж «🎯 Инициативный» для агентов с
              autonomy_level=1. Заменяет старый «Автономен», чтобы UI
              был единым с инструкцией в Сессии 23. */}
          {agent.autonomy_level === 1 && (
            <span
              className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent"
              title="Может предлагать задачи сам (cron и событийные триггеры)"
            >
              🎯 Инициативный
            </span>
          )}
          <span
            className={
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs " +
              (templatesBadge.warn
                ? "bg-amber-50 text-amber-800"
                : "bg-canvas text-ink-muted")
            }
            title={
              templatesCount === 0
                ? "Не настроено ограничение — разрешены все шаблоны задач"
                : `Разрешённых шаблонов задач: ${templatesCount}`
            }
          >
            {templatesBadge.label}
          </span>
          {/* Сессия 21: счётчик инструментов. Показываем только если данные
              подтянулись (toolsCount !== undefined). */}
          {typeof toolsCount === "number" && (
            <span
              className="inline-flex items-center rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-muted"
              title={
                toolsCount === 0
                  ? "Инструменты не привязаны — Awareness без секции «Инструменты»."
                  : `Привязано инструментов: ${toolsCount}`
              }
            >
              {toolsCount === 0
                ? "Нет инструментов"
                : `${toolsCount} ${pluralizeTools(toolsCount)}`}
            </span>
          )}
          {/* Сессия 19: «Поставить задачу» на карточке. Кнопка приподнята
              z-index'ом над <Link>-оверлеем, чтобы клик не уходил на ссылку. */}
          {onLaunchTask && agent.status !== "archived" && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onLaunchTask(agent.id);
              }}
              className="focus-ring relative z-10 ml-auto inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-ink-muted transition hover:border-accent hover:text-accent"
              title="Поставить задачу этому сотруднику"
            >
              <Sparkles size={12} />
              Поставить задачу
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function pluralizeTemplates(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "шаблонов";
  if (mod10 === 1) return "шаблон";
  if (mod10 >= 2 && mod10 <= 4) return "шаблона";
  return "шаблонов";
}

function pluralizeTools(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "инструментов";
  if (mod10 === 1) return "инструмент";
  if (mod10 >= 2 && mod10 <= 4) return "инструмента";
  return "инструментов";
}

export default function StaffWorkspace() {
  const [statusFilter, setStatusFilter] = useState<AgentStatus | "all">("active");
  const [agents, setAgents] = useState<TeamAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Сессия 15: счётчик pending-кандидатов в правила для бейджа на ссылке
  // «Кандидаты в правила». Загружаем один раз вместе с списком агентов;
  // повторно не поллим — экран открывается редко.
  const [candidatesCount, setCandidatesCount] = useState<number | null>(null);
  // Сессия 19: модалка постановки задачи с preset'ом конкретного агента.
  const [launchForAgent, setLaunchForAgent] = useState<string | null>(null);
  // Сессия 21: счётчик инструментов на каждой карточке (опц., если запрос
  // упал — карточка просто не покажет бейдж).
  const [toolsCountByAgent, setToolsCountByAgent] = useState<Map<string, number>>(
    new Map(),
  );

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

  // Кандидаты — отдельный запрос. Ошибки игнорируем (если бэкенд старый или
  // эпизодов ещё нет — просто скрываем бейдж).
  useEffect(() => {
    let cancelled = false;
    fetchCandidates({ pendingOnly: true })
      .then((items) => {
        if (!cancelled) setCandidatesCount(items.length);
      })
      .catch(() => {
        if (!cancelled) setCandidatesCount(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Сессия 21: подтягиваем счётчик инструментов на каждого активного агента.
  // Запросы параллельные; провалившиеся просто не дают бейдж.
  useEffect(() => {
    if (agents.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        agents.map(async (a) => {
          try {
            const tools = await fetchAgentTools(a.id);
            return [a.id, tools.length] as const;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      const next = new Map<string, number>();
      for (const entry of entries) {
        if (entry) next.set(entry[0], entry[1]);
      }
      setToolsCountByAgent(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [agents]);

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

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/blog/team/staff/candidates"
            className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-muted shadow-card transition hover:border-line-strong hover:text-ink"
            title="Сжатие эпизодов обратной связи в новые правила Memory"
          >
            <Lightbulb size={16} />
            Кандидаты в правила
            {typeof candidatesCount === "number" && candidatesCount > 0 && (
              <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-surface">
                {candidatesCount}
              </span>
            )}
          </Link>
          {/* Сессия 27: ссылка на экран кандидатов в навыки. Без счётчика
              на этом этапе — данные приходят через тот же fetchCandidates,
              а отдельный poll skill-кандидатов добавим, если будет нужно. */}
          <Link
            href="/blog/team/staff/skill-candidates"
            className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink-muted shadow-card transition hover:border-line-strong hover:text-ink"
            title="Извлечённые из задач паттерны на одобрение"
          >
            🎓 Кандидаты в навыки
          </Link>
          <Link
            href="/blog/team/staff/create"
            className="focus-ring inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-surface shadow-card transition hover:bg-accent-hover"
          >
            <Plus size={16} />
            Добавить сотрудника
          </Link>
        </div>
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
          <Link
            href="/blog/team/staff/create"
            className="focus-ring mt-4 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-surface shadow-card transition hover:bg-accent-hover"
          >
            <Plus size={16} />
            Добавить сотрудника
          </Link>
        </div>
      )}

      {!loading && !error && agents.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent) => (
            <AgentCard
              key={agent.id}
              agent={agent}
              toolsCount={toolsCountByAgent.get(agent.id)}
              onLaunchTask={(id) => setLaunchForAgent(id)}
            />
          ))}
        </div>
      )}

      {launchForAgent && (
        <TaskCreationModal
          open
          presetAgentId={launchForAgent}
          onClose={() => setLaunchForAgent(null)}
          onCreated={() => setLaunchForAgent(null)}
        />
      )}
    </div>
  );
}
