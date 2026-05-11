"use client";

import { Inbox, User } from "lucide-react";
import type { TeamAgent } from "@/lib/team/teamAgentsService";
import type { TeamTask } from "@/lib/team/types";

// Сессия 16 этапа 2: компактный ряд аватаров активных сотрудников.
// Под каждым — что агент делает в моменте (есть running-задача или свободен).
// Клик переключает фильтр лога на этого агента.

interface Props {
  agents: TeamAgent[];
  tasks: TeamTask[];
  selected: string | "all";
  onSelect: (agentId: string | "all") => void;
}

export default function ActiveAgentsRow({ agents, tasks, selected, onSelect }: Props) {
  if (agents.length === 0) return null;

  return (
    <section className="flex flex-wrap gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
      <button
        type="button"
        onClick={() => onSelect("all")}
        className={`focus-ring inline-flex flex-col items-center gap-1 rounded-lg border px-3 py-2 transition ${
          selected === "all"
            ? "border-accent bg-accent-soft"
            : "border-transparent hover:border-line"
        }`}
        title="Показать всех"
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-elevated text-ink-muted">
          <Inbox size={16} />
        </span>
        <span className="text-[11px] text-ink-muted">Все</span>
      </button>
      {agents.map((a) => {
        const running = tasks.find(
          (t) => t.agentId === a.id && t.status === "running",
        );
        const isSelected = selected === a.id;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a.id)}
            title={a.role_title ?? a.display_name}
            className={`focus-ring inline-flex flex-col items-center gap-1 rounded-lg border px-3 py-2 transition ${
              isSelected
                ? "border-accent bg-accent-soft"
                : "border-transparent hover:border-line"
            }`}
          >
            <Avatar agent={a} />
            <span className="text-[11px] font-medium text-ink">{a.display_name}</span>
            <span className="text-[10px] leading-tight text-ink-muted">
              {running ? "работает" : "свободен"}
            </span>
          </button>
        );
      })}
    </section>
  );
}

function Avatar({ agent }: { agent: TeamAgent }) {
  if (agent.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={agent.avatar_url}
        alt={agent.display_name}
        className="h-9 w-9 rounded-full object-cover"
      />
    );
  }
  // Заглушка — буква + цветной фон.
  const initial = (agent.display_name?.[0] ?? "?").toUpperCase();
  return (
    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent">
      {initial || <User size={14} />}
    </span>
  );
}
