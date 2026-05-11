"use client";

import { useEffect, useRef, useState } from "react";
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

// Сессия 18 этапа 2: сквозной колокольчик в шапке.
//
// Рендерится из AppShell, поверх главной области (fixed, top-right).
// Виден на любой странице, кроме /auth/* — там AppShell вообще не рендерит
// обёртку, и колокольчика тоже не будет.
//
// Поллинг — раз в 30 секунд (как InboxBlock на дашборде). Dropdown:
//   • группы непрочитанных с эмодзи и счётчиком — ссылка на раздел;
//   • кнопка «Все прочитано» внизу.

const POLL_MS = 30_000;

const GROUP_ORDER: NotificationType[] = [
  "task_awaiting_review",
  "rule_candidate",
  "handoff_suggestion",
  "skill_candidate",
  "proposal",
  "rule_revision",
];

export default function NotificationsBell() {
  const [summary, setSummary] = useState<NotificationsSummary>({
    total_unread: 0,
    by_type: {},
  });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Поллинг сводки.
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

  // Закрываем dropdown по клику снаружи / Esc.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!dropdownRef.current) return;
      if (!dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function handleMarkAll() {
    if (busy) return;
    setBusy(true);
    try {
      await markAllNotificationsRead();
      const fresh = await fetchNotificationsSummarySafe();
      setSummary(fresh);
    } catch (err) {
      console.warn("[NotificationsBell] mark all failed:", err);
    } finally {
      setBusy(false);
    }
  }

  const total = summary.total_unread;
  const groupsWithCounts = GROUP_ORDER.map((g) => ({
    type: g,
    count: summary.by_type?.[g] ?? 0,
  })).filter((g) => g.count > 0);

  return (
    <div
      ref={dropdownRef}
      className="fixed right-4 top-4 z-40 lg:right-8 lg:top-6"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Inbox внимания"
        className="focus-ring relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink-muted shadow-card transition hover:border-line-strong hover:text-ink"
      >
        <Bell size={18} />
        {total > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-semibold text-surface">
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Уведомления"
          className="absolute right-0 top-12 w-[300px] rounded-2xl border border-line bg-surface p-3 shadow-pop"
        >
          <div className="flex items-baseline justify-between gap-2 px-1 py-1">
            <p className="text-sm font-medium text-ink">Уведомления</p>
            <span className="text-xs text-ink-faint">
              {total === 0 ? "пусто" : `${total} непрочит.`}
            </span>
          </div>
          {total === 0 ? (
            <p className="px-1 py-3 text-sm text-ink-muted">
              Всё чисто ✓ — новых событий нет.
            </p>
          ) : (
            <>
              <ul className="flex flex-col gap-0.5 py-1">
                {groupsWithCounts.map((g) => (
                  <li key={g.type}>
                    <Link
                      href={NOTIFICATION_GROUP_LINKS[g.type]}
                      onClick={() => setOpen(false)}
                      className="focus-ring group flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm text-ink transition hover:bg-canvas"
                    >
                      <span className="inline-flex items-center gap-2">
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
              <div className="mt-1 border-t border-line pt-2">
                <button
                  type="button"
                  onClick={handleMarkAll}
                  disabled={busy}
                  className="focus-ring inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-canvas px-2.5 py-1.5 text-xs font-medium text-ink-muted transition hover:text-ink disabled:opacity-50"
                >
                  {busy ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <CheckCheck size={12} />
                  )}
                  Отметить все прочитанными
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
