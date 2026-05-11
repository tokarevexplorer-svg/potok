"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TeamTask } from "@/lib/team/types";
import { fetchTeamTasksFromBrowser } from "@/lib/team/teamTasksService";
import ToolsHeader from "./ToolsHeader";
import ActionGrid from "./ActionGrid";
import KanbanLog from "./KanbanLog";
import TaskRunnerModal from "./TaskRunnerModal";
import TaskViewerModal from "./TaskViewerModal";

interface TeamWorkspaceProps {
  initialTasks: TeamTask[];
}

// Главный клиентский компонент страницы /blog/team/dashboard.
//
// Архитектурно копирует AnalystWorkspace Потока:
//   • useState инициализируется из props (server component передаёт первый
//     снапшот, чтобы пользователь увидел контент мгновенно)
//   • useEffect синкает state с props при revalidate (не критично для команды,
//     но паттерн сохраняем — на случай server-action триггеров в будущем)
//   • Поллинг каждые 3 секунды через getSupabaseBrowserClient — обновляет
//     активные карточки. Когда задача переходит в done/error/marked_done,
//     она остаётся в state, но больше не двигается без явного действия
//     пользователя.
//   • Все мутации идут через teamBackendClient оптимистично: либо обновляем
//     локально через результат API-вызова (renameTask/markDone), либо
//     дёргаем поллинг сразу после действия.
//
// Поллинг работает независимо от того, есть ли активные задачи —
// edge-инвалидация происходит на стороне бэкенда (recovery после рестарта,
// фоновая работа TaskRunner). Если нагрузка станет проблемой, можно
// поставить условие на hasActiveTasks(state).
export default function TeamWorkspace({ initialTasks }: TeamWorkspaceProps) {
  const [tasks, setTasks] = useState<TeamTask[]>(initialTasks);
  const [runner, setRunner] = useState<{ taskType: string; title: string } | null>(null);
  const [viewerTaskId, setViewerTaskId] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  // Синк со server-component'ом: если страница перезагружена, props приходят
  // свежие — обновляем state.
  useEffect(() => {
    setTasks(initialTasks);
  }, [initialTasks]);

  // Поллинг каждые 3 секунды через прямой Supabase. Между тиками не плодим
  // запросы — если предыдущий ещё не завершился, ждём.
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
          // Не очищаем уже загруженные tasks — пользователь продолжает
          // видеть последнее известное состояние, поверх — баннер ошибки.
        }
      } finally {
        pollingRef.current.inFlight = false;
      }
    }

    // Первый тик — сразу, чтобы синхронизировать state с БД на случай
    // расхождения между server-component (момент рендера) и моментом
    // монтирования клиента.
    void tick();
    timer = setInterval(tick, 3000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
    // pollError намеренно не в depлисте — мы не хотим перезапускать поллинг
    // при каждом изменении (это вызвало бы цикл).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLaunch = useCallback((taskType: string, title: string) => {
    setRunner({ taskType, title });
  }, []);

  // После создания задачи — закрываем модалку и сразу подкладываем
  // временную карточку «running», чтобы пользователь видел немедленный отклик.
  // Через ~3 секунды поллинг подменит её на реальный снапшот из БД.
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
      };
      setTasks((prev) => {
        // Если задача уже подъехала из поллинга (race) — не дублируем.
        if (prev.some((t) => t.id === taskId)) return prev;
        return [optimistic, ...prev];
      });
      // Сразу открываем viewer — пользователь увидит, как задача наполняется.
      setViewerTaskId(taskId);
    },
    [runner],
  );

  // Из TaskViewerModal приходят свежие снапшоты после действий — мерджим в
  // state и не дожидаемся следующего тика поллинга.
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

  return (
    <div className="flex flex-col gap-8">
      <ToolsHeader tasks={tasks} />

      <ActionGrid onLaunch={handleLaunch} />

      {pollError && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">
          Не удалось обновить лог: {pollError}. Показано последнее известное состояние.
        </p>
      )}

      <div>
        <h2 className="mb-4 font-display text-xl font-semibold tracking-tight text-ink">
          Лог задач
        </h2>
        {tasks.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-line bg-elevated/40 p-10 text-center">
            <p className="text-sm font-medium text-ink-muted">
              Пока нет задач. Запусти первую через одну из кнопок выше.
            </p>
          </div>
        ) : (
          <KanbanLog tasks={tasks} onOpenTask={(t) => setViewerTaskId(t.id)} />
        )}
      </div>

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
