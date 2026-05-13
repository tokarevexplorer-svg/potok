// Сервис агентов команды (Сессия 9 этапа 2, пункт 7).
//
// Обёртка над таблицей team_agents (миграция 0017) — реестр действующих
// и архивных агентов. Каждая мутация дополнительно пишет строку в
// team_agent_history (отдельная запись на каждое изменённое поле), чтобы
// через три месяца можно было понять «почему агент стал работать иначе».
//
// Чего НЕ умеет (намеренно):
//   - Мастер создания агента с голосовым черновиком Role — 🔁 пункт 12.
//   - Карточка сотрудника со всеми вкладками — 🔁 пункт 12.
//   - Awareness-блок в промпте — 🔁 пункт 12 (через getAgentRoster).
//   - Handoff между агентами — 🔁 пункт 8.
//   - Самозадачи и триггеры autonomy_level=1 — 🔁 пункт 15.
//
// Все сообщения об ошибках — на русском.

import { getServiceRoleClient } from "./teamSupabase.js";
import { uploadFile, downloadFile } from "./teamStorage.js";
import { ensureRule } from "./memoryService.js";
import { invalidatePromptCache } from "./promptBuilder.js";

const TABLE = "team_agents";
const HISTORY_TABLE = "team_agent_history";
const PROMPTS_BUCKET = "team-prompts";

// Путь до Role-файла агента в bucket'е team-prompts.
//
// Эмпирически: Supabase Storage отбивает кириллицу в ключах объектов с
// ошибкой `Invalid key: …` (несмотря на то что в документации сказано, что
// поддерживаются произвольные строки). До Сессии 11 здесь была кириллическая
// папка «Должностные инструкции» — все вызовы `saveRoleFile` тихо падали в
// try/catch (createAgent → console.error, без откатывания агента). То есть
// Role-файлы вообще не сохранялись, никаких данных в Storage нет.
//
// Сессия 11: перешли на `roles/<agent_id>.md`. Латиница, slug стабилен
// (id агента нельзя сменить), путь короткий и читаемый в Dashboard.
const ROLES_FOLDER = "roles";
function rolePath(agentId) {
  return `${ROLES_FOLDER}/${agentId}.md`;
}

// Slug: латиница, цифры, дефис. Без подчёркиваний и слэшей — чтобы id можно
// было класть в URL и в имя файла без экранирования. Регистр пока разрешаем
// любой (БД primary key и так сохранит как есть), но рекомендуем kebab-case.
const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,63}$/;

const VALID_STATUSES = new Set(["active", "paused", "archived"]);
const VALID_DEPARTMENTS = new Set(["analytics", "preproduction", "production"]);
const VALID_AUTONOMY = new Set([0, 1]);

// Поля, которые разрешено патчить через updateAgent(). Любые другие
// игнорируются — это защита от случайного PATCH /api/team/agents/:id с лишним
// телом, который мог бы перетереть id, created_at или status (для статуса
// есть отдельные archive / restore).
const UPDATABLE_FIELDS = new Set([
  "display_name",
  "role_title",
  "department",
  "avatar_url",
  "biography",
  "database_access",
  "available_tools",
  "allowed_task_templates",
  "orchestration_mode",
  "autonomy_level",
  "default_model",
  "purpose",
  "success_criteria",
]);

// Какое значение change_type писать в history при изменении каждого поля.
// Если поля нет в этой карте — пишем generic 'field_updated'.
const FIELD_CHANGE_TYPES = {
  display_name: "display_name_updated",
  role_title: "role_updated",
  department: "department_updated",
  avatar_url: "avatar_updated",
  biography: "biography_updated",
  database_access: "databases_changed",
  available_tools: "tools_changed",
  allowed_task_templates: "templates_changed",
  orchestration_mode: "orchestration_changed",
  autonomy_level: "autonomy_changed",
  default_model: "model_changed",
};

function assertAgentId(agentId) {
  if (!agentId || typeof agentId !== "string" || !agentId.trim()) {
    throw new Error("agentId обязателен и должен быть непустой строкой.");
  }
}

// Для history.old_value / new_value БД ждёт текст, а в коде у нас могут быть
// массивы / объекты / boolean. Сериализуем единообразно: null → null, строки —
// как есть, всё остальное — JSON.stringify.
function serializeForHistory(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

// Грубое сравнение значений «было / стало» — нужно, чтобы не плодить пустые
// записи в history, когда PATCH прислал то же значение, что уже было.
// Массивы и объекты сравниваем по JSON-сериализации.
function valuesEqual(a, b) {
  if (a === b) return true;
  if (a === null || a === undefined) return b === null || b === undefined;
  if (b === null || b === undefined) return false;
  if (typeof a === "object" || typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
}

async function insertHistory(client, { agentId, changeType, oldValue, newValue, comment }) {
  const { error } = await client.from(HISTORY_TABLE).insert({
    agent_id: agentId,
    change_type: changeType,
    old_value: serializeForHistory(oldValue),
    new_value: serializeForHistory(newValue),
    comment: comment ?? null,
  });
  if (error) {
    // History — не критичный путь. Логируем и едем дальше: основная мутация
    // уже прошла, нет смысла её откатывать из-за лога.
    console.error(`[team/agents] insertHistory failed for ${agentId}/${changeType}: ${error.message}`);
  }
}

// =========================================================================
// Чтение
// =========================================================================

// Возвращает агентов с указанным статусом (или всех — status='all').
// Сортировка по created_at ASC — старые сверху, порядок стабильный.
export async function listAgents({ status = "active" } = {}) {
  if (status !== "all" && !VALID_STATUSES.has(status)) {
    throw new Error(`Неизвестный status «${status}». Допустимо: active, paused, archived, all.`);
  }
  const client = getServiceRoleClient();
  let query = client.from(TABLE).select("*").order("created_at", { ascending: true });
  if (status !== "all") {
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`Не удалось получить список агентов: ${error.message}`);
  }
  return data ?? [];
}

// Один агент по id. Бросает ошибку с понятным текстом, если не найден.
export async function getAgent(agentId) {
  assertAgentId(agentId);
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("id", agentId)
    .maybeSingle();
  if (error) {
    throw new Error(`Не удалось получить агента «${agentId}»: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Агент «${agentId}» не найден.`);
  }
  return data;
}

// Сжатый «ростер» команды для Awareness-блока в promptBuilder (пункт 12).
// Только активные агенты, только базовые поля. Это лёгкий эндпоинт, его
// можно дёргать на каждой сборке промпта без боли по латентности.
export async function getAgentRoster() {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .select("id, display_name, role_title, department, status")
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) {
    throw new Error(`Не удалось получить ростер команды: ${error.message}`);
  }
  return data ?? [];
}

// История изменений агента. По умолчанию последние 50 записей — свежие сверху.
export async function getAgentHistory(agentId, { limit = 50 } = {}) {
  assertAgentId(agentId);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(HISTORY_TABLE)
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(safeLimit);
  if (error) {
    throw new Error(`Не удалось получить историю агента «${agentId}»: ${error.message}`);
  }
  return data ?? [];
}

// =========================================================================
// Создание
// =========================================================================

// INSERT + строка в history с change_type='created'. Все поля кроме id и
// display_name — опциональные; БД проставит дефолты.
export async function createAgent(fields = {}) {
  const id = typeof fields.id === "string" ? fields.id.trim() : "";
  const displayName = typeof fields.display_name === "string" ? fields.display_name.trim() : "";

  if (!id) {
    throw new Error("Поле id обязательно — это slug агента (латиница, цифры, дефисы).");
  }
  if (!ID_RE.test(id)) {
    throw new Error(
      `Некорректный id «${id}». Допустимы только латинские буквы, цифры и дефисы, длина 1–64.`,
    );
  }
  if (!displayName) {
    throw new Error("Поле display_name обязательно.");
  }
  if (fields.department !== undefined && fields.department !== null) {
    if (!VALID_DEPARTMENTS.has(fields.department)) {
      throw new Error(
        `Неизвестный department «${fields.department}». Допустимо: analytics, preproduction, production.`,
      );
    }
  }
  if (fields.autonomy_level !== undefined && fields.autonomy_level !== null) {
    if (!VALID_AUTONOMY.has(Number(fields.autonomy_level))) {
      throw new Error("autonomy_level должен быть 0 или 1.");
    }
  }

  const row = {
    id,
    display_name: displayName,
    role_title: fields.role_title ?? null,
    department: fields.department ?? null,
    avatar_url: fields.avatar_url ?? null,
    biography: fields.biography ?? null,
    database_access: fields.database_access ?? [],
    available_tools: fields.available_tools ?? [],
    allowed_task_templates: fields.allowed_task_templates ?? [],
    orchestration_mode: !!fields.orchestration_mode,
    autonomy_level: fields.autonomy_level !== undefined ? Number(fields.autonomy_level) : 0,
    default_model: fields.default_model ?? null,
    purpose: fields.purpose ?? null,
    success_criteria: fields.success_criteria ?? null,
  };

  const client = getServiceRoleClient();
  const { data, error } = await client.from(TABLE).insert(row).select().maybeSingle();
  if (error) {
    if (error.code === "23505") {
      throw new Error(`Агент с id «${id}» уже существует.`);
    }
    throw new Error(`Не удалось создать агента: ${error.message}`);
  }

  await insertHistory(client, {
    agentId: id,
    changeType: "created",
    oldValue: null,
    newValue: displayName,
    comment: fields.comment ?? null,
  });

  // Role-файл и seed-rules — мастер передаёт их при создании. Любая ошибка
  // здесь не должна откатывать создание агента (запись уже в БД), поэтому
  // ловим и логируем; мастер сообщит пользователю, что Role можно дозаписать
  // через карточку сотрудника.
  const roleContent =
    typeof fields.role_content === "string" ? fields.role_content : null;
  if (roleContent && roleContent.trim()) {
    try {
      await saveRoleFile(id, roleContent);
    } catch (storageErr) {
      console.error(
        `[team/agents] не удалось сохранить Role «${id}»:`,
        storageErr,
      );
    }
  }

  const seedRules = Array.isArray(fields.seed_rules) ? fields.seed_rules : [];
  if (seedRules.length > 0) {
    for (const rule of seedRules) {
      const text = typeof rule === "string" ? rule.trim() : "";
      if (!text) continue;
      try {
        await ensureRule({ agentId: id, content: text, source: "seed" });
      } catch (ruleErr) {
        console.error(
          `[team/agents] не удалось добавить seed-правило для ${id}:`,
          ruleErr,
        );
      }
    }
  }

  // Состав активных агентов изменился + содержимое промпта (новый Role,
  // seed_rules) — инвалидируем общий prompt-кеш. Сессия 12: единый канал
  // через invalidatePromptCache (бампает instructionVersion + awareness).
  invalidatePromptCache();

  // Сессия 42: объявление в Telegram-чат от системного бота. Fire-and-forget,
  // динамический импорт — чтобы избежать циклической зависимости
  // (telegramService → agentService → telegramService).
  setImmediate(async () => {
    try {
      const { announceAgentRosterChange } = await import("./telegramService.js");
      await announceAgentRosterChange("joined", displayName);
    } catch (err) {
      console.warn(`[team/agents] announce join failed: ${err?.message ?? err}`);
    }
  });

  return data;
}

// =========================================================================
// Обновление
// =========================================================================

// Частичное обновление. Принимает любой набор полей из UPDATABLE_FIELDS;
// для каждого реально изменившегося поля пишет отдельную строку в history
// (со стартовым/конечным значением). Опц. `comment` идёт в каждую строку
// истории — это объяснение Влада «зачем поправил».
//
// Что НЕ обновляется этим методом:
//   - id, created_at — нельзя менять (для смены id — пересоздание агента).
//   - status — отдельные методы archiveAgent / restoreAgent.
//   - updated_at — выставляется автоматически.
export async function updateAgent(agentId, fields = {}) {
  assertAgentId(agentId);
  const comment = typeof fields.comment === "string" ? fields.comment : null;

  const current = await getAgent(agentId); // бросит, если нет — это правильно.

  const patch = { updated_at: new Date().toISOString() };
  const changes = []; // [{ field, old, new }]

  for (const [key, value] of Object.entries(fields)) {
    if (key === "comment") continue;
    if (!UPDATABLE_FIELDS.has(key)) continue;

    // purpose / success_criteria — обычные текстовые поля, без валидации.
    // В историю их изменения не пишем отдельным change_type — generic
    // 'field_updated' через FIELD_CHANGE_TYPES (см. ниже).

    // Валидации, специфичные для поля.
    if (key === "department" && value !== null && value !== undefined) {
      if (!VALID_DEPARTMENTS.has(value)) {
        throw new Error(
          `Неизвестный department «${value}». Допустимо: analytics, preproduction, production.`,
        );
      }
    }
    if (key === "autonomy_level" && value !== null && value !== undefined) {
      if (!VALID_AUTONOMY.has(Number(value))) {
        throw new Error("autonomy_level должен быть 0 или 1.");
      }
    }
    if (key === "display_name") {
      const trimmed = typeof value === "string" ? value.trim() : "";
      if (!trimmed) {
        throw new Error("display_name не может быть пустым.");
      }
      patch[key] = trimmed;
      if (!valuesEqual(current[key], trimmed)) {
        changes.push({ field: key, old: current[key], new: trimmed });
      }
      continue;
    }

    let normalized = value;
    if (key === "orchestration_mode") normalized = !!value;
    if (key === "autonomy_level" && value !== null && value !== undefined) {
      normalized = Number(value);
    }

    patch[key] = normalized;
    if (!valuesEqual(current[key], normalized)) {
      changes.push({ field: key, old: current[key], new: normalized });
    }
  }

  // Только updated_at — никаких реальных полей не передано. Считаем это
  // ошибкой пользователя, чтобы не плодить «пустые» updated_at.
  if (changes.length === 0) {
    throw new Error("Нечего обновлять: ни одно из переданных полей не изменилось.");
  }

  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .update(patch)
    .eq("id", agentId)
    .select()
    .maybeSingle();
  if (error) {
    throw new Error(`Не удалось обновить агента «${agentId}»: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Агент «${agentId}» не найден.`);
  }

  for (const change of changes) {
    await insertHistory(client, {
      agentId,
      changeType: FIELD_CHANGE_TYPES[change.field] ?? "field_updated",
      oldValue: change.old,
      newValue: change.new,
      comment,
    });
  }

  // Любое поле агента может попасть в промпт (модель, инструменты, доступы,
  // департамент в Awareness и т.п.) или влиять на сборку. Инвалидируем
  // prompt-кеш — следующая задача увидит свежие данные. Сессия 12.
  invalidatePromptCache();

  return data;
}

// =========================================================================
// Архивация / восстановление (мягкое удаление)
// =========================================================================

async function setStatus(agentId, newStatus, comment) {
  assertAgentId(agentId);
  if (!VALID_STATUSES.has(newStatus)) {
    throw new Error(`Неизвестный status «${newStatus}».`);
  }

  const current = await getAgent(agentId);
  if (current.status === newStatus) {
    return current;
  }

  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .update({ status: newStatus, updated_at: new Date().toISOString() })
    .eq("id", agentId)
    .select()
    .maybeSingle();
  if (error) {
    throw new Error(`Не удалось изменить статус агента «${agentId}»: ${error.message}`);
  }

  await insertHistory(client, {
    agentId,
    changeType: "status_changed",
    oldValue: current.status,
    newValue: newStatus,
    comment: comment ?? null,
  });

  // Любая смена статуса меняет состав активных агентов (или для paused —
  // меняет роль агента в команде). Сессия 12: единый канал инвалидации
  // через invalidatePromptCache (бампает instructionVersion + awareness).
  invalidatePromptCache();

  // Сессия 42: объявление в Telegram. Маппинг статуса на тип сообщения.
  // resumed = вернулся из paused или archived в active.
  const announceKind =
    newStatus === "paused"
      ? "paused"
      : newStatus === "archived"
        ? "archived"
        : newStatus === "active"
          ? "resumed"
          : null;
  if (announceKind) {
    setImmediate(async () => {
      try {
        const { announceAgentRosterChange } = await import("./telegramService.js");
        await announceAgentRosterChange(announceKind, current.display_name);
      } catch (err) {
        console.warn(`[team/agents] announce status failed: ${err?.message ?? err}`);
      }
    });
  }

  return data;
}

export async function archiveAgent(agentId, { comment } = {}) {
  return setStatus(agentId, "archived", comment);
}

export async function restoreAgent(agentId, { comment } = {}) {
  return setStatus(agentId, "active", comment);
}

export async function pauseAgent(agentId, { comment } = {}) {
  return setStatus(agentId, "paused", comment);
}

// =========================================================================
// Role-файлы в Storage
// =========================================================================

// Сохраняет (или перезаписывает) Role-файл агента в team-prompts/roles/<id>.md.
// Используется мастером создания и редактором карточки сотрудника.
// Сессия 12: после записи инвалидируем prompt-кеш — следующая задача этого
// агента подтянет обновлённый Role.
export async function saveRoleFile(agentId, content) {
  const id = typeof agentId === "string" ? agentId.trim() : "";
  if (!id) {
    throw new Error("agentId обязателен для сохранения Role-файла.");
  }
  const text = typeof content === "string" ? content : String(content ?? "");
  await uploadFile(PROMPTS_BUCKET, rolePath(id), text);
  invalidatePromptCache();
  return true;
}

// Загружает Role-файл агента. Возвращает текст или null, если файла нет.
// Используется promptBuilder.loadRole и эндпоинтом GET /api/team/agents/:id/role.
export async function getRoleFile(agentId) {
  const id = typeof agentId === "string" ? agentId.trim() : "";
  if (!id) return null;
  try {
    return await downloadFile(PROMPTS_BUCKET, rolePath(id));
  } catch {
    return null;
  }
}

// Слаг — на случай, если фронт прислал чистое имя на кириллице. Реализация
// упрощённая: транслит, lowercase, дефисы вместо пробелов, дроп всего
// лишнего. Совпадает с поведением фронтового генератора (см. мастер).
const TRANSLIT_MAP = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya",
};

export function generateSlug(displayName) {
  const src = String(displayName ?? "").trim().toLowerCase();
  if (!src) return "";
  let out = "";
  for (const ch of src) {
    if (TRANSLIT_MAP[ch] !== undefined) {
      out += TRANSLIT_MAP[ch];
    } else if (/[a-z0-9]/.test(ch)) {
      out += ch;
    } else if (/\s|-|_|\./.test(ch)) {
      out += "-";
    }
    // прочие символы игнорируем
  }
  // схлопываем кратные дефисы и подрезаем края
  return out.replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}
