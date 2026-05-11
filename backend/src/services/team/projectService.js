// Сервис проектов команды (Сессия 16 этапа 2, пункт 14).
//
// Проекты — простые навигационные теги для группировки задач. Без иерархии,
// дедлайнов, владельцев. Структура зафиксирована в миграции 0023.
//
// Все мутации через service-role клиент (RLS открыт, но единообразно).

import { getServiceRoleClient } from "./teamSupabase.js";

const TABLE = "team_projects";
const VALID_STATUSES = new Set(["active", "archived"]);

function assertId(id) {
  if (!id || typeof id !== "string" || !id.trim()) {
    throw new Error("id проекта обязателен и должен быть непустой строкой.");
  }
}

// Список проектов с фильтром по статусу. По умолчанию — активные.
// status='all' возвращает все.
export async function listProjects(status = "active") {
  if (status !== "all" && !VALID_STATUSES.has(status)) {
    throw new Error(`Неизвестный status «${status}». Допустимо: active, archived, all.`);
  }
  const client = getServiceRoleClient();
  let query = client.from(TABLE).select("*").order("created_at", { ascending: false });
  if (status !== "all") query = query.eq("status", status);
  const { data, error } = await query;
  if (error) {
    throw new Error(`Не удалось получить список проектов: ${error.message}`);
  }
  return data ?? [];
}

export async function getProjectById(id) {
  assertId(id);
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`Не удалось получить проект «${id}»: ${error.message}`);
  }
  return data ?? null;
}

// Создание проекта. name обязателен. id опциональный — если задан,
// можно использовать как slug; иначе БД сгенерирует uuid.
export async function createProject({ id = null, name, description = null }) {
  const cleanName = typeof name === "string" ? name.trim() : "";
  if (!cleanName) {
    throw new Error("name проекта обязательно.");
  }
  const row = {
    name: cleanName,
    description: description ? String(description).trim() || null : null,
  };
  if (id) row.id = String(id).trim();

  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .insert(row)
    .select()
    .maybeSingle();
  if (error) {
    // Уникальное нарушение по id — выдаём понятный текст.
    if (error.code === "23505") {
      throw new Error(`Проект с таким id уже существует.`);
    }
    throw new Error(`Не удалось создать проект: ${error.message}`);
  }
  return data;
}

// Изменение статуса (активный ↔ архив) или имени/описания.
// Поля: { name?, description?, status? }. Хотя бы одно.
export async function updateProject(id, fields = {}) {
  assertId(id);
  const patch = {};
  if (fields.name !== undefined) {
    const v = String(fields.name ?? "").trim();
    if (!v) throw new Error("name не может быть пустым.");
    patch.name = v;
  }
  if (fields.description !== undefined) {
    patch.description = fields.description ? String(fields.description).trim() || null : null;
  }
  if (fields.status !== undefined) {
    if (!VALID_STATUSES.has(fields.status)) {
      throw new Error(`Неизвестный status «${fields.status}». Допустимо: active, archived.`);
    }
    patch.status = fields.status;
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("Нечего обновлять — передайте хотя бы одно поле.");
  }

  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();
  if (error) {
    throw new Error(`Не удалось обновить проект: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Проект «${id}» не найден.`);
  }
  return data;
}

// Мягкая архивация — short-cut для updateProject(id, { status: 'archived' }).
export async function archiveProject(id) {
  return updateProject(id, { status: "archived" });
}
