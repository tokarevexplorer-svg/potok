"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  GitBranch,
  Loader2,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import {
  acceptProposal,
  fetchProposals,
  rejectProposal,
  type TeamProposal,
} from "@/lib/team/teamBackendClient";
import { listAgents, type TeamAgent } from "@/lib/team/teamAgentsService";

// Сессия 23 этапа 2: панель pending-предложений от автономных агентов.
//
// Поведение:
//   • Список pending-предложений сверху (urgent = ⚡ — приоритетом).
//   • Каждая карточка показывает what / why / стоимость / время Влада.
//   • Кнопки «Принять» и «Отклонить» — inline. accept создаёт реальную
//     задачу (бэкенд возвращает task_id), reject меняет статус.
//   • После каждого действия предложение исчезает из локального списка.
//
// Компонент сам прячется, если pending-предложений нет — на дашборде не
// занимает место зря.

const POLL_MS = 30_000;

export default function ProposalsPanel() {
  const [proposals, setProposals] = useState<TeamProposal[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [agentsById, setAgentsById] = useState<Map<string, TeamAgent>>(new Map());

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load() {
      try {
        const items = await fetchProposals({ status: "pending", limit: 100 });
        if (!cancelled) {
          setProposals(items);
          setError(null);
          setLoaded(true);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoaded(true);
        }
      }
    }

    void load();
    timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  // Подтягиваем агентов один раз — нам нужны display_name и avatar.
  useEffect(() => {
    let cancelled = false;
    listAgents("all")
      .then((items) => {
        if (cancelled) return;
        const map = new Map<string, TeamAgent>();
        for (const a of items) map.set(a.id, a);
        setAgentsById(map);
      })
      .catch(() => {
        // тихо — без имён карточка покажет agent_id
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function removeFromList(id: string) {
    setProposals((prev) => prev.filter((p) => p.id !== id));
  }

  // Пока не загрузили или нет pending — не рендерим вообще, чтобы не
  // конкурировать с Inbox-заглушкой.
  if (!loaded) return null;
  if (proposals.length === 0 && !error) return null;

  // Срочные (urgent) — сверху. Сохраняем созданный порядок внутри групп.
  const sorted = [...proposals].sort((a, b) => {
    const ua = a.kind === "urgent" ? 0 : 1;
    const ub = b.kind === "urgent" ? 0 : 1;
    if (ua !== ub) return ua - ub;
    return (a.created_at > b.created_at ? -1 : 1);
  });

  return (
    <section className="rounded-2xl border border-line bg-surface px-5 py-5 shadow-card">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="inline-flex items-center gap-2 font-display text-base font-semibold text-ink">
          <Sparkles size={14} className="text-accent" />
          Предложения от агентов
        </h3>
        <span className="text-xs text-ink-muted">
          Pending: {proposals.length}
        </span>
      </div>
      {error && (
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-md bg-accent-soft px-2 py-1 text-xs text-accent">
          <AlertTriangle size={12} /> {error}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {sorted.map((p) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            agent={agentsById.get(p.agent_id) ?? null}
            onResolved={() => removeFromList(p.id)}
          />
        ))}
      </ul>
    </section>
  );
}

function ProposalCard({
  proposal,
  agent,
  onResolved,
}: {
  proposal: TeamProposal;
  agent: TeamAgent | null;
  onResolved: () => void;
}) {
  const [busy, setBusy] = useState<null | "accept" | "reject">(null);
  const [error, setError] = useState<string | null>(null);

  const payload = proposal.payload ?? {};
  const what = String(payload.what ?? "").trim();
  const why = String(payload.why ?? "").trim();
  const benefit = String(payload.benefit ?? "").trim();
  const cost = String(payload.estimated_cost ?? "").trim();
  const vladTime = String(payload.vlad_time ?? "").trim();
  const isUrgent = proposal.kind === "urgent";

  async function handleAccept() {
    if (busy) return;
    setBusy("accept");
    setError(null);
    try {
      await acceptProposal(proposal.id, {});
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  async function handleReject() {
    if (busy) return;
    setBusy("reject");
    setError(null);
    try {
      await rejectProposal(proposal.id);
      onResolved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  return (
    <li
      className={
        "rounded-xl border bg-elevated/40 p-4 " +
        (isUrgent ? "border-accent" : "border-line")
      }
    >
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        {isUrgent && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 font-semibold text-surface">
            <Zap size={11} />
            Срочное
          </span>
        )}
        <span className="inline-flex items-center gap-1 text-ink-muted">
          <GitBranch size={11} />
          {agent?.display_name ?? proposal.agent_id}
        </span>
        <span className="text-ink-faint">
          • {proposal.triggered_by}
        </span>
      </div>

      {what && (
        <p className="text-sm font-medium leading-snug text-ink">{what}</p>
      )}
      {why && (
        <p className="mt-1 text-xs text-ink-muted">
          <span className="font-medium text-ink">Зачем:</span> {why}
        </p>
      )}
      {benefit && (
        <p className="mt-1 text-xs text-ink-muted">
          <span className="font-medium text-ink">Польза:</span> {benefit}
        </p>
      )}
      {(cost || vladTime) && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-ink-faint">
          {cost && <span>Стоимость: {cost}</span>}
          {vladTime && <span>Время Влада: {vladTime}</span>}
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-md bg-accent-soft px-2 py-1 text-xs text-accent">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={handleReject}
          disabled={busy !== null}
          className="focus-ring inline-flex h-8 items-center gap-1 rounded-lg border border-line bg-surface px-2.5 text-xs font-medium text-ink-muted transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
        >
          {busy === "reject" ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <X size={12} />
          )}
          Отклонить
        </button>
        <button
          type="button"
          onClick={handleAccept}
          disabled={busy !== null}
          className="focus-ring inline-flex h-8 items-center gap-1 rounded-lg bg-accent px-3 text-xs font-semibold text-surface shadow-card transition hover:bg-accent-hover disabled:opacity-50"
        >
          {busy === "accept" ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Check size={12} />
          )}
          Принять
        </button>
      </div>
    </li>
  );
}
