"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell } from "lucide-react";
import type { TeamTask } from "@/lib/team/types";
import { fetchTeamTasksFromBrowser } from "@/lib/team/teamTasksService";
import { listAgents, type TeamAgent } from "@/lib/team/teamAgentsService";
import { fetchProjects, type TeamProject } from "@/lib/team/teamBackendClient";
import StrategicBelt from "./StrategicBelt";
import ToolsHeader from "./ToolsHeader";
import ActionGrid from "./ActionGrid";
import ActiveAgentsRow from "./ActiveAgentsRow";
import KanbanLog from "./KanbanLog";
import TaskLogFilters, {
  applyTaskFilters,
  type FilterState,
} from "./TaskLogFilters";
import TaskRunnerModal from "./TaskRunnerModal";
import TaskViewerModal from "./TaskViewerModal";

interface TeamWorkspaceProps {
  initialTasks: TeamTask[];
}

// Главный клиентский компонент страницы /blog/team/dashboard.
//
// Структура (Сессия 16 этапа 2, пункт 14):
//   • Стратегический пояс — North Star, фокус периода, счётчик дней.
//   • Сводка расходов и подсчёт задач (ToolsHeader).
//   • Ряд активных сотрудников + переключатель фильтра по агенту.
//   • Сетка действий (ActionGrid) для запуска задач.
//   • Фильтры лога (агент / проект / статус / период / сортировка).
//   • Лог задач (KanbanLog).
//   • Inbox-заглушка «Требует внимания» (наполнится в Сессии 18).
//
// Поллинг каждые 3 секунды через getSupabaseBrowserClient. Все мутации идут
// через teamBackendClient оптимистично.

export default function TeamWorkspace({ initialTasks }: TeamWorkspaceProps) {
  const [tasks, setTasks] = useState<TeamTask[]>(initialTasks);
  const [runner, setRunner] = useState<{ taskType: string; title: string } | null>(null);
  const [viewerTaskId, setViewerTaskId] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  // Сессия 16: справочники для фильтров и подписей на карточках.
  // Грузим один раз — список агентов/проектов меняется реже задач.
  const [agents, setAgents] = useState<TeamAgent[]>([]);
  const [projects, setProjects] = useState<TeamProject[]>([]);

  const [filters, setFilters] = useState<FilterState>({
    agentId: "all",
    projectId: "all",
    statuses: new Set(),
    period: "all",
    sortBy: "updated",
  });

  // Синк со server-component'ом.
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  // Поллинг каждые 3 секунды через прямой Supabase.
  const pollingRef = useRef<{ inFlight: boolean }>({ inFlight: false });
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function tick() {
      if (cancelled || pollingRef.current.inFlight) return;
      pollingRef.current.inFlight = true;
      try {
        const fresh = await fetchTeamTasksFromBrowser();
        if (!cancelled) {
          setTasks(fresh);
          if (pollError) setPollError(null);
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          setPollError(message);
        }
      } finally {
        pollingRef.current.inFlight = false;
      }
    }

    void tick();
    timer = setInterval(tick, 3000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Один раз грузим агентов и проекты. Ошибки игнорируем — фильтры
  // деградируют до «без сотрудника / без проекта», лог рендерится.
  useEffect(() => {
    let cancelled = false;
    listAgents("active")
      .then((items) => {
        if (!cancelled) setAgents(items);
      })
      .catch(() => {
        if (!cancelled) setAgents([]);
      });
    fetchProjects("active")
      .then((items) => {
        if (!cancelled) setProjects(items);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleLaunch = useCallback((taskType: string, title: string) => {
    setRunner({ taskType, title });
  }, []);

  const handleTaskCreated = useCallback(
    (taskId: string) => {
      const meta = runner;
      setRunner(null);
      if (!meta) return;
      const optimistic: TeamTask = {
        id: taskId,
        type: meta.taskType,
        title: meta.title,
        status: "running",
        params: {},
        modelChoice: null,
        provider: null,
        model: null,
        prompt: null,
        promptOverrideUsed: false,
        result: null,
        artifactPath: null,
        tokens: null,
        costUsd: null,
        error: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        startedAt: null,
        finishedAt: null,
        agentId: null,
        parentTaskId: null,
        suggestedNextSteps: null,
        projectId: null,
      };
      setTasks((prev) => {
        if (prev.some((t) => t.id === taskId)) return prev;
        return [optimistic, ...prev];
      });
      setViewerTaskId(taskId);
    },
    [runner],
  );

  const handleTaskUpdated = useCallback((updated: TeamTask) => {
    setTasks((prev) => {
      const idx = prev.findIndex((t) => t.id === updated.id);
      if (idx === -1) return [updated, ...prev];
      const next = prev.slice();
      next[idx] = updated;
      return next;
    });
  }, []);

  const viewerTask = viewerTaskId ? tasks.find((t) => t.id === viewerTaskId) : null;

  // Справочники для подписей на карточках — Map'ы для O(1) lookup.
  const agentsById = useMemo(() => {
    const map = new Map<string, TeamAgent>();
    for (const a of agents) map.set(a.id, a);
    return map;
  }, [agents]);

  const projectsById = useMemo(() => {
    const map = new Map<string, TeamProject>();
    for (const p of projects) map.set(p.id, p);
    return map;
  }, [projects]);

  // Применяем фильтры (Сессия 16) — но архив всё равно идёт в KanbanLog
  // отдельной секцией, поэтому здесь не фильтруем по status='archived'.
  const filteredTasks = useMemo(
    () => applyTaskFilters(tasks, filters) as TeamTask[],
    [tasks, filters],
  );

  return (
    <div className="flex flex-col gap-6">
      <StrategicBelt />

      <ToolsHeader tasks={tasks} />

      {agents.length > 0 && (
        <ActiveAgentsRow
          agents={agents}
          tasks={tasks}
          selected={filters.agentId}
          onSelect={(id) => setFilters({ ...filters, agentId: id })}
        />
      )}

      <ActionGrid onLaunch={handleLaunch} />

      {pollError && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">
          Не удалось обновить лог: {pollError}. Показано последнее известное состояние.
        </p>
      )}

      <div className="flex flex-col gap-4">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
          Лог задач
        </h2>
        <TaskLogFilters
          agents={agents}
          projects={projects}
          state={filters}
          onChange={setFilters}
        />
        {tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-elevated/40 p-10 text-center">
            <p className="text-sm font-medium text-ink-muted">
              Пока нет задач. Запусти первую через одну из кнопок выше.
            </p>
          </div>
        ) : (
          <KanbanLog
            tasks={filteredTasks}
            onOpenTask={(t) => setViewerTaskId(t.id)}
            agentsById={agentsById}
            projectsById={projectsById}
          />
        )}
      </div>

      {/* Сессия 16: Inbox-заглушка. Реальное наполнение — в Сессии 18 (пункт 14). */}
      <section className="rounded-2xl border border-dashed border-line bg-elevated/30 px-5 py-6">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-canvas text-ink-muted">
            <Bell size={16} />
          </span>
          <div className="flex flex-col gap-1">
            <h3 className="font-display text-base font-semibold text-ink">
              Требует внимания
            </h3>
            <p className="text-sm text-ink-muted">
              Inbox внимания появится в следующей сессии: оценки задач,
              кандидаты в правила, предложения handoff и предложения задач
              от агентов будут собираться сюда.
            </p>
          </div>
        </div>
      </section>

      {runner && (
        <TaskRunnerModal
          open
          taskType={runner.taskType}
          taskTitle={runner.title}
          onClose={() => setRunner(null)}
          onCreated={handleTaskCreated}
        />
      )}

      {viewerTask && (
        <TaskViewerModal
          task={viewerTask}
          onClose={() => setViewerTaskId(null)}
          onTaskUpdated={handleTaskUpdated}
        />
      )}
    </div>
  );
}
