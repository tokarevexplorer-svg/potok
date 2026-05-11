// Сервис инструментов команды (Сессия 20 этапа 2, пункт 16).
//
// Реестр всех инструментов (`team_tools`) + связка агент-инструмент
// (`team_agent_tools`) + чтение методички из Storage по `manifest_path`.
//
// «Hands» агента (тип executor) — методички идут в третью секцию Awareness
// промпта (см. promptBuilder.buildAwareness). Тип system пока не идёт никуда
// (зарезервирован под Apify в Сессии 33).
//
// Изменение состава инструментов или привязок дёргает invalidatePromptCache
// в caller'е (роут / Админка) — здесь сервис чистый CRUD.

import { getServiceRoleClient } from "./teamSupabase.js";
import { downloadFile } from "./teamStorage.js";

const TABLE = "team_tools";
const LINK_TABLE = "team_agent_tools";
const PROMPTS_BUCKET = "team-prompts";

const VALID_TYPES = new Set(["executor", "system"]);
const VALID_STATUSES = new Set(["active", "inactive", "error"]);

function assertId(id, label = "id") {
  if (!id || typeof id !== "string" || !id.trim()) {
    throw new Error(`${label} обязателен и должен быть непустой строкой.`);
  }
}

// =========================================================================
// Реестр инструментов
// =========================================================================

export async function listTools(type = "all") {
  if (type !== "all" && !VALID_TYPES.has(type)) {
    throw new Error(`Неизвестный type «${type}». Допустимо: executor, system, all.`);
  }
  const client = getServiceRoleClient();
  let query = client.from(TABLE).select("*").order("created_at", { ascending: true });
  if (type !== "all") query = query.eq("tool_type", type);
  const { data, error } = await query;
  if (error) {
    throw new Error(`Не удалось получить список инструментов: ${error.message}`);
  }
  return data ?? [];
}

export async function getToolById(id) {
  assertId(id);
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`Не удалось получить инструмент «${id}»: ${error.message}`);
  }
  return data ?? null;
}

export async function createTool({
  id = null,
  name,
  description = null,
  tool_type = "executor",
  manifest_path = null,
  connection_config = null,
  status = "inactive",
}) {
  if (!name || typeof name !== "string" || !name.trim()) {
    throw new Error("name инструмента обязательно.");
  }
  if (!VALID_TYPES.has(tool_type)) {
    throw new Error(`Неизвестный tool_type «${tool_type}». Допустимо: executor, system.`);
  }
  if (!VALID_STATUSES.has(status)) {
    throw new Error(`Неизвестный status «${status}». Допустимо: active, inactive, error.`);
  }
  const row = {
    name: name.trim(),
    description: description ? String(description).trim() || null : null,
    tool_type,
    manifest_path: manifest_path ? String(manifest_path).trim() || null : null,
    connection_config: connection_config ?? {},
    status,
  };
  if (id) row.id = String(id).trim();

  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .insert(row)
    .select()
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      throw new Error("Инструмент с таким id или именем уже существует.");
    }
    throw new Error(`Не удалось создать инструмент: ${error.message}`);
  }
  return data;
}

export async function updateTool(id, fields = {}) {
  assertId(id);
  const patch = {};
  if (fields.name !== undefined) {
    const v = String(fields.name ?? "").trim();
    if (!v) throw new Error("name не может быть пустым.");
    patch.name = v;
  }
  if (fields.description !== undefined) {
    patch.description = fields.description
      ? String(fields.description).trim() || null
      : null;
  }
  if (fields.tool_type !== undefined) {
    if (!VALID_TYPES.has(fields.tool_type)) {
      throw new Error(`Неизвестный tool_type «${fields.tool_type}».`);
    }
    patch.tool_type = fields.tool_type;
  }
  if (fields.manifest_path !== undefined) {
    patch.manifest_path = fields.manifest_path
      ? String(fields.manifest_path).trim() || null
      : null;
  }
  if (fields.connection_config !== undefined) {
    patch.connection_config = fields.connection_config ?? {};
  }
  if (fields.status !== undefined) {
    if (!VALID_STATUSES.has(fields.status)) {
      throw new Error(`Неизвестный status «${fields.status}».`);
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
    throw new Error(`Не удалось обновить инструмент: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Инструмент «${id}» не найден.`);
  }
  return data;
}

// Чтение методички из Storage. Возвращает строку или null, если файла нет
// (это нормальный кейс — system-инструменты не имеют методичек).
export async function getToolManifest(toolId) {
  const tool = await getToolById(toolId);
  if (!tool) return null;
  if (!tool.manifest_path) return null;
  try {
    const text = await downloadFile(PROMPTS_BUCKET, tool.manifest_path);
    return text ?? "";
  } catch (err) {
    console.warn(
      `[toolService] методичка ${tool.manifest_path} недоступна: ${err?.message ?? err}`,
    );
    return null;
  }
}

// =========================================================================
// Привязки агент ↔ инструмент
// =========================================================================

// Список инструментов агента (с JOIN на team_tools для деталей).
// Опц. фильтр onlyActive — отдаёт только status='active' (используется
// при сборке Awareness, чтобы не подмешать неактивные).
export async function getAgentTools(agentId, { onlyActive = false } = {}) {
  assertId(agentId, "agentId");
  const client = getServiceRoleClient();
  let query = client
    .from(LINK_TABLE)
    .select("tool:team_tools!inner(*)")
    .eq("agent_id", agentId);
  const { data, error } = await query;
  if (error) {
    throw new Error(`Не удалось получить инструменты агента ${agentId}: ${error.message}`);
  }
  const tools = (data ?? [])
    .map((row) => row.tool)
    .filter((t) => t && (!onlyActive || t.status === "active"));
  return tools;
}

// Полная замена набора инструментов агента: удаляет старые привязки и
// вставляет новые (одна транзакция через RPC бы дала атомарность, пока
// делаем две операции — для сценария «UI сохранил список» этого хватает).
export async function setAgentTools(agentId, toolIds = []) {
  assertId(agentId, "agentId");
  if (!Array.isArray(toolIds)) {
    throw new Error("toolIds должен быть массивом строк.");
  }
  const cleaned = [...new Set(toolIds.filter((id) => typeof id === "string" && id.trim()))];

  const client = getServiceRoleClient();
  const { error: delErr } = await client
    .from(LINK_TABLE)
    .delete()
    .eq("agent_id", agentId);
  if (delErr) {
    throw new Error(`Не удалось очистить старые привязки инструментов: ${delErr.message}`);
  }
  if (cleaned.length === 0) {
    return [];
  }
  const rows = cleaned.map((toolId) => ({ agent_id: agentId, tool_id: toolId }));
  const { error: insErr } = await client.from(LINK_TABLE).insert(rows);
  if (insErr) {
    throw new Error(`Не удалось сохранить привязки инструментов: ${insErr.message}`);
  }
  return cleaned;
}
