"use client";

import { Lightbulb, MessageSquareQuote, Search, FileEdit } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ActionGridProps {
  // Запускает модалку TaskRunnerModal с этим типом задачи. taskTitle нужен,
  // чтобы шапка модалки показала его сразу, без дополнительного запроса.
  onLaunch: (taskType: string, taskTitle: string) => void;
}

interface ActionMeta {
  taskType: string;
  title: string;
  description: string;
  icon: LucideIcon;
}

// Группа «Исследование» — про сбор и переработку чужого материала.
// Группа «Производство» — про создание нового своего материала.
// Соответствует сценариям ДК Лурье и архитектурного документа Сессии 6.
const RESEARCH: ActionMeta[] = [
  {
    taskType: "research_direct",
    title: "Исследовать напрямую",
    description: "Дать ссылку или PDF — получить структурированный разбор по вопросу",
    icon: Search,
  },
];

const PRODUCTION: ActionMeta[] = [
  {
    taskType: "ideas_questions_for_research",
    title: "Идеи и вопросы (под исследование)",
    description: "Сформулировать список вопросов для будущего исследования темы",
    icon: MessageSquareQuote,
  },
  {
    taskType: "ideas_free",
    title: "Идеи и вопросы (свободные)",
    description: "Свободный мозговой штурм без привязки к исследованию",
    icon: Lightbulb,
  },
  {
    taskType: "write_text",
    title: "Написать текст",
    description: "Собрать готовый текст из идеи и подключённых источников",
    icon: FileEdit,
  },
];

export default function ActionGrid({ onLaunch }: ActionGridProps) {
  return (
    <div className="flex flex-col gap-6">
      <Section title="Исследование" actions={RESEARCH} onLaunch={onLaunch} />
      <Section title="Производство" actions={PRODUCTION} onLaunch={onLaunch} />
    </div>
  );
}

function Section({
  title,
  actions,
  onLaunch,
}: {
  title: string;
  actions: ActionMeta[];
  onLaunch: (taskType: string, taskTitle: string) => void;
}) {
  return (
    <div>
      <h3 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">
        {title}
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {actions.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.taskType}
              type="button"
              onClick={() => onLaunch(a.taskType, a.title)}
              className="focus-ring group flex flex-col gap-2 rounded-2xl border border-line bg-surface p-4 text-left transition hover:-translate-y-[1px] hover:border-accent hover:shadow-card"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent transition group-hover:bg-accent group-hover:text-surface">
                <Icon size={20} />
              </span>
              <h4 className="font-display text-base font-semibold tracking-tight text-ink">
                {a.title}
              </h4>
              <p className="text-sm text-ink-muted">{a.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
