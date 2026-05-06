"use client";

import { useEffect, useState } from "react";
import { Activity, DollarSign } from "lucide-react";
import type { TeamTask } from "@/lib/team/types";
import { fetchSpendingLastNDays } from "@/lib/team/teamSpendingService";
import { formatUsd, pluralize } from "@/lib/team/format";

interface ToolsHeaderProps {
  tasks: TeamTask[];
}

// Сводка вверху страницы Инструменты: «Сегодня задач: N · Потрачено: $X».
// Расходы поллим раз в 30 секунд (отдельно от поллинга задач — там 3 сек).
// «Сегодня» считаем от полуночи локального времени.
export default function ToolsHeader({ tasks }: ToolsHeaderProps) {
  const [spending, setSpending] = useState<number>(0);
  const [spendingLoading, setSpendingLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load() {
      try {
        // Берём за день — компонент позиционируется как «сегодняшний прогресс».
        const value = await fetchSpendingLastNDays(1);
        if (!cancelled) {
          setSpending(value);
          setSpendingLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("[team] не удалось загрузить расходы:", err);
          setSpendingLoading(false);
        }
      }
    }
    void load();
    timer = setInterval(load, 30_000);

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  const todayTasks = tasks.filter((t) => isToday(t.createdAt)).length;
  const activeNow = tasks.filter((t) => t.status === "running").length;

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl border border-line bg-elevated/40 px-5 py-4">
      <Stat
        icon={<Activity size={18} className="text-accent" />}
        label="Сегодня задач"
        value={`${todayTasks}`}
        hint={
          activeNow > 0
            ? `${activeNow} ${pluralize(activeNow, ["в работе", "в работе", "в работе"])}`
            : "новых нет"
        }
      />
      <Stat
        icon={<DollarSign size={18} className="text-accent" />}
        label="Потрачено за сутки"
        value={spendingLoading ? "—" : formatUsd(spending)}
        hint="включая Whisper и AI-правки"
      />
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-surface">
        {icon}
      </span>
      <div className="leading-tight">
        <p className="text-xs uppercase tracking-wide text-ink-faint">{label}</p>
        <p className="font-display text-xl font-semibold tracking-tight text-ink">
          {value}
        </p>
        {hint && <p className="text-xs text-ink-faint">{hint}</p>}
      </div>
    </div>
  );
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}
