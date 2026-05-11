"use client";

import { ArrowLeftFromLine, Cpu, GitBranch, Loader2, User } from "lucide-react";
import type { TeamTask } from "@/lib/team/types";
import type { TeamAgent } from "@/lib/team/teamAgentsService";
import type { TeamProject } from "@/lib/team/teamBackendClient";
import { formatUsd } from "@/lib/team/format";
import { formatRelative, statusBadge, taskTypeLabel } from "./taskTypeMeta";

interface TaskCardProps {
  task: TeamTask;
  onClick: () => void;
  // Сессия 16: справочники, чтобы показать имя агента и плашку проекта
  // на карточке. Оба опциональны — без них отрисуем без этих элементов.
  agentsById?: Map<string, TeamAgent>;
  projectsById?: Map<string, TeamProject>;
}

// Карточка одной задачи в канбане. Стиль повторяет TeamSectionCard и
// TeamStatTile из Сессии 28: rounded-xl + border, hover-эффект — приподнимается.
// Цветовое кодирование статуса — через бейдж сверху.
export default function TaskCard({
  task,
  onClick,
  agentsById,
  projectsById,
}: TaskCardProps) {
  const badge = statusBadge(task.status);
  const isRunning = task.status === "running";
  const isError = task.status === "error";

  // Превью результата: первые ~200 символов из result, очищенные от
  // markdown-разметки (## заголовки, **жирность* и т.д.) — на карточке нужен
  // чистый текст. Полный результат открывается в TaskViewerModal.
  const preview = task.result ? stripMarkdown(task.result).slice(0, 220) : null;

  // Сессия 16: справочники имени агента и проекта для подписи под заголовком.
  const agent = task.agentId ? agentsById?.get(task.agentId) ?? null : null;
  const project = task.projectId ? projectsById?.get(task.projectId) ?? null : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="focus-ring group flex w-full flex-col gap-3 rounded-xl border border-line bg-surface p-4 text-left transition hover:-translate-y-[1px] hover:border-line-strong hover:shadow-card"
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide " +
            badge.className
          }
        >
          {isRunning && <Loader2 size={10} className="animate-spin" />}
          {badge.label}
        </span>
        <span className="text-xs text-ink-faint">{formatRelative(task.createdAt)}</span>
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
          {taskTypeLabel(task.type)}
        </p>
        <h3 className="line-clamp-2 font-display text-base font-semibold leading-snug tracking-tight text-ink">
          {task.title || "(без названия)"}
        </h3>
        {/* Сессия 16: подпись агента + проект. Только если переданы
            справочники. Project с db_type, name отдаём как chip. */}
        {(agent || project || task.agentId) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px]">
            {(agent || task.agentId) && (
              <span className="inline-flex items-center gap-1 text-ink-muted">
                <User size={11} />
                {agent?.display_name ?? task.agentId}
              </span>
            )}
            {project ? (
              <span className="inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 font-medium text-accent">
                {project.name}
              </span>
            ) : task.projectId === null && task.agentId ? (
              <span className="inline-flex items-center rounded-full bg-canvas px-2 py-0.5 text-ink-muted">
                ⚪ Без проекта
              </span>
            ) : null}
          </div>
        )}
        {/* Сессия 13: визуальные пометки цепочки задач. ← для дочерней,
            🔗 если агент в финале предложил передать дальше. Подробности —
            в TaskViewerModal. */}
        {(task.parentTaskId ||
          (task.suggestedNextSteps && task.suggestedNextSteps.length > 0)) && (
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-faint">
            {task.parentTaskId && (
              <span
                className="inline-flex items-center gap-1"
                title="Задача — продолжение цепочки"
              >
                <ArrowLeftFromLine size={11} />
                из задачи
              </span>
            )}
            {task.suggestedNextSteps && task.suggestedNextSteps.length > 0 && (
              <span
                className="inline-flex items-center gap-1"
                title={`Агент предложил передать дальше (${task.suggestedNextSteps.length})`}
              >
                <GitBranch size={11} />
                есть предложение
              </span>
            )}
          </div>
        )}
      </div>

      {isRunning && !preview && (
        <p className="text-xs text-ink-muted">Ждём ответ модели…</p>
      )}

      {isError && task.error && (
        <p className="line-clamp-3 rounded-lg bg-rose-50 px-2 py-1.5 text-xs text-rose-800">
          {task.error}
        </p>
      )}

      {preview && (
        <p className="line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-ink-muted">
          {preview}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between text-xs text-ink-faint">
        <span className="inline-flex items-center gap-1">
          <Cpu size={12} />
          {task.model || task.provider || "—"}
        </span>
        {typeof task.costUsd === "number" && task.costUsd > 0 && (
          <span className="font-medium text-ink-muted">{formatUsd(task.costUsd)}</span>
        )}
      </div>
    </button>
  );
}

// Простая чистка для preview карточки. Не рендерит markdown — просто
// убирает «#», «*», «—», коды и блоки. Для полного рендера используется
// react-markdown в TaskViewerModal.
function stripMarkdown(input: string): string {
  return input
    .replace(/```[\s\S]*?```/g, "[код]")
    .replace(/`[^`]+`/g, (m) => m.slice(1, -1))
    .replace(/^#+\s*/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^[-*]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
