"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  User,
  X,
} from "lucide-react";
import { listAgents, type TeamAgent } from "@/lib/team/teamAgentsService";
import TaskRunnerModal from "./TaskRunnerModal";
import { taskTypeLabel } from "./taskTypeMeta";

// Сессия 17 этапа 2: трёхшаговый мастер постановки задачи.
//
//   Шаг 1 — выбор сотрудника. Если у текущего открытия задан presetAgentId
//           (вход из карточки сотрудника), шаг пропускается.
//   Шаг 2 — выбор шаблона задачи из allowed_task_templates агента.
//           Если allowed пуст — показываем все 5 шаблонов команды.
//           Если у агента ровно один разрешённый шаблон — пропускаем шаг.
//   Шаг 3 — открываем существующий TaskRunnerModal с preset'ом agentId
//           и taskType. Все поля формы — там.
//
// Этот компонент — тонкая обёртка: всю «настоящую» форму держит
// TaskRunnerModal (поля по типу задачи, проект, превью промпта, модель).

interface TaskCreationModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (taskId: string) => void;
  // Если задан — пропускаем шаг 1 и стартуем сразу с шаблона.
  presetAgentId?: string | null;
}

// Каталог имён шаблонов для UI шага 2 (фронт-only, чтобы не дёргать
// /api/team/tasks/templates лишний раз — список фиксированный до Сессии 25+).
const TEMPLATE_META: Record<string, { title: string; description: string }> = {
  research_direct: {
    title: "Исследовать напрямую",
    description: "Дать ссылку или PDF — получить структурированный разбор",
  },
  ideas_questions_for_research: {
    title: "Идеи и вопросы (под исследование)",
    description: "Сформулировать список вопросов для исследования темы",
  },
  ideas_free: {
    title: "Идеи и вопросы (свободные)",
    description: "Свободный мозговой штурм без привязки к исследованию",
  },
  write_text: {
    title: "Написать текст",
    description: "Собрать готовый текст из идеи и подключённых источников",
  },
  // Сессия 35: задачи разведчика. Доступны только тем агентам, у которых
  // эти типы в allowed_task_templates (UI карточки сотрудника).
  analyze_competitor: {
    title: "Анализ конкурента",
    description: "Разбор контента блогера-конкурента из базы (форматы, хуки, темы)",
  },
  search_trends: {
    title: "Поиск трендов",
    description: "Свежие тренды в нише через Web Search с привязкой к Goals",
  },
  free_research: {
    title: "Свободный ресёрч",
    description: "Произвольный поиск/анализ с использованием инструментов агента",
  },
  // Сессия 37: задачи предпродакшна (исследователь / сценарист / фактчекер / шеф).
  deep_research_notebooklm: {
    title: "Глубокий ресёрч через NotebookLM",
    description: "Многошаговое исследование по подгруженным в Notebook источникам",
  },
  web_research: {
    title: "Ресёрч через Web Search",
    description: "Поиск источников и фактуры по теме с цитатами",
  },
  free_research_with_files: {
    title: "Свободный ресёрч с файлами",
    description: "Анализ прикреплённых PDF/материалов по заданию Влада",
  },
  find_cross_references: {
    title: "Поиск пересечений в базах",
    description: "Какие записи из баз команды пересекаются с темой",
  },
  video_plan_from_research: {
    title: "План видео по ресёрчу",
    description: "Структура видео (хук / основные точки / концовка) из артефакта исследования",
  },
  creative_takes: {
    title: "Креативные решения подачи",
    description: "Минимум 3 альтернативные подачи темы через приёмы",
  },
  script_draft: {
    title: "Драфт сценарного текста",
    description: "Рабочий полуфабрикат текста (не финал) — для последующей переработки Владом",
  },
  factcheck_artifact: {
    title: "Проверка артефакта по фактам",
    description: "Утверждение → источник → статус по каждой фактической строчке",
  },
  compare_two_versions: {
    title: "Сверка двух версий",
    description: "Сравнение версий A и B текста по фактической стороне",
  },
  cold_factcheck: {
    title: "Холодный фактчек",
    description: "Проверка отдельных утверждений без контекста — только Web Search",
  },
  generate_ideas: {
    title: "Генерация идей",
    description: "5+ идей видео под текущий фокус периода (Goals)",
  },
  review_artifact: {
    title: "Ревью артефакта",
    description: "Оценка плана/драфта/ресёрча по 5 критериям",
  },
  daily_plan_breakdown: {
    title: "Декомпозиция плана дня",
    description: "Раскладка общего плана дня на задачи для команды",
  },
};
const ALL_TASK_TYPES = Object.keys(TEMPLATE_META);

export default function TaskCreationModal({
  open,
  onClose,
  onCreated,
  presetAgentId = null,
}: TaskCreationModalProps) {
  const [step, setStep] = useState<"agent" | "template" | "form">("agent");
  const [agents, setAgents] = useState<TeamAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [agentsError, setAgentsError] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedTaskType, setSelectedTaskType] = useState<string | null>(null);

  // Сброс при открытии. При presetAgentId сразу шаг 2.
  useEffect(() => {
    if (!open) return;
    setStep(presetAgentId ? "template" : "agent");
    setSelectedAgentId(presetAgentId ?? null);
    setSelectedTaskType(null);
  }, [open, presetAgentId]);

  // Загружаем активных агентов.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAgentsLoading(true);
    setAgentsError(null);
    listAgents("active")
      .then((items) => {
        if (cancelled) return;
        setAgents(items);
        setAgentsLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAgentsError(err instanceof Error ? err.message : String(err));
        setAgentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedAgent = useMemo(
    () => agents.find((a) => a.id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  // Список шаблонов, доступных текущему агенту. Пустой allowed = «все».
  const allowedTaskTypes = useMemo(() => {
    if (!selectedAgent) return ALL_TASK_TYPES;
    const allowed = selectedAgent.allowed_task_templates ?? [];
    if (!Array.isArray(allowed) || allowed.length === 0) return ALL_TASK_TYPES;
    return allowed.filter((t) => ALL_TASK_TYPES.includes(t));
  }, [selectedAgent]);

  // Esc + блокировка скролла фона.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  // Шаг 3 — отдаём управление существующему TaskRunnerModal. Чтобы
  // пользователь мог вернуться назад, мы НЕ закрываем эту модалку,
  // а монтируем TaskRunnerModal поверх.
  if (step === "form" && selectedAgentId && selectedTaskType) {
    const meta = TEMPLATE_META[selectedTaskType];
    return (
      <TaskRunnerModal
        open
        taskType={selectedTaskType}
        taskTitle={meta?.title ?? selectedTaskType}
        presetAgentId={selectedAgentId}
        onClose={onClose}
        onCreated={onCreated}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={onClose}
        role="presentation"
      />
      <div className="relative z-10 flex h-full max-h-screen w-full max-w-2xl flex-col overflow-hidden bg-surface shadow-pop sm:h-auto sm:max-h-[90vh] sm:rounded-2xl sm:border sm:border-line">
        <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Поставить задачу
            </p>
            <h2 className="mt-0.5 font-display text-lg font-semibold tracking-tight">
              {step === "agent" ? "Шаг 1. Выбор сотрудника" : "Шаг 2. Тип задачи"}
            </h2>
            {step === "template" && selectedAgent && (
              <p className="mt-1 text-sm text-ink-muted">
                Для {selectedAgent.display_name}
                {selectedAgent.role_title ? ` · ${selectedAgent.role_title}` : ""}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted transition hover:bg-elevated hover:text-ink"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === "agent" && (
            <AgentStep
              loading={agentsLoading}
              error={agentsError}
              agents={agents}
              onPick={(id) => {
                setSelectedAgentId(id);
                // Если у агента ровно один шаблон — пропускаем шаг 2.
                const ag = agents.find((a) => a.id === id);
                const allowed = ag?.allowed_task_templates ?? [];
                if (Array.isArray(allowed) && allowed.length === 1) {
                  setSelectedTaskType(allowed[0]);
                  setStep("form");
                } else {
                  setStep("template");
                }
              }}
            />
          )}
          {step === "template" && (
            <TemplateStep
              taskTypes={allowedTaskTypes}
              onPick={(t) => {
                setSelectedTaskType(t);
                setStep("form");
              }}
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-line bg-elevated/40 px-6 py-3">
          {step === "template" && !presetAgentId ? (
            <button
              type="button"
              onClick={() => setStep("agent")}
              className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink-muted transition hover:border-line-strong hover:text-ink"
            >
              <ArrowLeft size={14} />
              К выбору сотрудника
            </button>
          ) : (
            <span />
          )}
          <p className="text-xs text-ink-faint">
            Шаг {step === "agent" ? "1" : "2"} из 3
          </p>
        </div>
      </div>
    </div>
  );
}

function AgentStep({
  loading,
  error,
  agents,
  onPick,
}: {
  loading: boolean;
  error: string | null;
  agents: TeamAgent[];
  onPick: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="inline-flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 size={14} className="animate-spin" /> Загружаем сотрудников…
      </div>
    );
  }
  if (error) {
    return (
      <p className="inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
        <AlertTriangle size={14} /> {error}
      </p>
    );
  }
  if (agents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-elevated/40 p-6 text-center">
        <p className="text-sm font-medium text-ink-muted">
          Сотрудники ещё не созданы. Добавьте первого в разделе{" "}
          <a href="/blog/team/staff" className="text-accent hover:underline">
            Сотрудники
          </a>
          .
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {agents.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onPick(a.id)}
          className="focus-ring flex items-start gap-3 rounded-xl border border-line bg-surface p-4 text-left transition hover:-translate-y-[1px] hover:border-accent hover:shadow-card"
        >
          <Avatar agent={a} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-base font-semibold tracking-tight text-ink">
              {a.display_name}
            </p>
            {a.role_title && (
              <p className="mt-0.5 text-sm text-ink-muted">{a.role_title}</p>
            )}
            <p className="mt-1.5 text-xs text-ink-faint">
              Шаблонов:{" "}
              {a.allowed_task_templates && a.allowed_task_templates.length > 0
                ? a.allowed_task_templates.length
                : "все"}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}

function TemplateStep({
  taskTypes,
  onPick,
}: {
  taskTypes: string[];
  onPick: (taskType: string) => void;
}) {
  if (taskTypes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-elevated/40 p-6 text-center">
        <p className="text-sm font-medium text-ink-muted">
          У этого сотрудника нет доступных шаблонов задач. Откройте карточку и
          настройте «Шаблоны задач» в секции «Доступы».
        </p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {taskTypes.map((t) => {
        const meta = TEMPLATE_META[t] ?? {
          title: taskTypeLabel(t),
          description: "",
        };
        return (
          <button
            key={t}
            type="button"
            onClick={() => onPick(t)}
            className="focus-ring flex flex-col items-start gap-1.5 rounded-xl border border-line bg-surface p-4 text-left transition hover:-translate-y-[1px] hover:border-accent hover:shadow-card"
          >
            <h4 className="font-display text-base font-semibold tracking-tight text-ink">
              {meta.title}
            </h4>
            <p className="text-sm text-ink-muted">{meta.description}</p>
            <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-accent">
              Открыть форму <ArrowRight size={12} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Avatar({ agent }: { agent: TeamAgent }) {
  if (agent.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={agent.avatar_url}
        alt={agent.display_name}
        className="h-12 w-12 rounded-full object-cover"
      />
    );
  }
  const initial = (agent.display_name?.[0] ?? "?").toUpperCase();
  return (
    <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-base font-semibold text-accent">
      {initial || <User size={16} />}
    </span>
  );
}
