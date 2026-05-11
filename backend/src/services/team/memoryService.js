// Сервис памяти агентов (Сессия 8 этапа 2, этап 1 пункт 3).
//
// Обёртка над таблицей team_agent_memory (миграция 0016). Два типа записей:
//
//   * `rule` — обобщённое правило. Активные правила (`status='active'`)
//     попадают целиком в слой `memory` промпта (см. promptBuilder.js,
//     loadMemoryRules). Сортировка по created_at ASC — старые первыми,
//     чтобы порядок правил был стабильным.
//
//   * `episode` — сырой эпизод из обратной связи Влада. В промпт НЕ
//     попадает. Используется Curator'ом (этап 2 пункт 9) для формирования
//     кандидатов в правила.
//
// Чего НЕ умеет (намеренно):
//   - Парсер обратной связи (создание эпизодов из оценок задач) —
//     🔁 этап 2, пункт 9.
//   - Фоновое сжатие эпизодов в кандидаты — 🔁 этап 2, пункт 9.
//   - Curator — 🔁 этап 2, пункт 9.
//
// Все сообщения об ошибках — на русском.

import { getServiceRoleClient } from "./teamSupabase.js";

const TABLE = "team_agent_memory";

const VALID_SOURCES = new Set(["manual", "seed", "feedback", "curator"]);
const VALID_STATUSES = new Set(["active", "archived", "rejected", "candidate"]);

function assertAgentId(agentId) {
  if (!agentId || typeof agentId !== "string" || !agentId.trim()) {
    throw new Error("agentId обязателен и должен быть непустой строкой.");
  }
}

// Активные правила агента, отсортированные по дате создания (старые → новые).
// Используется promptBuilder.js для слоя memory и UI карточки сотрудника.
export async function getRulesForAgent(agentId) {
  assertAgentId(agentId);
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .select("*")
    .eq("agent_id", agentId)
    .eq("type", "rule")
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Не удалось получить правила для агента ${agentId}: ${error.message}`);
  }
  return data ?? [];
}

// Эпизоды агента с фильтром по статусу (по умолчанию активные).
// limit — по умолчанию 100, чтобы не вытащить весь журнал случайно.
export async function getEpisodesForAgent(agentId, { status = "active", limit = 100 } = {}) {
  assertAgentId(agentId);
  if (status !== "all" && !VALID_STATUSES.has(status)) {
    throw new Error(`Неизвестный status «${status}». Допустимо: active, archived, rejected, candidate, all.`);
  }
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 1000));

  const client = getServiceRoleClient();
  let query = client
    .from(TABLE)
    .select("*")
    .eq("agent_id", agentId)
    .eq("type", "episode")
    .order("created_at", { ascending: false })
    .limit(safeLimit);

  if (status !== "all") {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Не удалось получить эпизоды для агента ${agentId}: ${error.message}`);
  }
  return data ?? [];
}

// Все записи памяти для агента (правила + эпизоды). Фильтры — для UI.
//   type:   'rule' | 'episode' | 'all' (по умолчанию все)
//   status: 'active' | 'archived' | 'rejected' | 'candidate' | 'all' (по умолчанию все)
export async function getAllMemory(agentId, { type = "all", status = "all" } = {}) {
  assertAgentId(agentId);
  if (type !== "all" && type !== "rule" && type !== "episode") {
    throw new Error(`Неизвестный type «${type}». Допустимо: rule, episode, all.`);
  }
  if (status !== "all" && !VALID_STATUSES.has(status)) {
    throw new Error(`Неизвестный status «${status}». Допустимо: active, archived, rejected, candidate, all.`);
  }

  const client = getServiceRoleClient();
  let query = client
    .from(TABLE)
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false });

  if (type !== "all") query = query.eq("type", type);
  if (status !== "all") query = query.eq("status", status);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Не удалось получить память агента ${agentId}: ${error.message}`);
  }
  return data ?? [];
}

// Добавление правила. source:
//   'seed'    — стартовое правило при создании агента (seed-script);
//   'manual'  — Влад добавил через UI;
//   'feedback'— одобренный кандидат из эпизодов (этап 2 пункт 9);
//   'curator' — сгенерированное Curator'ом правило (этап 2 пункт 9).
export async function addRule({ agentId, content, source = "manual", pinned = false }) {
  assertAgentId(agentId);
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) {
    throw new Error("Текст правила обязателен.");
  }
  if (!VALID_SOURCES.has(source)) {
    throw new Error(`Неизвестный source «${source}». Допустимо: manual, seed, feedback, curator.`);
  }

  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .insert({
      agent_id: agentId,
      type: "rule",
      content: text,
      source,
      status: "active",
      pinned: !!pinned,
    })
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`Не удалось сохранить правило: ${error.message}`);
  }
  return data;
}

// Добавление эпизода. Используется парсером обратной связи (этап 2 пункт 9).
// На Сессии 8 — голый CRUD-метод без вызывающих, оставлен как заготовка.
export async function addEpisode({ agentId, content, score = null, taskId = null, source = "feedback" }) {
  assertAgentId(agentId);
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) {
    throw new Error("Текст эпизода обязателен.");
  }
  if (!VALID_SOURCES.has(source)) {
    throw new Error(`Неизвестный source «${source}». Допустимо: manual, seed, feedback, curator.`);
  }
  if (score !== null && score !== undefined) {
    const n = Number(score);
    if (!Number.isInteger(n) || n < 0 || n > 5) {
      throw new Error("score должен быть целым числом 0–5 или null.");
    }
  }

  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .insert({
      agent_id: agentId,
      type: "episode",
      content: text,
      source,
      status: "active",
      score: score ?? null,
      task_id: taskId ?? null,
    })
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`Не удалось сохранить эпизод: ${error.message}`);
  }
  return data;
}

// Частичное обновление записи. Поддерживаемые поля:
//   content (строка) — редактирование текста;
//   status  (active|archived|rejected|candidate) — смена статуса;
//   pinned  (boolean) — pin/unpin правила.
// Все остальные поля игнорируются. Если переход status=active|rejected
// из candidate — выставляется reviewed_at = now().
export async function updateMemory(id, fields = {}) {
  if (!id || typeof id !== "string") {
    throw new Error("id записи памяти обязателен.");
  }

  const patch = { updated_at: new Date().toISOString() };

  if (fields.content !== undefined) {
    const text = String(fields.content ?? "").trim();
    if (!text) throw new Error("Текст записи не может быть пустым.");
    patch.content = text;
  }
  if (fields.status !== undefined) {
    if (!VALID_STATUSES.has(fields.status)) {
      throw new Error(`Неизвестный status «${fields.status}». Допустимо: active, archived, rejected, candidate.`);
    }
    patch.status = fields.status;
    if (fields.status === "active" || fields.status === "rejected") {
      patch.reviewed_at = new Date().toISOString();
    }
  }
  if (fields.pinned !== undefined) {
    patch.pinned = !!fields.pinned;
  }

  if (Object.keys(patch).length === 1) {
    throw new Error("Нечего обновлять: передайте content / status / pinned.");
  }

  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .update(patch)
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    throw new Error(`Не удалось обновить запись памяти: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Запись памяти ${id} не найдена.`);
  }

  // Сессия 15: при отклонении кандидата с привязанными эпизодами помечаем
  // их dismissed в team_feedback_episodes, чтобы при следующем сжатии они
  // не всплыли снова в новых кандидатах.
  if (
    fields.status === "rejected" &&
    Array.isArray(data.source_episode_ids) &&
    data.source_episode_ids.length > 0
  ) {
    const { error: dismissErr } = await client
      .from("team_feedback_episodes")
      .update({ status: "dismissed" })
      .in("id", data.source_episode_ids)
      .eq("status", "active");
    if (dismissErr) {
      // Не валим основной поток — кандидат уже отрицательно отрецензирован.
      // Логируем для будущей диагностики.
      console.warn(
        `[memoryService] не удалось пометить source-эпизоды как dismissed: ${dismissErr.message}`,
      );
    }
  }

  return data;
}

// Мягкое удаление: status = 'archived'. Реального DELETE не делаем —
// хотим иметь возможность восстановить ошибочно архивированное правило
// и сохранить ссылочную целостность для source_episode_ids у правил.
export async function archiveMemory(id) {
  return updateMemory(id, { status: "archived" });
}

// Статистика по памяти агента — для шапки карточки сотрудника и dashboards.
//   totalRules     — всего правил (любой статус)
//   activeRules    — активных правил
//   pinnedRules    — закреплённых активных правил
//   totalEpisodes  — всего эпизодов (любой статус)
//   archivedCount  — всего записей в archived (правила + эпизоды)
//   candidateRules — кандидатов в правила (status='candidate', type='rule')
export async function getMemoryStats(agentId) {
  assertAgentId(agentId);
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(TABLE)
    .select("type, status, pinned")
    .eq("agent_id", agentId);

  if (error) {
    throw new Error(`Не удалось получить статистику памяти ${agentId}: ${error.message}`);
  }

  const rows = data ?? [];
  const stats = {
    totalRules: 0,
    activeRules: 0,
    pinnedRules: 0,
    totalEpisodes: 0,
    archivedCount: 0,
    candidateRules: 0,
  };
  for (const r of rows) {
    if (r.type === "rule") {
      stats.totalRules += 1;
      if (r.status === "active") {
        stats.activeRules += 1;
        if (r.pinned) stats.pinnedRules += 1;
      } else if (r.status === "candidate") {
        stats.candidateRules += 1;
      }
    } else if (r.type === "episode") {
      stats.totalEpisodes += 1;
    }
    if (r.status === "archived") stats.archivedCount += 1;
  }
  return stats;
}

// =========================================================================
// Кандидаты в правила (Сессия 15)
// =========================================================================

// Все кандидаты в правила (status='candidate'), сгруппированы агентом.
// Поле team_agents.display_name для отображения в шапке группы.
// pending=true фильтрует только не отрецензированные; иначе — все кандидаты.
export async function getCandidates({ pendingOnly = true } = {}) {
  const client = getServiceRoleClient();
  // Тащим всех кандидатов одним запросом + JOIN на team_agents для имени.
  // PostgREST синтаксис: `team_agents!inner(display_name, role_title)`.
  // !inner — INNER JOIN (кандидаты с удалённым агентом отвалятся, но это и
  // правильно: каскад уже должен был удалить запись памяти при удалении агента).
  let query = client
    .from(TABLE)
    .select(
      "*, agent:team_agents!inner(id, display_name, role_title, avatar_url, department, status)",
    )
    .eq("type", "rule")
    .order("created_at", { ascending: false });
  if (pendingOnly) {
    query = query.eq("status", "candidate");
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`Не удалось получить кандидатов в правила: ${error.message}`);
  }
  return data ?? [];
}

// Идемпотентная вставка правила: если у агента уже есть active-правило с
// точно таким же текстом — возвращаем существующую запись и { created: false }.
// Используется seed-скриптом, чтобы повторный запуск не плодил дубликаты.
export async function ensureRule({ agentId, content, source = "seed", pinned = false }) {
  assertAgentId(agentId);
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) {
    throw new Error("Текст правила обязателен.");
  }

  const client = getServiceRoleClient();
  const { data: existing, error: selErr } = await client
    .from(TABLE)
    .select("*")
    .eq("agent_id", agentId)
    .eq("type", "rule")
    .eq("status", "active")
    .eq("content", text)
    .maybeSingle();

  if (selErr) {
    throw new Error(`Не удалось проверить существующее правило: ${selErr.message}`);
  }
  if (existing) {
    return { rule: existing, created: false };
  }

  const rule = await addRule({ agentId, content: text, source, pinned });
  return { rule, created: true };
}
