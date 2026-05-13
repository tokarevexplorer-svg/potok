// Сервис реестра баз команды (Сессия 5 этапа 2; расширен Сессией 45).
//
// Обёртка над таблицей team_custom_databases (см. миграцию
// 0015_team_custom_databases.sql) и над теми реальными таблицами Postgres,
// которые в этом реестре зарегистрированы.
//
// Что умеет:
//   - listDatabases()                 — все записи реестра.
//   - getDatabaseById(id)             — одна запись по UUID.
//   - getDatabaseByName(name)         — одна запись по имени (для slug-роутинга).
//   - getDatabaseRecords(tableName)   — содержимое таблицы из реестра.
//   - createDatabase({ name, columns }) — Сессия 45: мастер «+ Создать базу».
//   - addRecord / updateRecord / deleteRecord (Сессия 45) — CRUD по записям
//     пользовательских баз, с валидацией ключей по schema_definition.
//
// Чего НЕ умеет (намеренно):
//   - Удаление баз через API — пока только через Supabase Dashboard.
//   - Промоут артефакта в базу — Сессия 46.
//
// Все ошибки — на русском, в стиле остальных team-сервисов.

import { getServiceRoleClient } from "./teamSupabase.js";

const VALID_COLUMN_TYPES = new Set([
  "text",
  "long_text",
  "number",
  "url",
  "select",
  "multi_select",
  "date",
  "boolean",
]);

// Транслитерация для генерации slug имени таблицы. Совпадает с
// agentService.generateSlug (Сессия 10) — там же поясняется выбор.
const TRANSLIT_MAP = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya",
};

function slugify(input) {
  const src = String(input ?? "").trim().toLowerCase();
  if (!src) return "";
  let out = "";
  for (const ch of src) {
    if (TRANSLIT_MAP[ch] !== undefined) {
      out += TRANSLIT_MAP[ch];
    } else if (/[a-z0-9]/.test(ch)) {
      out += ch;
    } else if (/[\s\-_.]/.test(ch)) {
      out += "_";
    }
    // прочие символы игнорируем
  }
  // схлопываем кратные подчёркивания, обрезаем края, ограничиваем длину
  return out.replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 32);
}

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

// =========================================================================
// Сессия 45: создание пользовательских баз + CRUD записей.
// =========================================================================

// Валидация описания колонок. На бэкенде дополнительно проверяет SQL-функция
// create_custom_table, но фронту полезно получить понятную ошибку до RPC.
function validateColumns(columns) {
  if (!Array.isArray(columns) || columns.length === 0) {
    throw new Error("Нужна хотя бы одна колонка.");
  }
  const seen = new Set();
  const normalized = [];
  for (const raw of columns) {
    if (!raw || typeof raw !== "object") {
      throw new Error("Каждая колонка должна быть объектом { name, type, options? }.");
    }
    const name = String(raw.name ?? "").trim().toLowerCase();
    const type = String(raw.type ?? "").trim();
    if (!name) throw new Error("У одной из колонок не указано имя.");
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      throw new Error(
        `Имя колонки «${raw.name}» должно содержать только латиницу нижнего регистра, цифры и подчёркивания, начало — буква.`,
      );
    }
    if (["id", "created_at"].includes(name)) {
      throw new Error(`Имя колонки «${name}» зарезервировано.`);
    }
    if (seen.has(name)) {
      throw new Error(`Колонка «${name}» указана несколько раз.`);
    }
    if (!VALID_COLUMN_TYPES.has(type)) {
      throw new Error(
        `Тип колонки «${name}»: «${type}» не поддерживается. Допустимы: ${[...VALID_COLUMN_TYPES].join(", ")}.`,
      );
    }
    const label = typeof raw.label === "string" && raw.label.trim() ? raw.label.trim() : name;
    const entry = { name, type, label };
    if ((type === "select" || type === "multi_select") && Array.isArray(raw.options)) {
      entry.options = raw.options.map((o) => String(o).trim()).filter(Boolean);
    }
    seen.add(name);
    normalized.push(entry);
  }
  return normalized;
}

// Создаёт пользовательскую базу:
//   1. Валидирует columns.
//   2. Генерирует имя таблицы: team_custom_<slug>_<timestamp>.
//   3. Вызывает SQL-функцию create_custom_table (миграция 0034).
//   4. Записывает строку в реестр team_custom_databases.
//
// Возвращает запись реестра.
export async function createDatabase({ name, description, columns }) {
  const trimmedName = String(name ?? "").trim();
  if (!trimmedName) {
    throw new Error("Поле name обязательно.");
  }
  if (trimmedName.length > 120) {
    throw new Error("Имя базы слишком длинное (макс. 120 символов).");
  }
  const normalizedColumns = validateColumns(columns);

  const slug = slugify(trimmedName);
  if (!slug) {
    throw new Error(
      "Не удалось вывести slug из имени. Используйте буквы (латиницу или кириллицу), цифры или пробелы.",
    );
  }
  const tableName = `team_custom_${slug}_${Date.now().toString(36)}`;

  const client = getServiceRoleClient();
  // 1. Создаём таблицу
  const { error: rpcError } = await client.rpc("create_custom_table", {
    p_table_name: tableName,
    p_columns: normalizedColumns.map(({ name, type }) => ({ name, type })),
  });
  if (rpcError) {
    throw new Error(`Не удалось создать таблицу: ${rpcError.message}`);
  }

  // 2. Регистрируем в реестре. schema_definition — единственный источник
  // правды о колонках для UI; реальная таблица не «знает» про label / options.
  const schema = {
    columns: normalizedColumns.map((c) => ({
      key: c.name,
      label: c.label,
      type: c.type,
      ...(c.options ? { options: c.options } : {}),
    })),
  };
  const { data, error } = await client
    .from("team_custom_databases")
    .insert({
      name: trimmedName,
      description: description ? String(description).trim() : null,
      table_name: tableName,
      db_type: "custom",
      schema_definition: schema,
    })
    .select()
    .maybeSingle();
  if (error) {
    // Тут уже неприятная ситуация: таблица создана, реестр не записал.
    // Кидаем ошибку наверх — caller увидит, что что-то пошло не так.
    throw new Error(`Таблица создана, но не удалось зарегистрировать базу: ${error.message}`);
  }
  return data;
}

// Внутренняя валидация payload для INSERT/UPDATE по schema_definition.
// Не пускаем неизвестные ключи и сильно неправильные типы. Реальную
// проверку (cast в SQL-тип) делает Postgres.
function validateRecordPayload(schema, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("data должен быть объектом.");
  }
  const allowed = new Map();
  for (const col of schema?.columns ?? []) {
    if (col && typeof col.key === "string") {
      allowed.set(col.key, col);
    }
  }
  const out = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!allowed.has(key)) {
      throw new Error(`Поле «${key}» не описано в схеме базы.`);
    }
    if (value === null || value === undefined || value === "") {
      out[key] = null;
      continue;
    }
    const col = allowed.get(key);
    if (col.type === "multi_select" && !Array.isArray(value)) {
      throw new Error(`Поле «${key}» (multi_select) должно быть массивом.`);
    }
    if (col.type === "boolean" && typeof value !== "boolean") {
      throw new Error(`Поле «${key}» (boolean) должно быть true/false.`);
    }
    if (col.type === "number") {
      const n = Number(value);
      if (!Number.isFinite(n)) {
        throw new Error(`Поле «${key}» (number) должно быть числом.`);
      }
      out[key] = n;
      continue;
    }
    out[key] = value;
  }
  return out;
}

// Только пользовательские базы поддерживают write — referensy/competitors_placeholder
// мы не модифицируем из этого API.
async function getCustomDbOrThrow(databaseId) {
  const db = await getDatabaseById(databaseId);
  if (!db) {
    throw new Error("База не найдена.");
  }
  if (db.db_type !== "custom") {
    throw new Error(
      `База «${db.name}» (${db.db_type}) не поддерживает изменение записей через мастер.`,
    );
  }
  return db;
}

export async function addRecord(databaseId, payload) {
  const db = await getCustomDbOrThrow(databaseId);
  const data = validateRecordPayload(db.schema_definition, payload);
  const client = getServiceRoleClient();
  const { data: row, error } = await client
    .from(db.table_name)
    .insert(data)
    .select()
    .maybeSingle();
  if (error) {
    throw new Error(`Не удалось добавить запись: ${error.message}`);
  }
  return row;
}

export async function updateRecord(databaseId, recordId, payload) {
  if (!recordId) throw new Error("recordId обязателен.");
  const db = await getCustomDbOrThrow(databaseId);
  const data = validateRecordPayload(db.schema_definition, payload);
  const client = getServiceRoleClient();
  const { data: row, error } = await client
    .from(db.table_name)
    .update(data)
    .eq("id", recordId)
    .select()
    .maybeSingle();
  if (error) {
    throw new Error(`Не удалось обновить запись: ${error.message}`);
  }
  return row;
}

export async function deleteRecord(databaseId, recordId) {
  if (!recordId) throw new Error("recordId обязателен.");
  const db = await getCustomDbOrThrow(databaseId);
  const client = getServiceRoleClient();
  const { error } = await client.from(db.table_name).delete().eq("id", recordId);
  if (error) {
    throw new Error(`Не удалось удалить запись: ${error.message}`);
  }
  return true;
}
