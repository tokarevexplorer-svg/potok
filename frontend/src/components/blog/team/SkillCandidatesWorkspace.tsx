"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Loader2,
  Pencil,
  Save,
  X,
} from "lucide-react";
import {
  approveSkillCandidate,
  fetchSkillCandidates,
  rejectSkillCandidate,
  type SkillCandidate,
} from "@/lib/team/teamBackendClient";

// Сессия 27 этапа 2: экран кандидатов в навыки.
//
// Структура UI почти идентична CandidatesWorkspace (Сессия 15): группы по
// агенту, три действия на каждой карточке. Главное отличие — у skill
// кандидата четыре текстовых поля (skill_name + 3 секции), а не одно.
// «Принять с правкой» раскрывает inline-форму для каждого поля.

export default function SkillCandidatesWorkspace() {
  const [candidates, setCandidates] = useState<SkillCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchSkillCandidates({ status: "pending" })
      .then((items) => {
        if (!cancelled) {
          setCandidates(items);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, { agent: SkillCandidate["agent"]; items: SkillCandidate[] }>();
    for (const c of candidates) {
      if (!c.agent) continue;
      const exists = map.get(c.agent.id);
      if (exists) exists.items.push(c);
      else map.set(c.agent.id, { agent: c.agent, items: [c] });
    }
    return Array.from(map.values());
  }, [candidates]);

  function removeFromList(id: string) {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  }

  if (loading) {
    return (
      <div className="mt-8 inline-flex items-center gap-2 text-sm text-ink-muted">
        <Loader2 size={14} className="animate-spin" /> Загружаем кандидатов…
      </div>
    );
  }
  if (error) {
    return (
      <p className="mt-8 inline-flex items-center gap-1.5 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
        <AlertTriangle size={14} /> {error}
      </p>
    );
  }
  if (grouped.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-line bg-elevated/40 p-10 text-center">
        <p className="text-sm font-medium text-ink-muted">
          Нет новых кандидатов в навыки. Они появятся автоматически после
          оценки задач на максимум (5/5) или вручную через{" "}
          <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-xs">
            npm run extract:skills
          </code>{" "}
          в backend.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      <p className="text-sm text-ink-muted">
        Всего кандидатов: <strong>{candidates.length}</strong> у{" "}
        <strong>{grouped.length}</strong> сотрудник
        {grouped.length === 1 ? "а" : "ов"}.
      </p>
      {grouped.map(({ agent, items }) => (
        <AgentGroup
          key={agent.id}
          agent={agent}
          items={items}
          onResolved={removeFromList}
        />
      ))}
    </div>
  );
}

function AgentGroup({
  agent,
  items,
  onResolved,
}: {
  agent: SkillCandidate["agent"];
  items: SkillCandidate[];
  onResolved: (id: string) => void;
}) {
  return (
    <section className="rounded-2xl border border-line bg-elevated p-5 shadow-card sm:p-6">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-line pb-3">
        <div className="flex flex-col gap-0.5">
          <Link
            href={`/blog/team/staff/${encodeURIComponent(agent.id)}`}
            className="font-display text-lg font-semibold tracking-tight text-ink hover:text-accent"
          >
            {agent.display_name}
          </Link>
          {agent.role_title && (
            <p className="text-xs text-ink-muted">{agent.role_title}</p>
          )}
        </div>
        <span className="text-xs text-ink-muted">
          Кандидатов: {items.length}
        </span>
      </header>
      <ul className="flex flex-col gap-3">
        {items.map((c) => (
          <CandidateCard key={c.id} candidate={c} onResolved={onResolved} />
        ))}
      </ul>
    </section>
  );
}

function CandidateCard({
  candidate,
  onResolved,
}: {
  candidate: SkillCandidate;
  onResolved: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    skill_name: candidate.skill_name,
    when_to_apply: candidate.when_to_apply,
    what_to_do: candidate.what_to_do,
    why_it_works: candidate.why_it_works,
  });
  const [busy, setBusy] = useState<null | "approve" | "edit" | "reject">(null);
  const [err, setErr] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [rejecting, setRejecting] = useState(false);

  async function handleApprove(useDraft: boolean) {
    if (busy) return;
    const overrides = useDraft
      ? {
          skill_name: draft.skill_name.trim() || undefined,
          when_to_apply: draft.when_to_apply.trim() || undefined,
          what_to_do: draft.what_to_do.trim() || undefined,
          why_it_works: draft.why_it_works.trim() || undefined,
        }
      : {};
    setBusy(useDraft ? "edit" : "approve");
    setErr(null);
    try {
      await approveSkillCandidate(candidate.id, overrides);
      onResolved(candidate.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  async function handleReject() {
    if (busy) return;
    setBusy("reject");
    setErr(null);
    try {
      await rejectSkillCandidate(candidate.id, rejectComment.trim() || undefined);
      onResolved(candidate.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      {/* Шапка карточки: имя навыка + источник задачи + оценка */}
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="font-display text-base font-semibold tracking-tight text-ink">
          {editing ? (
            <input
              type="text"
              value={draft.skill_name}
              onChange={(e) => setDraft({ ...draft, skill_name: e.target.value })}
              className="focus-ring w-full rounded-md border border-line bg-canvas px-2 py-1 text-base"
              disabled={busy !== null}
            />
          ) : (
            candidate.skill_name
          )}
        </h4>
        <div className="flex items-center gap-2 text-xs text-ink-faint">
          {candidate.score !== null && (
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800">
              ⭐ {candidate.score}/5
            </span>
          )}
          {candidate.task_id && (
            <span className="font-mono">
              task: {candidate.task_id.slice(0, 12)}
            </span>
          )}
        </div>
      </div>

      {/* Три секции: когда применять / что делать / почему работает */}
      <div className="flex flex-col gap-2 text-sm">
        <SectionField
          label="Когда применять"
          value={editing ? draft.when_to_apply : candidate.when_to_apply}
          editing={editing}
          onChange={(v) => setDraft({ ...draft, when_to_apply: v })}
          busy={busy !== null}
        />
        <SectionField
          label="Что делать"
          value={editing ? draft.what_to_do : candidate.what_to_do}
          editing={editing}
          onChange={(v) => setDraft({ ...draft, what_to_do: v })}
          busy={busy !== null}
          rows={3}
        />
        <SectionField
          label="Почему работает"
          value={editing ? draft.why_it_works : candidate.why_it_works}
          editing={editing}
          onChange={(v) => setDraft({ ...draft, why_it_works: v })}
          busy={busy !== null}
          hint="Не идёт в промпт — только для тебя."
        />
      </div>

      {/* Inline-форма отклонения с опц. комментарием */}
      {rejecting && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            rows={2}
            placeholder="Почему отклоняешь (опционально, для будущей диагностики)"
            disabled={busy !== null}
            className="focus-ring w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2 text-xs text-ink"
          />
        </div>
      )}

      {err && (
        <p className="mt-2 rounded-md bg-accent-soft px-2 py-1 text-xs text-accent">
          {err}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {editing ? (
          <>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft({
                  skill_name: candidate.skill_name,
                  when_to_apply: candidate.when_to_apply,
                  what_to_do: candidate.what_to_do,
                  why_it_works: candidate.why_it_works,
                });
                setErr(null);
              }}
              disabled={busy !== null}
              className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink-muted transition hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              <X size={12} /> Отмена
            </button>
            <button
              type="button"
              onClick={() => void handleApprove(true)}
              disabled={busy !== null}
              className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
            >
              {busy === "edit" ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Сохранить и принять
            </button>
          </>
        ) : rejecting ? (
          <>
            <button
              type="button"
              onClick={() => {
                setRejecting(false);
                setRejectComment("");
                setErr(null);
              }}
              disabled={busy !== null}
              className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink-muted transition hover:text-ink disabled:opacity-50"
            >
              <X size={12} /> Отмена
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={busy !== null}
              className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg bg-rose-500 px-3 text-xs font-semibold text-white transition hover:bg-rose-600 disabled:opacity-50"
            >
              {busy === "reject" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <X size={12} />
              )}
              Отклонить
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setRejecting(true)}
              disabled={busy !== null}
              className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink-muted transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
            >
              <X size={12} />
              Отклонить
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={busy !== null}
              className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink-muted transition hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              <Pencil size={12} /> Принять с правкой
            </button>
            <button
              type="button"
              onClick={() => void handleApprove(false)}
              disabled={busy !== null}
              className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
            >
              {busy === "approve" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Check size={12} />
              )}
              Принять
            </button>
          </>
        )}
      </div>
    </li>
  );
}

function SectionField({
  label,
  value,
  editing,
  onChange,
  busy,
  rows = 2,
  hint,
}: {
  label: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  busy: boolean;
  rows?: number;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      {editing ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          disabled={busy}
          className="focus-ring w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink"
        />
      ) : (
        <p className="rounded-md bg-elevated/60 px-3 py-2 text-sm leading-snug text-ink whitespace-pre-wrap">
          {value || <span className="italic text-ink-faint">(пусто)</span>}
        </p>
      )}
      {hint && <p className="text-[11px] italic text-ink-faint">{hint}</p>}
    </div>
  );
}
