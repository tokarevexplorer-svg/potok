"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import {
  fetchNotificationsSummarySafe,
  markAllNotificationsRead,
  NOTIFICATION_GROUP_EMOJIS,
  NOTIFICATION_GROUP_LABELS,
  NOTIFICATION_GROUP_LINKS,
  type NotificationsSummary,
  type NotificationType,
} from "@/lib/team/teamNotificationsService";

// Сессия 18 этапа 2: блок «Требует внимания» на дашборде.
//
// Группированные счётчики из GET /api/team/notifications/summary с поллингом
// раз в 30 секунд (Inbox-события возникают раз в задачу — поллить чаще не
// нужно). Каждая группа — ссылка на тот раздел, где Влад принимает решение.

const POLL_MS = 30_000;

// Порядок групп в Inbox — самые «горящие» сверху. proposal/rule_revision
// пока заглушки, но пусть будут заранее видны в UI, если они появятся.
const GROUP_ORDER: NotificationType[] = [
  "task_awaiting_review",
  "rule_candidate",
  "handoff_suggestion",
  "skill_candidate",
  "proposal",
  "rule_revision",
];

export default function InboxBlock() {
  const [summary, setSummary] = useState<NotificationsSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function load() {
      const data = await fetchNotificationsSummarySafe();
      if (!cancelled) setSummary(data);
    }

    void load();
    timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  async function handleMarkAll() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await markAllNotificationsRead();
      const fresh = await fetchNotificationsSummarySafe();
      setSummary(fresh);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const total = summary?.total_unread ?? 0;
  const byType = summary?.by_type ?? {};
  const groupsWithCounts = GROUP_ORDER.map((g) => ({
    type: g,
    count: byType[g] ?? 0,
  })).filter((g) => g.count > 0);

  return (
    <section className="rounded-2xl border border-line bg-elevated/30 px-5 py-5">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-canvas text-ink-muted">
          <Bell size={16} />
        </span>
        <div className="flex flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-base font-semibold text-ink">
              Требует внимания
            </h3>
            {total > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                disabled={busy}
                className="focus-ring inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink-muted transition hover:border-line-strong hover:text-ink disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <CheckCheck size={12} />
                )}
                Отметить все прочитанными
              </button>
            )}
          </div>
          {error && (
            <p className="rounded-md bg-accent-soft px-2 py-1 text-xs text-accent">
              {error}
            </p>
          )}
          {total === 0 ? (
            <p className="text-sm text-ink-muted">
              Всё чисто ✓ — новых событий нет.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {groupsWithCounts.map((g) => (
                <li key={g.type}>
                  <Link
                    href={NOTIFICATION_GROUP_LINKS[g.type]}
                    className="focus-ring group flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 transition hover:bg-canvas"
                  >
                    <span className="inline-flex items-center gap-2 text-sm text-ink">
                      <span aria-hidden>{NOTIFICATION_GROUP_EMOJIS[g.type]}</span>
                      {NOTIFICATION_GROUP_LABELS[g.type]}
                    </span>
                    <span className="inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold text-surface">
                      {g.count}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
