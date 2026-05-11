"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
  Save,
  X,
} from "lucide-react";
import {
  fetchCandidates,
  updateMemoryItem,
  type MemoryCandidate,
} from "@/lib/team/teamMemoryService";
import { fetchFeedbackEpisodes, type FeedbackEpisode } from "@/lib/team/teamBackendClient";

// Сессия 15 этапа 2: экран кандидатов в правила.
//
// Что делает:
//   • Загружает все pending-кандидаты через GET /api/team/memory/candidates
//     (агенты заджойнены в поле `agent`).
//   • Группирует по агенту, рендерит карточки.
//   • На каждой — три действия:
//       - Принять → PATCH status=active
//       - Принять с правкой → inline-редактор content + PATCH content+status
//       - Отклонить → PATCH status=rejected (бэкенд автоматически помечает
//         source_episode_ids как dismissed в team_feedback_episodes).
//   • Эпизоды-источники подтягиваются по запросу (когда раскрываем
//     карточку): один запрос на агента, чтобы знать parsed_text / score
//     каждого source_episode_id.
//
// Дизайн схож с другими страницами раздела «Команда» — карточки на сетке,
// сворачивающиеся секции, светлая палитра.

export default function CandidatesWorkspace() {
  const [candidates, setCandidates] = useState<MemoryCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCandidates({ pendingOnly: true })
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

  // Группировка: ключ — agent.id, значение — { agent, items }.
  const grouped = useMemo(() => {
    const map = new Map<string, { agent: MemoryCandidate["agent"]; items: MemoryCandidate[] }>();
    for (const c of candidates) {
      if (!c.agent) continue;
      const existing = map.get(c.agent.id);
      if (existing) {
        existing.items.push(c);
      } else {
        map.set(c.agent.id, { agent: c.agent, items: [c] });
      }
    }
    return Array.from(map.values());
  }, [candidates]);

  // Удаление кандидата из локального списка после действия (принят/отклонён) —
  // он больше не pending и в выдаче не нужен. Перезагрузка не делается, чтобы
  // не «прыгал» список под рукой Влада.
  function removeCandidate(id: string) {
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
          Нет новых кандидатов. Запусти{" "}
          <code className="rounded bg-canvas px-1.5 py-0.5 font-mono text-xs">
            npm run compress:episodes -- --agent &lt;id&gt;
          </code>{" "}
          в backend, чтобы сжать накопившиеся эпизоды в правила.
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
          onResolved={removeCandidate}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Группа кандидатов по агенту
// ---------------------------------------------------------------------------

function AgentGroup({
  agent,
  items,
  onResolved,
}: {
  agent: MemoryCandidate["agent"];
  items: MemoryCandidate[];
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

// ---------------------------------------------------------------------------
// Карточка одного кандидата
// ---------------------------------------------------------------------------

function CandidateCard({
  candidate,
  onResolved,
}: {
  candidate: MemoryCandidate;
  onResolved: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(candidate.content);
  const [busy, setBusy] = useState<null | "accept" | "edit" | "reject">(null);
  const [error, setError] = useState<string | null>(null);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sources, setSources] = useState<FeedbackEpisode[] | null>(null);
  const [sourcesLoading, setSourcesLoading] = useState(false);

  const sourceIds = useMemo(
    () => candidate.source_episode_ids ?? [],
    [candidate.source_episode_ids],
  );

  // Подтягиваем источники только при первом раскрытии секции, чтобы не
  // загружать всю историю обратной связи на старте.
  useEffect(() => {
    if (!sourcesOpen) return;
    if (sources !== null) return;
    let cancelled = false;
    setSourcesLoading(true);
    fetchFeedbackEpisodes(candidate.agent_id, { status: "active", limit: 500 })
      .then((items) => {
        if (cancelled) return;
        // PostgREST не отдаёт фильтр по id-set через прокси — фильтруем
        // на клиенте по source_episode_ids кандидата.
        const wanted = new Set(sourceIds);
        setSources(items.filter((e) => wanted.has(e.id)));
      })
      .catch(() => {
        if (!cancelled) setSources([]);
      })
      .finally(() => {
        if (!cancelled) setSourcesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourcesOpen, sources, candidate.agent_id, sourceIds]);

  async function handleAccept() {
    if (busy) return;
    setBusy("accept");
    setError(null);
    try {
      await updateMemoryItem(candidate.id, { status: "active" });
      onResolved(candidate.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  async function handleAcceptEdited() {
    if (busy) return;
    const next = draft.trim();
    if (!next) {
      setError("Текст правила не может быть пустым.");
      return;
    }
    setBusy("edit");
    setError(null);
    try {
      await updateMemoryItem(candidate.id, { status: "active", content: next });
      onResolved(candidate.id);
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
      await updateMemoryItem(candidate.id, { status: "rejected" });
      onResolved(candidate.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(null);
    }
  }

  return (
    <li className="rounded-xl border border-line bg-surface p-4">
      {editing ? (
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-ink-muted" htmlFor={`draft-${candidate.id}`}>
            Текст правила
          </label>
          <textarea
            id={`draft-${candidate.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="focus-ring w-full resize-y rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink"
            disabled={busy !== null}
          />
        </div>
      ) : (
        <p className="text-sm leading-relaxed text-ink whitespace-pre-wrap">
          {candidate.content}
        </p>
      )}

      <button
        type="button"
        onClick={() => setSourcesOpen((v) => !v)}
        className="focus-ring mt-3 inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"
      >
        {sourcesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        Источники ({sourceIds.length})
      </button>
      {sourcesOpen && (
        <div className="mt-2 rounded-lg border border-line bg-elevated/60 p-3">
          {sourcesLoading && (
            <div className="inline-flex items-center gap-2 text-xs text-ink-muted">
              <Loader2 size={12} className="animate-spin" /> Загрузка…
            </div>
          )}
          {sources && sources.length === 0 && (
            <p className="text-xs text-ink-muted">
              Эпизоды не найдены (возможно, помечены как dismissed/archived).
            </p>
          )}
          {sources && sources.length > 0 && (
            <ul className="flex flex-col gap-2">
              {sources.map((ep) => (
                <li key={ep.id} className="text-xs">
                  <div className="flex items-center gap-2 text-ink-muted">
                    {ep.score !== null && (
                      <span
                        className={
                          "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold " +
                          scoreColor(ep.score)
                        }
                      >
                        {ep.score}/5
                      </span>
                    )}
                    <span className="font-mono text-ink-faint">{ep.id.slice(0, 8)}</span>
                  </div>
                  <p className="mt-1 text-ink whitespace-pre-wrap">
                    {ep.parsed_text || ep.raw_input}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && (
        <p className="mt-2 rounded-md bg-accent-soft px-2.5 py-1.5 text-xs text-accent">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        {editing ? (
          <>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(candidate.content);
                setError(null);
              }}
              disabled={busy !== null}
              className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink-muted transition hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              <X size={12} /> Отмена
            </button>
            <button
              type="button"
              onClick={handleAcceptEdited}
              disabled={busy !== null}
              className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
            >
              {busy === "edit" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Save size={12} />
              )}
              Сохранить и принять
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleReject}
              disabled={busy !== null}
              className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink-muted transition hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
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
              onClick={() => setEditing(true)}
              disabled={busy !== null}
              className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink-muted transition hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              <Pencil size={12} /> Принять с правкой
            </button>
            <button
              type="button"
              onClick={handleAccept}
              disabled={busy !== null}
              className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg bg-emerald-500 px-3 text-xs font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-50"
            >
              {busy === "accept" ? (
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

// Цветовая шкала для бейджа score в источниках — синхронна с
// StaffAgentCard.EpisodesTab и блоком оценки в TaskViewerModal.
function scoreColor(score: number | null): string {
  if (score === null || score === undefined) return "bg-line text-ink-muted";
  if (score <= 1) return "bg-rose-100 text-rose-800";
  if (score <= 3) return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}
