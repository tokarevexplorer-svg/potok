// Клиент Inbox внимания (Сессия 18 этапа 2, пункт 14).
//
// Все вызовы идут через прокси /api/team-proxy/notifications/* — единый
// паттерн с остальными сервисами раздела команды.

export type NotificationType =
  | "rule_candidate"
  | "skill_candidate"
  | "rule_revision"
  | "task_awaiting_review"
  | "handoff_suggestion"
  | "proposal";

export interface TeamNotification {
  id: string;
  type: NotificationType;
  title: string;
  description: string | null;
  agent_id: string | null;
  related_entity_id: string | null;
  related_entity_type: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationsSummary {
  total_unread: number;
  by_type: Partial<Record<NotificationType, number>>;
}

async function fetchNotif(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<unknown> {
  const url = `/api/team-proxy/notifications${path.startsWith("/") ? path : `/${path}`}`;
  const { timeoutMs = 30_000, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    throw new Error(`Бэкенд не отвечает: ${message}`);
  }
  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // не JSON
    }
  }
  if (!response.ok) {
    const errorMsg =
      parsed && typeof parsed === "object" && parsed !== null && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new Error(errorMsg);
  }
  return parsed;
}

export async function fetchNotificationsSummary(): Promise<NotificationsSummary> {
  const data = await fetchNotif("/summary", { method: "GET" });
  const obj = (data ?? {}) as Partial<NotificationsSummary>;
  return {
    total_unread: typeof obj.total_unread === "number" ? obj.total_unread : 0,
    by_type: obj.by_type ?? {},
  };
}

export async function fetchNotificationsSummarySafe(): Promise<NotificationsSummary> {
  try {
    return await fetchNotificationsSummary();
  } catch {
    return { total_unread: 0, by_type: {} };
  }
}

export async function fetchNotifications(
  options: {
    type?: NotificationType;
    isRead?: boolean;
    limit?: number;
    offset?: number;
  } = {},
): Promise<TeamNotification[]> {
  const qs = new URLSearchParams();
  if (options.type) qs.set("type", options.type);
  if (typeof options.isRead === "boolean") qs.set("is_read", String(options.isRead));
  if (typeof options.limit === "number") qs.set("limit", String(options.limit));
  if (typeof options.offset === "number") qs.set("offset", String(options.offset));
  const path = qs.toString() ? `/?${qs.toString()}` : "/";
  const data = await fetchNotif(path, { method: "GET" });
  return ((data ?? {}) as { notifications?: TeamNotification[] }).notifications ?? [];
}

export async function markNotificationRead(id: string): Promise<void> {
  await fetchNotif(`/${encodeURIComponent(id)}/read`, { method: "PATCH" });
}

export async function markAllNotificationsRead(type?: NotificationType): Promise<number> {
  const data = await fetchNotif(`/read-all`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(type ? { type } : {}),
  });
  return ((data ?? {}) as { updated?: number }).updated ?? 0;
}

// Человекочитаемые группы для UI Inbox/колокольчика.
export const NOTIFICATION_GROUP_LABELS: Record<NotificationType, string> = {
  rule_candidate: "Кандидаты в правила",
  skill_candidate: "Кандидаты в навыки",
  rule_revision: "Ревизии правил",
  task_awaiting_review: "Задачи ждут оценки",
  handoff_suggestion: "Предложения handoff",
  proposal: "Предложения от агентов",
};

// Иконки/эмодзи для групп — единая визуальная подсказка в Inbox и dropdown.
export const NOTIFICATION_GROUP_EMOJIS: Record<NotificationType, string> = {
  rule_candidate: "📝",
  skill_candidate: "🎓",
  rule_revision: "♻️",
  task_awaiting_review: "⭐",
  handoff_suggestion: "🔄",
  proposal: "🎯",
};

// Куда вести Влада из dropdown'а — fallback, если у самой нотификации нет link.
export const NOTIFICATION_GROUP_LINKS: Record<NotificationType, string> = {
  rule_candidate: "/blog/team/staff/candidates",
  skill_candidate: "/blog/team/staff/skill-candidates",
  rule_revision: "/blog/team/staff/candidates",
  task_awaiting_review: "/blog/team/dashboard",
  handoff_suggestion: "/blog/team/dashboard",
  proposal: "/blog/team/dashboard",
};
