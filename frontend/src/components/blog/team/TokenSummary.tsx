"use client";

// Сессия 28: компактная сводка объёма промпта агента в шапке карточки.
//
// Загружает breakdown с бэкенда (Math.ceil(text.length/4)) — точный
// клиентский счёт через js-tiktoken здесь не нужен, шкала зон достаточно
// грубая (15K/25K/40K). Зато сразу видно, какой слой раздулся.

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  fetchAgentTokenSummary,
  type AgentTokenSummary,
} from "@/lib/team/teamAgentsService";
import {
  formatTokenCount,
  getTokenBadgeColor,
} from "@/lib/tokenCounter";

interface Props {
  agentId: string;
}

const LAYER_LABELS: Record<keyof AgentTokenSummary["breakdown"], string> = {
  mission: "Mission",
  role: "Role",
  goals: "Goals",
  memory: "Memory",
  skills: "Skills",
};

export default function TokenSummary({ agentId }: Props) {
  const [data, setData] = useState<AgentTokenSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchAgentTokenSummary(agentId)
      .then((res) => {
        if (cancelled) return;
        setData(res);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  if (loading) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs text-ink-muted">
        <Loader2 size={12} className="animate-spin" />
        Считаем промпт…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3 py-1.5 text-xs text-ink-faint">
        Промпт: —
      </div>
    );
  }

  const color = getTokenBadgeColor(data.total);
  const tooltip =
    "Приблизительный объём системного промпта для этого агента. " +
    "До 15K — зелёная зона. 40K+ — стоит пересмотреть Memory или вызвать Curator.";

  return (
    <div
      className="inline-flex flex-col gap-1 rounded-xl border border-line bg-canvas px-3 py-2 text-xs"
      title={tooltip}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ backgroundColor: color }}
          aria-hidden
        />
        <span className="font-medium text-ink">
          Промпт: <span style={{ color }}>{formatTokenCount(data.total)}</span>{" "}
          токенов
        </span>
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-ink-faint">
        {(Object.keys(LAYER_LABELS) as Array<keyof typeof LAYER_LABELS>).map(
          (key, idx, arr) => (
            <span key={key}>
              {LAYER_LABELS[key]}: {formatTokenCount(data.breakdown[key])}
              {idx < arr.length - 1 ? " ·" : ""}
            </span>
          ),
        )}
      </div>
    </div>
  );
}
