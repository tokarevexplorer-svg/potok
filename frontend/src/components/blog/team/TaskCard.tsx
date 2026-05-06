"use client";

import { Cpu, Loader2 } from "lucide-react";
import type { TeamTask } from "@/lib/team/types";
import { formatUsd } from "@/lib/team/format";
import { formatRelative, statusBadge, taskTypeLabel } from "./taskTypeMeta";

interface TaskCardProps {
  task: TeamTask;
  onClick: () => void;
}

// Карточка одной задачи в канбане. Стиль повторяет TeamSectionCard и
// TeamStatTile из Сессии 28: rounded-xl + border, hover-эффект — приподнимается.
// Цветовое кодирование статуса — через бейдж сверху.
export default function TaskCard({ task, onClick }: TaskCardProps) {
  const badge = statusBadge(task.status);
  const isRunning = task.status === "running";
  const isError = task.status === "error";

  // Превью результата: первые ~200 символов из result, очищенные от
  // markdown-разметки (## заголовки, **жирность* и т.д.) — на карточке нужен
  // чистый текст. Полный результат открывается в TaskViewerModal.
  const preview = task.result ? stripMarkdown(task.result).slice(0, 220) : null;

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
