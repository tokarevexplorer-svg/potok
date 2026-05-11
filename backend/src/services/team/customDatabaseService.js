// Сервис реестра баз команды (Сессия 5 этапа 2).
//
// Read-only обёртка над таблицей team_custom_databases (см. миграцию
// 0015_team_custom_databases.sql) и над теми реальными таблицами Postgres,
// которые в этом реестре зарегистрированы.
//
// Что умеет:
//   - listDatabases()                 — все записи реестра.
//   - getDatabaseById(id)             — одна запись по UUID.
//   - getDatabaseByName(name)         — одна запись по имени (для slug-роутинга).
//   - getDatabaseRecords(tableName)   — содержимое таблицы из реестра.
//
// Чего НЕ умеет (намеренно):
//   - Создание / изменение / удаление таблиц — это пункт 22 (этап 6,
//     мастер «+ Создать базу»).
//   - Запись в реестр из API — пока новые базы появляются только через
//     SQL/Dashboard или будущий мастер.
//
// Все ошибки — на русском, в стиле остальных team-сервисов.

import { getServiceRoleClient } from "./teamSupabase.js";

// Sentinel-значение для placeholder-баз (Конкуренты до этапа 5). Реальной
// таблицы с таким именем не существует — попытка прочитать содержимое
// возвращает { isPlaceholder: true } без обращения к Postgres.
const PLACEHOLDER_TABLE_NAMES = new Set(["competitors_placeholder"]);

// Возвращает все записи реестра, отсортированные по created_at.
// Пустой массив, если в реестре пока ничего нет.
export async function listDatabases() {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_custom_databases")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Не удалось получить список баз: ${error.message}`);
  }
  return data ?? [];
}

// Одна запись реестра по UUID. null, если не нашли.
export async function getDatabaseById(id) {
  if (!id || typeof id !== "string") {
    throw new Error("getDatabaseById: id обязателен.");
  }
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_custom_databases")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Не удалось получить базу по id: ${error.message}`);
  }
  return data ?? null;
}

// Одна запись реестра по имени. Используется для динамического роутинга
// /blog/databases/<slug> — slug = decodeURIComponent имени базы.
export async function getDatabaseByName(name) {
  if (!name || typeof name !== "string") {
    throw new Error("getDatabaseByName: name обязательно.");
  }
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_custom_databases")
    .select("*")
    .eq("name", name)
    .maybeSingle();

  if (error) {
    throw new Error(`Не удалось получить базу по имени: ${error.message}`);
  }
  return data ?? null;
}

// Содержимое таблицы по имени. limit / offset стандартные, без upper-bound —
// caller сам ограничивает через UI. Если tableName — placeholder, возвращаем
// пустой результат с флагом isPlaceholder, чтобы фронт показал заглушку без
// SQL-ошибки «таблицы нет».
//
// Возвращает: { records: any[], total: number, isPlaceholder?: boolean }.
export async function getDatabaseRecords(tableName, { limit = 50, offset = 0 } = {}) {
  if (!tableName || typeof tableName !== "string") {
    throw new Error("getDatabaseRecords: tableName обязателен.");
  }

  if (PLACEHOLDER_TABLE_NAMES.has(tableName)) {
    return { records: [], total: 0, isPlaceholder: true };
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));
  const safeOffset = Math.max(0, Number(offset) || 0);

  const client = getServiceRoleClient();
  const { data, error, count } = await client
    .from(tableName)
    .select("*", { count: "exact" })
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (error) {
    throw new Error(`Не удалось получить записи из таблицы ${tableName}: ${error.message}`);
  }

  return {
    records: data ?? [],
    total: typeof count === "number" ? count : (data?.length ?? 0),
  };
}
