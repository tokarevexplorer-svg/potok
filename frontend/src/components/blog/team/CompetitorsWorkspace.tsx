"use client";

// Сессия 33: рабочая страница базы конкурентов.
// Список блогеров → клик → таблица постов с AI-саммари.

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, RefreshCcw, X } from "lucide-react";
import {
  addCompetitor,
  estimateCompetitor,
  fetchCompetitorPosts,
  fetchCompetitors,
  type Competitor,
  type CompetitorEstimate,
  type CompetitorPost,
} from "@/lib/team/teamBackendClient";

export default function CompetitorsWorkspace() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [apifyTokenPresent, setApifyTokenPresent] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openAdd, setOpenAdd] = useState(false);
  const [selected, setSelected] = useState<Competitor | null>(null);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCompetitors();
      setCompetitors(res.competitors);
      setApifyTokenPresent(res.apify_token_present);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // Поллинг каждые 15 сек — пока какие-то блогеры в processing.
    const t = setInterval(() => {
      if (competitors.some((c) => c.schema_definition?.processing)) {
        void refresh();
      }
    }, 15_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-8 flex flex-col gap-6">
      {apifyTokenPresent === false && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          APIFY_TOKEN не задан на бэкенде — парсинг новых блогеров недоступен.
          Добавь токен в Railway → Variables (получить:&nbsp;
          <a
            href="https://console.apify.com/account/integrations"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            console.apify.com/account/integrations
          </a>
          ) и перезапусти бэкенд.
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setOpenAdd(true)}
          disabled={apifyTokenPresent === false}
          className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-surface transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={14} /> Добавить блогера
        </button>
        <button
          type="button"
          onClick={() => void refresh()}
          className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm text-ink-muted transition hover:border-line-strong hover:text-ink"
        >
          <RefreshCcw size={14} /> Обновить
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {loading ? (
        <div className="inline-flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 size={14} className="animate-spin" /> Загружаем конкурентов…
        </div>
      ) : competitors.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line bg-elevated/40 px-4 py-6 text-sm text-ink-muted">
          Пока нет конкурентов. Нажми «Добавить блогера», чтобы запустить
          первый парсинг.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {competitors.map((c) => (
            <CompetitorCard key={c.id} competitor={c} onOpen={() => setSelected(c)} />
          ))}
        </div>
      )}

      {openAdd && (
        <AddCompetitorModal
          onClose={() => setOpenAdd(false)}
          onAdded={(competitor) => {
            setOpenAdd(false);
            setCompetitors((prev) => [competitor, ...prev.filter((c) => c.id !== competitor.id)]);
          }}
        />
      )}

      {selected && (
        <CompetitorDetail
          competitor={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

function CompetitorCard({
  competitor,
  onOpen,
}: {
  competitor: Competitor;
  onOpen: () => void;
}) {
  const processing = competitor.schema_definition?.processing === true;
  const lastError = competitor.schema_definition?.last_error;
  const username = competitor.schema_definition?.username ?? competitor.table_name;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="focus-ring flex flex-col items-start gap-2 rounded-2xl border border-line bg-elevated p-4 text-left transition hover:border-line-strong"
    >
      <div className="flex w-full items-center justify-between gap-2">
        <h3 className="truncate font-display text-base font-semibold text-ink">
          @{username}
        </h3>
        {processing ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
            <Loader2 size={10} className="animate-spin" /> Парсинг
          </span>
        ) : lastError ? (
          <span
            className="inline-flex items-center rounded-full bg-rose-100 px-2 py-0.5 text-xs text-rose-800"
            title={lastError}
          >
            Ошибка
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">
            Готово
          </span>
        )}
      </div>
      {competitor.schema_definition?.last_parsed_at && !processing && (
        <p className="text-xs text-ink-faint">
          Спарсено: {new Date(competitor.schema_definition.last_parsed_at).toLocaleString("ru")}
        </p>
      )}
      {lastError && !processing && (
        <p className="text-xs text-rose-700">{lastError}</p>
      )}
    </button>
  );
}

function AddCompetitorModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: (competitor: Competitor) => void;
}) {
  const [url, setUrl] = useState("");
  const [estimate, setEstimate] = useState<CompetitorEstimate | null>(null);
  const [busy, setBusy] = useState<null | "estimate" | "add">(null);
  const [error, setError] = useState<string | null>(null);

  async function handleEstimate() {
    if (!url.trim()) {
      setError("Вставь ссылку или @username");
      return;
    }
    setBusy("estimate");
    setError(null);
    try {
      const result = await estimateCompetitor(url, 30);
      setEstimate(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  async function handleAdd() {
    if (!url.trim()) {
      setError("Вставь ссылку или @username");
      return;
    }
    setBusy("add");
    setError(null);
    try {
      const competitor = await addCompetitor(url, 30);
      onAdded(competitor);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div
        role="dialog"
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-ink">
            Добавить блогера
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-elevated"
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-ink-muted">Instagram-ссылка или @username</span>
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://instagram.com/example или @example"
            className="focus-ring rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
            autoFocus
          />
        </label>

        {estimate && (
          <div className="mt-3 rounded-xl border border-line bg-elevated/40 px-3 py-2 text-xs">
            <p className="text-ink-muted">Username: <span className="font-mono text-ink">@{estimate.username}</span></p>
            <p className="mt-1 text-ink-muted">
              Постов: {estimate.estimated_posts} · Apify ~${estimate.apify_usd} · AI ~${estimate.ai_usd}
            </p>
            <p className="mt-1 font-medium text-ink">
              Итого ~${estimate.total_usd}
            </p>
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">{error}</p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => void handleEstimate()}
            disabled={!!busy}
            className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg border border-line bg-canvas px-3 text-sm text-ink-muted transition hover:border-line-strong hover:text-ink disabled:opacity-50"
          >
            {busy === "estimate" ? <Loader2 size={14} className="animate-spin" /> : null}
            Оценить
          </button>
          <button
            type="button"
            onClick={() => void handleAdd()}
            disabled={!!busy}
            className="focus-ring inline-flex h-9 items-center gap-1 rounded-lg bg-accent px-4 text-sm font-semibold text-surface transition hover:bg-accent-hover disabled:opacity-50"
          >
            {busy === "add" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Добавить
          </button>
        </div>
      </div>
    </div>
  );
}

function CompetitorDetail({
  competitor,
  onClose,
}: {
  competitor: Competitor;
  onClose: () => void;
}) {
  const [posts, setPosts] = useState<CompetitorPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchCompetitorPosts(competitor.id, { limit: 50 })
      .then((res) => {
        if (!cancelled) {
          setPosts(res.posts);
          setTotal(res.total);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [competitor.id]);

  const username = competitor.schema_definition?.username ?? competitor.table_name;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4">
      <div className="my-8 w-full max-w-4xl rounded-2xl border border-line bg-surface p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h3 className="font-display text-lg font-semibold text-ink">
            @{username}
            <span className="ml-2 text-sm font-normal text-ink-faint">
              ({total} {total === 1 ? "пост" : "постов"})
            </span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="focus-ring inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-elevated"
            aria-label="Закрыть"
          >
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="inline-flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 size={14} className="animate-spin" /> Грузим…
          </div>
        ) : error ? (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
        ) : posts.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line bg-elevated/40 px-4 py-6 text-sm text-ink-muted">
            Постов пока нет. Если парсинг недавно запущен, обнови страницу через
            минуту.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-line text-sm">
              <thead className="bg-elevated text-xs uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="px-2 py-2 text-left">Дата</th>
                  <th className="px-2 py-2 text-left">Тип</th>
                  <th className="px-2 py-2 text-left">Тема</th>
                  <th className="px-2 py-2 text-left">Хук</th>
                  <th className="px-2 py-2 text-left">Саммари</th>
                  <th className="px-2 py-2 text-right">❤</th>
                  <th className="px-2 py-2 text-right">💬</th>
                  <th className="px-2 py-2 text-left">URL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60 text-ink">
                {posts.map((p) => (
                  <tr key={p.id} className="align-top">
                    <td className="px-2 py-2 text-xs text-ink-faint">
                      {p.posted_at ? new Date(p.posted_at).toLocaleDateString("ru") : "—"}
                    </td>
                    <td className="px-2 py-2 text-xs">{p.ai_summary?.type ?? p.type ?? "—"}</td>
                    <td className="px-2 py-2 text-xs">{p.ai_summary?.topic ?? "—"}</td>
                    <td className="px-2 py-2 text-xs">{p.ai_summary?.hook ?? "—"}</td>
                    <td className="px-2 py-2 text-xs">{p.ai_summary?.summary ?? "—"}</td>
                    <td className="px-2 py-2 text-right text-xs text-ink-muted">
                      {p.likes_count ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-right text-xs text-ink-muted">
                      {p.comments_count ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-xs">
                      {p.url ? (
                        <a
                          href={p.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-accent underline"
                        >
                          открыть
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
