"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeftFromLine,
  Cpu,
  GitBranch,
  Link2,
  Loader2,
  Maximize2,
  User,
} from "lucide-react";
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

// Сессия 43: префикс для копируемой ссылки. Берём из public ENV
// (NEXT_PUBLIC_SITE_URL), а если не задан — из window.location.origin.
function taskShareUrl(taskId: string): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (envUrl) return `${envUrl}/blog/team/tasks/${taskId}`;
  if (typeof window !== "undefined") {
    return `${window.location.origin}/blog/team/tasks/${taskId}`;
  }
  return `/blog/team/tasks/${taskId}`;
}

// Карточка одной задачи в канбане. Стиль повторяет TeamSectionCard и
// TeamStatTile из Сессии 28: rounded-xl + border, hover-эффект — приподнимается.
// Цветовое кодирование статуса — через бейдж сверху.
//
// Сессия 43: outer — `<div>` с absolute-overlay-кнопкой; над ним сидят две
// icon-кнопки (↗ Развернуть, 🔗 Скопировать ссылку). Это позволяет иметь
// несколько кликабельных элементов в одной карточке без вложенных <button>
// (тот же приём, что в StaffWorkspace из Сессии 19).
export default function TaskCard({
  task,
  onClick,
  agentsById,
  projectsById,
}: TaskCardProps) {
  const badge = statusBadge(task.status);
  const isRunning = task.status === "running";
  const isError = task.status === "error";
  const [copied, setCopied] = useState(false);

  // Превью результата: первые ~200 символов из result, очищенные от
  // markdown-разметки (## заголовки, **жирность* и т.д.) — на карточке нужен
  // чистый текст. Полный результат открывается в TaskViewerModal.
  const preview = task.result ? stripMarkdown(task.result).slice(0, 220) : null;

  // Сессия 16: справочники имени агента и проекта для подписи под заголовком.
  const agent = task.agentId ? agentsById?.get(task.agentId) ?? null : null;
  const project = task.projectId ? projectsById?.get(task.projectId) ?? null : null;

  const handleCopyLink = async (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const url = taskShareUrl(task.id);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Если clipboard заблокирован (HTTP, права) — открываем prompt с URL,
      // чтобы Влад мог вручную скопировать.
      if (typeof window !== "undefined") window.prompt("Скопируйте ссылку:", url);
    }
  };

  return (
    <div className="group relative flex w-full flex-col gap-3 rounded-xl border border-line bg-surface p-4 transition hover:-translate-y-[1px] hover:border-line-strong hover:shadow-card">
      {/* Кликабельный overlay — открывает TaskViewerModal через onClick prop.
          z-0 чтобы icon-кнопки сверху перехватывали клики. */}
      <button
        type="button"
        onClick={onClick}
        className="focus-ring absolute inset-0 z-0 rounded-xl text-left"
        aria-label={`Открыть задачу ${task.title || task.id}`}
      />

      {/* Icon-кнопки в правом верхнем углу — поверх overlay. */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <Link
          href={`/blog/team/tasks/${task.id}`}
          onClick={(e) => e.stopPropagation()}
          title="Развернуть на отдельной странице"
          aria-label="Развернуть"
          className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border border-line bg-surface text-ink-muted hover:bg-canvas hover:text-ink"
        >
          <Maximize2 size={14} />
        </Link>
        <button
          type="button"
          onClick={handleCopyLink}
          title={copied ? "Ссылка скопирована" : "Скопировать ссылку"}
          aria-label="Скопировать ссылку"
          className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border border-line bg-surface text-ink-muted hover:bg-canvas hover:text-ink"
        >
          {copied ? (
            <span className="text-[10px] font-semibold text-emerald-600">✓</span>
          ) : (
            <Link2 size={14} />
          )}
        </button>
      </div>

      <div className="relative z-[1] flex items-start justify-between gap-2 pointer-events-none">
        <span
          className={
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide " +
            badge.className
          }
        >
          {isRunning && <Loader2 size={10} className="animate-spin" />}
          {badge.label}
        </span>
        {/* Дата уехала левее, чтобы дать место иконкам в правом углу. */}
        <span className="pr-16 text-xs text-ink-faint">{formatRelative(task.createdAt)}</span>
      </div>

      <div className="relative z-[1] flex flex-col gap-1 pointer-events-none">
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
        <p className="relative z-[1] text-xs text-ink-muted pointer-events-none">
          Ждём ответ модели…
        </p>
      )}

      {isError && task.error && (
        <p className="relative z-[1] line-clamp-3 rounded-lg bg-rose-50 px-2 py-1.5 text-xs text-rose-800 pointer-events-none">
          {task.error}
        </p>
      )}

      {preview && (
        <p className="relative z-[1] line-clamp-3 whitespace-pre-line text-sm leading-relaxed text-ink-muted pointer-events-none">
          {preview}
        </p>
      )}

      <div className="relative z-[1] mt-auto flex items-center justify-between text-xs text-ink-faint pointer-events-none">
        <span className="inline-flex items-center gap-1">
          <Cpu size={12} />
          {task.model || task.provider || "—"}
        </span>
        <span className="inline-flex items-center gap-2">
          {/* Сессия 30: индикатор self-review. Только когда есть результат
              (после второго вызова) — статусы в работе/ошибке не показываем. */}
          <SelfReviewIndicator task={task} />
          {typeof task.costUsd === "number" && task.costUsd > 0 && (
            <span className="font-medium text-ink-muted">{formatUsd(task.costUsd)}</span>
          )}
        </span>
      </div>
    </div>
  );
}

function SelfReviewIndicator({ task }: { task: { selfReviewResult?: unknown; status?: string } }) {
  const result = task.selfReviewResult as
    | { passed?: boolean; revised?: boolean; skipped?: boolean }
    | null
    | undefined;
  if (!result || result.skipped) return null;
  if (task.status === "running" || task.status === "error") return null;
  let title = "";
  let color = "";
  if (result.passed) {
    title = "Самопроверка пройдена";
    color = "text-emerald-600";
  } else if (result.revised) {
    title = "Самопроверка: пройдена с правками";
    color = "text-amber-700";
  } else {
    title = "Самопроверка не пройдена полностью";
    color = "text-rose-600";
  }
  return (
    <span title={title} className={`text-xs ${color}`} aria-label={title}>
      {result.passed ? "🔍✅" : result.revised ? "🔍⚠️" : "🔍❌"}
    </span>
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
