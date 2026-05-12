// Inbox внимания: агрегатор событий (Сессия 18 этапа 2, пункт 14).
//
// Каждая строка в team_notifications = одно событие, требующее реакции
// Влада. Источники наполнения:
//   • rule_candidate     — compress-episodes.js создал кандидата.
//   • task_awaiting_review — задача перешла в done (taskRunner.runTaskInBackground).
//   • handoff_suggestion — taskRunner распарсил блок Suggested Next Steps.
//   • skill_candidate    — заглушка до Сессии 27.
//   • rule_revision      — заглушка до Curator'а.
//   • proposal           — заглушка до пункта 15 (предложения от агентов).
//
// API стабильное: notificationsService.createNotification(payload) кидается
// из любого места после успешного действия — фронт уже сам поллит
// /api/team/notifications/summary раз в N секунд.

import { getServiceRoleClient } from "./teamSupabase.js";

const TABLE = "team_notifications";
const VALID_TYPES = new Set([
  "rule_candidate",
  "skill_candidate",
  "rule_revision",
  "task_awaiting_review",
  "handoff_suggestion",
  "proposal",
]);

function assertType(type) {
  if (!VALID_TYPES.has(type)) {
    throw new Error(
      `Неизвестный type «${type}». Допустимо: ${[...VALID_TYPES].join(", ")}.`,
    );
  }
}

// Создание нотификации. Все поля кроме type и title — опциональные.
// agent_id опционален, для системных событий (например, rule_revision от
// Curator'а) можно оставить null.
//
// Сессия 41: после успешного INSERT — fire-and-forget дублирование в
// Telegram через dispatchNotificationToTelegram. Ошибки Telegram не
// валят основной поток: нотификация уже создана и видна в Inbox, Telegram
// — побочный канал.
export async function createNotification({
  type,
  title,
  description = null,
  agent_id = null,
  related_entity_id = null,
  related_entity_type = null,
  link = null,
}) {
  assertType(type);
  if (!title || typeof title !== "string") {
    throw new Error("title обязателен и должен быть непустой строкой.");
  }
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .insert({
      type,
      title: title.trim(),
      description: description ? String(description).trim() : null,
      agent_id: agent_id ?? null,
      related_entity_id: related_entity_id ?? null,
      related_entity_type: related_entity_type ?? null,
      link: link ?? null,
    })
    .select()
    .maybeSingle();
  if (error) {
    throw new Error(`Не удалось создать нотификацию: ${error.message}`);
  }

  // Telegram-дубль. Динамический импорт нужен, чтобы избежать циклической
  // зависимости notificationsService ↔ telegramService (telegram dispatch
  // не зовёт createNotification, но cycle всё равно ловится при загрузке).
  if (data) {
    setImmediate(async () => {
      try {
        const { dispatchNotificationToTelegram } = await import("./telegramService.js");
        await dispatchNotificationToTelegram(data);
      } catch (err) {
        console.warn(`[notifications] dispatchToTelegram failed: ${err?.message ?? err}`);
      }
    });
  }

  return data;
}

// Краткая сводка для шапки/Inbox: общий счётчик + группировка по type.
// Возвращает { total_unread, by_type: { type: count, ... } }.
export async function getUnreadSummary() {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .select("type")
    .eq("is_read", false);
  if (error) {
    throw new Error(`Не удалось получить сводку нотификаций: ${error.message}`);
  }
  const byType = {};
  for (const row of data ?? []) {
    const t = row?.type;
    if (!t) continue;
    byType[t] = (byType[t] ?? 0) + 1;
  }
  return {
    total_unread: (data ?? []).length,
    by_type: byType,
  };
}

// Список нотификаций с фильтрами. По умолчанию — непрочитанные, свежие сверху.
export async function getNotifications({
  type = null,
  isRead = null,
  limit = 50,
  offset = 0,
} = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const client = getServiceRoleClient();
  let query = client
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);
  if (type !== null) {
    assertType(type);
    query = query.eq("type", type);
  }
  if (isRead !== null) {
    query = query.eq("is_read", !!isRead);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`Не удалось получить нотификации: ${error.message}`);
  }
  return data ?? [];
}

export async function markAsRead(id) {
  if (!id || typeof id !== "string") {
    throw new Error("id нотификации обязателен.");
  }
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .update({ is_read: true })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    throw new Error(`Не удалось пометить нотификацию прочитанной: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Нотификация ${id} не найдена.`);
  }
  return data;
}

// Помечает все непрочитанные нотификации (или только данного type, если
// передан) прочитанными. Возвращает количество затронутых записей.
export async function markAllAsRead({ type = null } = {}) {
  const client = getServiceRoleClient();
  let query = client.from(TABLE).update({ is_read: true }).eq("is_read", false);
  if (type !== null) {
    assertType(type);
    query = query.eq("type", type);
  }
  const { data, error } = await query.select("id");
  if (error) {
    throw new Error(`Не удалось пометить все прочитанными: ${error.message}`);
  }
  return (data ?? []).length;
}
