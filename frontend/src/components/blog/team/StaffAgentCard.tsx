"use client";

// Сессия 11 этапа 2: карточка сотрудника /blog/team/staff/[id].
//
// Шапка (аватар, имя, должность, статус, действия) + четыре секции:
//   • «О сотруднике»          — biography (inline-edit), purpose / success_criteria
//                                (read-only), default_model (select).
//   • «Должностная инструкция» — Role-файл из Storage, inline markdown-edit
//                                с записью в history.
//   • «Память»                — табы «Правила» / «Эпизоды».
//   • «Доступы»               — три disabled-плейсхолдера (🔁 пункты 13/14/16).
//   • «История изменений»     — раскрывающаяся секция, GET /history.
//
// Что НЕ делаем здесь (по ТЗ Сессии 11):
//   • рабочая кнопка «Поставить задачу»          — 🔁 пункт 14 (этап 3);
//   • заполняемые «Доступы»                      — 🔁 пункты 13/14/16;
//   • вкладка «Навыки»                           — 🔁 пункт 10 (этап 4);
//   • вкладка «Дневник»                          — 🔁 пункт 15 (этап 3);
//   • счётчик токенов промпта                    — 🔁 пункт 11 (этап 4).

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
  Pause,
  Pencil,
  Pin,
  PinOff,
  Play,
  Plus,
  Save,
  Trash2,
  User,
  X,
} from "lucide-react";
import TeamPageHeader from "@/components/blog/team/TeamPageHeader";
import {
  DEPARTMENT_LABELS,
  STATUS_LABELS,
  archiveAgent as apiArchiveAgent,
  fetchAgentHistory,
  fetchAgentRole,
  getAgent,
  pauseAgent as apiPauseAgent,
  restoreAgent as apiRestoreAgent,
  saveAgentRole,
  updateAgent as apiUpdateAgent,
  type AgentStatus,
  type TeamAgent,
  type TeamAgentHistoryEntry,
} from "@/lib/team/teamAgentsService";
import {
  addRule,
  archiveMemoryItem,
  fetchRules,
  updateMemoryItem,
  type TeamMemoryItem,
} from "@/lib/team/teamMemoryService";
import {
  fetchFeedbackEpisodes,
  fetchModelsConfig,
  type FeedbackEpisode,
} from "@/lib/team/teamBackendClient";

interface Props {
  agentId: string;
}

type LoadingState = "loading" | "ready" | "notfound" | "error";

const PAUSE_ACTION_BUSY = "pause";
const ARCHIVE_ACTION_BUSY = "archive";
const RESTORE_ACTION_BUSY = "restore";
const RESUME_ACTION_BUSY = "resume";

export default function StaffAgentCard({ agentId }: Props) {
  const [agent, setAgent] = useState<TeamAgent | null>(null);
  const [state, setState] = useState<LoadingState>("loading");
  const [error, setError] = useState<string | null>(null);

  const reloadAgent = useCallback(async () => {
    try {
      const next = await getAgent(agentId);
      setAgent(next);
      setState("ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/не найден/i.test(message)) {
        setState("notfound");
      } else {
        setError(message);
        setState("error");
      }
    }
  }, [agentId]);

  useEffect(() => {
    setState("loading");
    setError(null);
    void reloadAgent();
  }, [reloadAgent]);

  if (state === "loading") {
    return (
      <div className="min-w-0">
        <TeamPageHeader
          title="Карточка сотрудника"
          description="Загружаем данные агента из базы и Storage."
          showBackLink
        />
        <div className="mt-8 flex items-center gap-2 rounded-2xl border border-line bg-elevated p-6 text-sm text-ink-muted">
          <Loader2 size={16} className="animate-spin" />
          Загружаем сотрудника…
        </div>
      </div>
    );
  }

  if (state === "notfound") {
    return (
      <div className="min-w-0">
        <TeamPageHeader
          title="Сотрудник не найден"
          description={`Агент «${agentId}» не существует или был удалён.`}
          showBackLink
        />
        <div className="mt-8 max-w-xl rounded-2xl border border-line bg-elevated p-6 shadow-card">
          <Link
            href="/blog/team/staff"
            className="focus-ring inline-flex items-center gap-1 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink-muted transition hover:border-line-strong hover:text-ink"
          >
            <ChevronLeft size={14} />К списку сотрудников
          </Link>
        </div>
      </div>
    );
  }

  if (state === "error" || !agent) {
    return (
      <div className="min-w-0">
        <TeamPageHeader
          title="Ошибка загрузки"
          description="Бэкенд вернул ошибку при чтении карточки агента."
          showBackLink
        />
        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-amber-400/50 bg-amber-50/40 p-5 text-sm text-amber-900">
          <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-medium">Не удалось загрузить агента</p>
            <p className="mt-1 opacity-80">{error ?? "Неизвестная ошибка"}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0">
      <TeamPageHeader
        title={agent.display_name}
        description={
          agent.role_title
            ? `Карточка сотрудника · ${agent.role_title}`
            : "Карточка сотрудника"
        }
        showBackLink
      />
      <div className="mt-8 flex flex-col gap-6">
        <HeaderCard agent={agent} onUpdated={reloadAgent} />
        <AboutSection agent={agent} onUpdated={reloadAgent} />
        <RoleSection agent={agent} onSavedRole={reloadAgent} />
        <MemorySection agentId={agent.id} />
        <AccessSection />
        <HistorySection agentId={agent.id} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Шапка карточки
// ---------------------------------------------------------------------------

function HeaderCard({
  agent,
  onUpdated,
}: {
  agent: TeamAgent;
  onUpdated: () => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function changeStatus(target: AgentStatus, busyKey: string) {
    setBusy(busyKey);
    setErr(null);
    try {
      if (target === "active") {
        await apiRestoreAgent(agent.id);
      } else if (target === "archived") {
        await apiArchiveAgent(agent.id);
      } else if (target === "paused") {
        await apiPauseAgent(agent.id);
      }
      await onUpdated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-elevated p-6 shadow-card md:flex-row md:items-start">
      <div className="flex-shrink-0">
        {agent.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={agent.avatar_url}
            alt={agent.display_name}
            className="h-20 w-20 rounded-full object-cover"
          />
        ) : (
          <span className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-accent-soft text-accent">
            <User size={36} />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            {agent.display_name}
          </h1>
          <StatusPill status={agent.status} />
        </div>
        {agent.role_title && (
          <p className="mt-1 text-sm text-ink-muted">{agent.role_title}</p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {agent.department ? (
            <span className="inline-flex items-center rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent">
              {DEPARTMENT_LABELS[agent.department]}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-muted">
              Без отдела
            </span>
          )}
          {agent.autonomy_level === 1 && (
            <span className="inline-flex items-center rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-muted">
              Автономен
            </span>
          )}
          <span className="text-xs text-ink-faint">id: {agent.id}</span>
        </div>

        {err && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-800">
            <AlertTriangle size={12} /> {err}
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {agent.status === "active" && (
            <>
              <button
                type="button"
                onClick={() => void changeStatus("paused", PAUSE_ACTION_BUSY)}
                disabled={!!busy}
                className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3 py-1.5 text-sm text-ink-muted transition hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === PAUSE_ACTION_BUSY ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Pause size={14} />
                )}
                Приостановить
              </button>
              <button
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      `Архивировать «${agent.display_name}»? Агент станет недоступен для новых задач. Можно вернуть из архива.`,
                    )
                  ) {
                    void changeStatus("archived", ARCHIVE_ACTION_BUSY);
                  }
                }}
                disabled={!!busy}
                className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-rose-300/60 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === ARCHIVE_ACTION_BUSY ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Archive size={14} />
                )}
                Архивировать
              </button>
            </>
          )}
          {agent.status === "paused" && (
            <button
              type="button"
              onClick={() => void changeStatus("active", RESUME_ACTION_BUSY)}
              disabled={!!busy}
              className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === RESUME_ACTION_BUSY ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Play size={14} />
              )}
              Вернуть в работу
            </button>
          )}
          {agent.status === "archived" && (
            <button
              type="button"
              onClick={() => void changeStatus("active", RESTORE_ACTION_BUSY)}
              disabled={!!busy}
              className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-1.5 text-sm font-semibold text-surface transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === RESTORE_ACTION_BUSY ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ArchiveRestore size={14} />
              )}
              Восстановить из архива
            </button>
          )}
          <button
            type="button"
            disabled
            title="Появится в следующем обновлении"
            className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-dashed border-line bg-canvas px-3 py-1.5 text-sm text-ink-faint"
          >
            <ChevronRight size={14} />
            Поставить задачу
          </button>
        </div>
      </div>
    </section>
  );
}

function StatusPill({ status }: { status: AgentStatus }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
        <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
        {STATUS_LABELS[status]}
      </span>
    );
  }
  if (status === "paused") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-canvas px-2 py-0.5 text-xs text-ink-muted">
        <span className="inline-block h-2 w-2 rounded-full bg-amber-500" aria-hidden />
        {STATUS_LABELS[status]}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-800">
      <Archive size={12} />
      {STATUS_LABELS[status]}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Секция «О сотруднике»
// ---------------------------------------------------------------------------

function AboutSection({
  agent,
  onUpdated,
}: {
  agent: TeamAgent;
  onUpdated: () => Promise<void>;
}) {
  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-line bg-elevated p-6 shadow-card">
      <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
        О сотруднике
      </h2>

      <InlineTextField
        label="Биография"
        value={agent.biography}
        emptyHint="Биография не заполнена."
        rows={4}
        onSave={async (next) => {
          await apiUpdateAgent(agent.id, { biography: next || null });
          await onUpdated();
        }}
      />

      <ReadonlyTextBlock
        label="Зачем нужен"
        value={agent.purpose}
        emptyHint="Цель агента не указана. Поле было обязательным при создании; если пусто — агент создан до Сессии 10."
      />

      <ReadonlyTextBlock
        label="Критерий успеха"
        value={agent.success_criteria}
        emptyHint="Критерий успеха не указан."
      />

      <DefaultModelField agent={agent} onUpdated={onUpdated} />
    </section>
  );
}

function ReadonlyTextBlock({
  label,
  value,
  emptyHint,
}: {
  label: string;
  value: string | null;
  emptyHint: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      <div className="rounded-xl border border-line bg-canvas px-4 py-3 text-sm leading-relaxed text-ink-muted whitespace-pre-wrap">
        {value && value.trim() ? value : <span className="italic text-ink-faint">{emptyHint}</span>}
      </div>
    </div>
  );
}

function InlineTextField({
  label,
  value,
  emptyHint,
  rows = 3,
  onSave,
}: {
  label: string;
  value: string | null;
  emptyHint: string;
  rows?: number;
  onSave: (next: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? "");
  }, [value, editing]);

  async function handleSave() {
    setBusy(true);
    setErr(null);
    try {
      await onSave(draft.trim());
      setEditing(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            {label}
          </span>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="focus-ring inline-flex items-center gap-1 rounded-md text-xs font-medium text-ink-muted hover:text-ink"
          >
            <Pencil size={12} /> Редактировать
          </button>
        </div>
        <div className="rounded-xl border border-line bg-canvas px-4 py-3 text-sm leading-relaxed text-ink whitespace-pre-wrap">
          {value && value.trim() ? (
            value
          ) : (
            <span className="italic text-ink-faint">{emptyHint}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={rows}
        className="focus-ring w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
      />
      {err && (
        <p className="inline-flex items-center gap-1.5 text-xs text-rose-700">
          <AlertTriangle size={12} /> {err}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={busy}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-canvas transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Сохранить
        </button>
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setDraft(value ?? "");
            setErr(null);
          }}
          disabled={busy}
          className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
        >
          <X size={12} /> Отмена
        </button>
      </div>
    </div>
  );
}

function DefaultModelField({
  agent,
  onUpdated,
}: {
  agent: TeamAgent;
  onUpdated: () => Promise<void>;
}) {
  const [models, setModels] = useState<Array<{ id: string; provider: string | null }>>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchModelsConfig()
      .then((cfg) => {
        if (cancelled) return;
        const list: Array<{ id: string; provider: string | null }> = [];
        const pricing = cfg.pricing;
        if (Array.isArray(pricing.models)) {
          for (const m of pricing.models) {
            if (m?.id) list.push({ id: m.id, provider: m.provider ?? null });
          }
        }
        setModels(list);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setModels([]);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleChange(next: string) {
    if (next === (agent.default_model ?? "")) return;
    setBusy(true);
    setErr(null);
    try {
      await apiUpdateAgent(agent.id, { default_model: next || null });
      await onUpdated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const current = agent.default_model ?? "";
  // Если текущая модель не входит в pricing.json — добавим её как опцию,
  // чтобы select не сбрасывал значение.
  const options = useMemo(() => {
    const list = [...models];
    if (current && !list.find((m) => m.id === current)) {
      list.unshift({ id: current, provider: null });
    }
    return list;
  }, [models, current]);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        Модель по умолчанию
      </span>
      {!loaded ? (
        <span className="inline-flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 size={14} className="animate-spin" /> Загружаю список моделей…
        </span>
      ) : (
        <div className="flex items-center gap-2">
          <select
            value={current}
            disabled={busy}
            onChange={(e) => void handleChange(e.target.value)}
            className="focus-ring h-10 flex-1 rounded-lg border border-line bg-surface px-3 text-sm text-ink disabled:opacity-50"
          >
            <option value="">— не задана —</option>
            {options.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id}
                {m.provider ? ` (${m.provider})` : ""}
              </option>
            ))}
          </select>
          {busy && <Loader2 size={14} className="animate-spin text-ink-muted" />}
        </div>
      )}
      {err && (
        <p className="inline-flex items-center gap-1.5 text-xs text-rose-700">
          <AlertTriangle size={12} /> {err}
        </p>
      )}
      <span className="text-xs text-ink-faint">
        Любую задачу можно переопределить при запуске.
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Секция «Должностная инструкция» (Role)
// ---------------------------------------------------------------------------

function RoleSection({
  agent,
  onSavedRole,
}: {
  agent: TeamAgent;
  onSavedRole: () => Promise<void>;
}) {
  const [content, setContent] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await fetchAgentRole(agent.id);
      setContent(next);
      setLoaded(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setLoaded(true);
    }
  }, [agent.id]);

  useEffect(() => {
    setLoaded(false);
    void load();
  }, [load]);

  async function handleSave() {
    setBusy(true);
    setErr(null);
    try {
      await saveAgentRole(agent.id, draft);
      setContent(draft);
      setEditing(false);
      await onSavedRole();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-elevated p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
          Должностная инструкция
        </h2>
        {loaded && !editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(content ?? "");
              setEditing(true);
            }}
            className="focus-ring inline-flex items-center gap-1 rounded-md text-xs font-medium text-ink-muted hover:text-ink"
          >
            <Pencil size={12} /> Редактировать
          </button>
        )}
      </div>

      {!loaded && (
        <div className="inline-flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 size={14} className="animate-spin" /> Загружаем Role-файл…
        </div>
      )}

      {loaded && !editing && (
        <div className="rounded-xl border border-line bg-canvas p-4 font-mono text-sm leading-relaxed text-ink whitespace-pre-wrap">
          {content && content.trim() ? (
            content
          ) : (
            <span className="italic text-ink-faint">
              Role-файл пуст. Нажмите «Редактировать», чтобы добавить должностную
              инструкцию.
            </span>
          )}
        </div>
      )}

      {loaded && editing && (
        <div className="flex flex-col gap-3">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={20}
            spellCheck={false}
            placeholder="## Зона ответственности
…
"
            className="focus-ring w-full resize-y rounded-2xl border border-line bg-canvas p-4 font-mono text-sm leading-relaxed text-ink placeholder:text-ink-faint"
          />
          {err && (
            <p className="inline-flex items-center gap-1.5 text-xs text-rose-700">
              <AlertTriangle size={12} /> {err}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy}
              className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-canvas transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(content ?? "");
                setErr(null);
              }}
              disabled={busy}
              className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink-muted hover:text-ink"
            >
              <X size={14} /> Отмена
            </button>
          </div>
        </div>
      )}

      {loaded && err && !editing && (
        <p className="inline-flex items-center gap-1.5 text-xs text-rose-700">
          <AlertTriangle size={12} /> {err}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Секция «Память»: табы «Правила» / «Эпизоды»
// ---------------------------------------------------------------------------

function MemorySection({ agentId }: { agentId: string }) {
  const [tab, setTab] = useState<"rules" | "episodes">("rules");
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-elevated p-6 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
          Память
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {/* Сессия 15: ссылка на экран кандидатов в правила. */}
          <Link
            href="/blog/team/staff/candidates"
            className="focus-ring inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-muted transition hover:border-line-strong hover:text-ink"
            title="Сжатие эпизодов обратной связи в кандидаты в правила"
          >
            Кандидаты →
          </Link>
          <div className="inline-flex rounded-xl border border-line bg-canvas p-1">
            {[
              { key: "rules" as const, label: "Правила" },
              { key: "episodes" as const, label: "Эпизоды" },
            ].map((it) => (
              <button
                key={it.key}
                type="button"
                onClick={() => setTab(it.key)}
                className={`focus-ring rounded-lg px-3 py-1 text-xs font-medium transition ${
                  tab === it.key
                    ? "bg-accent text-surface shadow-card"
                    : "text-ink-muted hover:text-ink"
                }`}
              >
                {it.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === "rules" ? (
        <RulesTab agentId={agentId} />
      ) : (
        <EpisodesTab agentId={agentId} />
      )}
    </section>
  );
}

function RulesTab({ agentId }: { agentId: string }) {
  const [rules, setRules] = useState<TeamMemoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [addDraft, setAddDraft] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const next = await fetchRules(agentId);
      setRules(next);
      setLoaded(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setLoaded(true);
    }
  }, [agentId]);

  useEffect(() => {
    setLoaded(false);
    void reload();
  }, [reload]);

  async function handleAdd() {
    const text = addDraft.trim();
    if (!text) {
      setAddErr("Введите текст правила.");
      return;
    }
    setAddBusy(true);
    setAddErr(null);
    try {
      await addRule(agentId, text, { source: "manual" });
      setAddDraft("");
      setAdding(false);
      await reload();
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : String(e));
    } finally {
      setAddBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!loaded && (
        <div className="inline-flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 size={14} className="animate-spin" /> Загружаем правила…
        </div>
      )}

      {loaded && err && (
        <p className="inline-flex items-center gap-1.5 text-xs text-rose-700">
          <AlertTriangle size={12} /> {err}
        </p>
      )}

      {loaded && rules.length === 0 && !err && (
        <p className="text-sm text-ink-muted">
          Правил пока нет. Добавьте первое — оно сразу попадёт в системный
          промпт агента.
        </p>
      )}

      {loaded &&
        rules.map((rule) => (
          <RuleRow key={rule.id} rule={rule} onChanged={reload} />
        ))}

      {!adding && (
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setAddDraft("");
            setAddErr(null);
          }}
          className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-xl border border-dashed border-line bg-canvas px-3 py-1.5 text-sm font-medium text-ink-muted transition hover:border-line-strong hover:text-ink"
        >
          <Plus size={14} /> Добавить правило
        </button>
      )}

      {adding && (
        <div className="flex flex-col gap-2 rounded-xl border border-line bg-canvas p-3">
          <textarea
            value={addDraft}
            onChange={(e) => setAddDraft(e.target.value)}
            rows={3}
            placeholder="Одна-две строки: «<императив>, потому что <обоснование>»."
            className="focus-ring w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
          />
          {addErr && (
            <p className="inline-flex items-center gap-1.5 text-xs text-rose-700">
              <AlertTriangle size={12} /> {addErr}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={addBusy}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-canvas transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {addBusy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setAddDraft("");
                setAddErr(null);
              }}
              disabled={addBusy}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
            >
              <X size={12} /> Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RuleRow({
  rule,
  onChanged,
}: {
  rule: TeamMemoryItem;
  onChanged: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(rule.content);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    setBusy(true);
    setErr(null);
    try {
      await updateMemoryItem(rule.id, { content: draft.trim() });
      setEditing(false);
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleTogglePin() {
    setBusy(true);
    setErr(null);
    try {
      await updateMemoryItem(rule.id, { pinned: !rule.pinned });
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleArchive() {
    if (
      !window.confirm(
        "Архивировать правило? Оно перестанет уходить в промпт, но останется в истории.",
      )
    ) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await archiveMemoryItem(rule.id);
      await onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-canvas p-3">
      {!editing && (
        <div className="flex items-start gap-3">
          <div className="flex-1 text-sm leading-relaxed text-ink whitespace-pre-wrap">
            {rule.pinned && (
              <span className="mr-2 inline-flex items-center gap-1 rounded bg-accent-soft px-1.5 py-0.5 text-xs font-medium text-accent">
                <Pin size={10} /> закреплено
              </span>
            )}
            {rule.content}
          </div>
          <div className="flex flex-shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setDraft(rule.content);
                setEditing(true);
              }}
              disabled={busy}
              title="Редактировать"
              className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-50"
            >
              <Pencil size={13} />
            </button>
            <button
              type="button"
              onClick={() => void handleTogglePin()}
              disabled={busy}
              title={rule.pinned ? "Открепить" : "Закрепить"}
              className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-canvas hover:text-ink disabled:opacity-50"
            >
              {rule.pinned ? <PinOff size={13} /> : <Pin size={13} />}
            </button>
            <button
              type="button"
              onClick={() => void handleArchive()}
              disabled={busy}
              title="Архивировать"
              className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-canvas hover:text-rose-700 disabled:opacity-50"
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}

      {editing && (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="focus-ring w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-xs font-semibold text-canvas transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Сохранить
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(rule.content);
                setErr(null);
              }}
              disabled={busy}
              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
            >
              <X size={12} /> Отмена
            </button>
          </div>
        </div>
      )}

      {err && (
        <p className="inline-flex items-center gap-1.5 text-xs text-rose-700">
          <AlertTriangle size={12} /> {err}
        </p>
      )}
    </div>
  );
}

const EPISODES_PAGE_SIZE = 20;

// Сессия 14: эпизоды теперь читаются из team_feedback_episodes (отдельная
// таблица для обратной связи Влада). На каждом эпизоде:
//   • цветной бейдж score (0-5) — красный/жёлтый/зелёный.
//   • parsed_text — нейтрализованная LLM формулировка (если есть).
//   • дата.
//   • ссылка на задачу (открытие в новой вкладке /blog/team/dashboard,
//     deep-link на задачу появится в Сессии 43).
//   • раскрывающийся блок raw_input — оригинальный комментарий Влада.
function EpisodesTab({ agentId }: { agentId: string }) {
  const [episodes, setEpisodes] = useState<FeedbackEpisode[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [expandedRaw, setExpandedRaw] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    setErr(null);
    // Щедрый лимит — эпизодов на одного агента редко больше нескольких сотен.
    fetchFeedbackEpisodes(agentId, { status: "active", limit: 500 })
      .then((items) => {
        if (cancelled) return;
        setEpisodes(items);
        setLoaded(true);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  const totalPages = Math.max(1, Math.ceil(episodes.length / EPISODES_PAGE_SIZE));
  const start = (page - 1) * EPISODES_PAGE_SIZE;
  const visible = episodes.slice(start, start + EPISODES_PAGE_SIZE);

  function toggleRaw(id: string) {
    setExpandedRaw((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {!loaded && (
        <div className="inline-flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 size={14} className="animate-spin" /> Загружаем эпизоды…
        </div>
      )}
      {loaded && err && (
        <p className="inline-flex items-center gap-1.5 text-xs text-rose-700">
          <AlertTriangle size={12} /> {err}
        </p>
      )}
      {loaded && !err && episodes.length === 0 && (
        <p className="text-sm text-ink-muted">
          Эпизодов пока нет. Оцени любую задачу этого сотрудника в дашборде —
          оценка и комментарий запишутся сюда как сырой эпизод обратной связи.
        </p>
      )}
      {loaded && !err && visible.length > 0 && (
        <>
          <ul className="flex flex-col gap-2">
            {visible.map((ep) => {
              const rawOpen = expandedRaw.has(ep.id);
              const hasParsed = ep.parsed_text && ep.parsed_text.trim();
              const scoreColor = episodeScoreBadgeClass(ep.score);
              return (
                <li
                  key={ep.id}
                  className="flex flex-col gap-2 rounded-xl border border-line bg-canvas p-3"
                >
                  <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                    {ep.score !== null && (
                      <span
                        className={
                          "inline-flex items-center rounded-full px-2 py-0.5 font-semibold " +
                          scoreColor
                        }
                      >
                        {ep.score}/5
                      </span>
                    )}
                    <span>{formatDate(ep.created_at)}</span>
                    {ep.task_id && (
                      <a
                        href="/blog/team/dashboard"
                        className="font-mono text-ink-faint hover:text-accent hover:underline"
                        title="Открыть дашборд"
                      >
                        {ep.task_id}
                      </a>
                    )}
                  </div>
                  {hasParsed ? (
                    <p className="text-sm leading-relaxed text-ink whitespace-pre-wrap">
                      {ep.parsed_text}
                    </p>
                  ) : (
                    <p className="text-sm italic text-ink-muted">
                      (нейтрализация не получилась — смотри сырой комментарий ниже)
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => toggleRaw(ep.id)}
                    className="focus-ring inline-flex w-fit items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"
                  >
                    {rawOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    Сырой комментарий
                  </button>
                  {rawOpen && (
                    <pre className="rounded-md border border-line bg-surface p-2 text-xs leading-relaxed text-ink whitespace-pre-wrap font-sans">
                      {ep.raw_input}
                    </pre>
                  )}
                </li>
              );
            })}
          </ul>
          {totalPages > 1 && (
            <div className="flex items-center justify-between text-xs text-ink-muted">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="focus-ring inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 disabled:opacity-50"
              >
                <ChevronLeft size={12} /> Назад
              </button>
              <span>
                Страница {page} из {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="focus-ring inline-flex items-center gap-1 rounded-md border border-line px-2 py-1 disabled:opacity-50"
              >
                Вперёд <ChevronRight size={12} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Цветной бейдж оценки: 0-1 красный, 2-3 жёлтый, 4-5 зелёный.
function episodeScoreBadgeClass(score: number | null): string {
  if (score === null || score === undefined) return "bg-line text-ink-muted";
  if (score <= 1) return "bg-rose-100 text-rose-800";
  if (score <= 3) return "bg-amber-100 text-amber-800";
  return "bg-emerald-100 text-emerald-800";
}

// ---------------------------------------------------------------------------
// Секция «Доступы» — placeholder
// ---------------------------------------------------------------------------

function AccessSection() {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-elevated p-6 shadow-card">
      <h2 className="font-display text-lg font-semibold tracking-tight text-ink">
        Доступы
      </h2>
      <p className="text-xs text-ink-faint">
        Тонкая настройка прав — в следующих этапах. Сейчас агенту доступно то
        же, что и любой задаче из дашборда.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <PlaceholderBlock title="Базы данных" />
        <PlaceholderBlock title="Доступные инструменты" />
        <PlaceholderBlock title="Доступные шаблоны задач" />
      </div>
    </section>
  );
}

function PlaceholderBlock({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-dashed border-line bg-canvas px-3 py-3 text-sm text-ink-muted">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {title}
      </span>
      <span className="text-xs text-ink-faint">
        Настройка появится в следующем обновлении.
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Секция «История изменений»
// ---------------------------------------------------------------------------

function HistorySection({ agentId }: { agentId: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<TeamAgentHistoryEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function ensureLoaded() {
    if (items !== null || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const next = await fetchAgentHistory(agentId);
      setItems(next);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-line bg-elevated shadow-card">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => {
            const next = !v;
            if (next) void ensureLoaded();
            return next;
          });
        }}
        className="focus-ring flex w-full items-center justify-between gap-3 rounded-2xl p-6 text-left"
      >
        <span className="inline-flex items-center gap-2 font-display text-lg font-semibold tracking-tight text-ink">
          <History size={18} /> История изменений
        </span>
        <ChevronDown
          size={18}
          className={`text-ink-muted transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-line p-6">
          {busy && (
            <div className="inline-flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 size={14} className="animate-spin" /> Загружаем историю…
            </div>
          )}
          {err && (
            <p className="inline-flex items-center gap-1.5 text-xs text-rose-700">
              <AlertTriangle size={12} /> {err}
            </p>
          )}
          {!busy && !err && items && items.length === 0 && (
            <p className="text-sm text-ink-muted">Записей в истории нет.</p>
          )}
          {!busy && items && items.length > 0 && (
            <ul className="flex flex-col gap-3">
              {items.map((h) => (
                <HistoryRow key={h.id} entry={h} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function HistoryRow({ entry }: { entry: TeamAgentHistoryEntry }) {
  const label = CHANGE_TYPE_LABELS[entry.change_type] ?? entry.change_type;
  const isLongDelta =
    entry.change_type === "role_updated" ||
    entry.change_type === "biography_updated";

  return (
    <li className="flex flex-col gap-1 rounded-xl border border-line bg-canvas p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <span className="font-medium text-ink">{label}</span>
        <span>{formatDate(entry.created_at)}</span>
      </div>
      {!isLongDelta && (entry.old_value !== null || entry.new_value !== null) && (
        <p className="text-xs text-ink-muted">
          <span className="text-ink-faint">было:</span>{" "}
          <span className="font-mono">{entry.old_value ?? "—"}</span>
          {" → "}
          <span className="text-ink-faint">стало:</span>{" "}
          <span className="font-mono">{entry.new_value ?? "—"}</span>
        </p>
      )}
      {isLongDelta && (
        <p className="text-xs text-ink-faint">
          Текстовое поле обновлено. Старое и новое содержимое сохранены в логе.
        </p>
      )}
      {entry.comment && (
        <p className="text-xs italic text-ink-muted">«{entry.comment}»</p>
      )}
    </li>
  );
}

const CHANGE_TYPE_LABELS: Record<string, string> = {
  created: "Создан",
  display_name_updated: "Имя",
  role_updated: "Должностная инструкция",
  department_updated: "Департамент",
  avatar_updated: "Аватар",
  biography_updated: "Биография",
  databases_changed: "Доступы к базам",
  tools_changed: "Доступные инструменты",
  templates_changed: "Шаблоны задач",
  orchestration_changed: "Режим оркестрации",
  autonomy_changed: "Уровень автономности",
  model_changed: "Модель по умолчанию",
  field_updated: "Поле обновлено",
  status_changed: "Статус",
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
