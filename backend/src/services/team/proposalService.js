// Сервис предложений от агентов (Сессия 22 этапа 2, пункт 15).
//
// CRUD над team_proposals (миграция 0026) + write в team_agent_diary
// (записи о пропусках такта 1). Создание самих предложений — в
// triggerService.runReflectionCycle.
//
// Лимиты автономности из ТЗ Сессии 22:
//   • 3 pending-предложения в день на агента (мягкий — превышение ведёт
//     к no-op + warning в логе, не к ошибке).
//   • 1 urgent в неделю на агента (тоже мягкий — если уже было, kind
//     понижается до 'regular').
//
// Принятие предложения создаёт задачу через taskRunner.createTask и
// записывает resulting_task_id. Отклонение просто меняет статус.

import { getServiceRoleClient } from "./teamSupabase.js";
import { createTask } from "./taskRunner.js";

const PROPOSALS_TABLE = "team_proposals";
const DIARY_TABLE = "team_agent_diary";

const VALID_KINDS = new Set(["regular", "urgent", "next_step"]);
const VALID_STATUSES = new Set(["pending", "accepted", "rejected", "expired"]);

const DAILY_LIMIT = 3;
const URGENT_WEEKLY_LIMIT = 1;

function assertAgentId(agentId) {
  if (!agentId || typeof agentId !== "string" || !agentId.trim()) {
    throw new Error("agentId обязателен и должен быть непустой строкой.");
  }
}

function assertProposalId(id) {
  if (!id || typeof id !== "string" || !id.trim()) {
    throw new Error("id предложения обязателен.");
  }
}

// =========================================================================
// Создание предложения (вызывается из triggerService после такта 2)
// =========================================================================

// Возвращает { proposal, accepted: true } если запись создана, или
// { skipped: true, reason } если лимит превышен.
export async function createProposal({
  agent_id,
  triggered_by,
  kind = "regular",
  payload = {},
}) {
  assertAgentId(agent_id);
  if (!triggered_by || typeof triggered_by !== "string") {
    throw new Error("triggered_by обязателен.");
  }
  let normalizedKind = VALID_KINDS.has(kind) ? kind : "regular";

  // Дневной лимит pending-предложений.
  const pendingToday = await getPendingTodayCount(agent_id);
  if (pendingToday >= DAILY_LIMIT) {
    return {
      skipped: true,
      reason: `daily_limit_${DAILY_LIMIT}_pending_already_today`,
    };
  }
  // Если urgent — проверяем недельный лимит. Если уже было — понижаем до
  // regular (не глушим, чтобы предложение не потерялось).
  if (normalizedKind === "urgent") {
    const lastUrgent = await getLastUrgentWithinDays(agent_id, 7);
    if (lastUrgent) {
      console.warn(
        `[proposalService] urgent уже было у ${agent_id} за последние 7 дней — понижаю до regular.`,
      );
      normalizedKind = "regular";
    }
  }

  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(PROPOSALS_TABLE)
    .insert({
      agent_id,
      triggered_by,
      kind: normalizedKind,
      payload: payload ?? {},
      status: "pending",
    })
    .select()
    .maybeSingle();
  if (error) {
    throw new Error(`Не удалось создать предложение: ${error.message}`);
  }
  return { proposal: data, accepted: true };
}

async function getPendingTodayCount(agentId) {
  const client = getServiceRoleClient();
  const now = new Date();
  const startUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  ).toISOString();
  const { count, error } = await client
    .from(PROPOSALS_TABLE)
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .eq("status", "pending")
    .gte("created_at", startUtc);
  if (error) {
    console.warn("[proposalService] pendingTodayCount failed:", error.message);
    return 0;
  }
  return count ?? 0;
}

async function getLastUrgentWithinDays(agentId, days) {
  const client = getServiceRoleClient();
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await client
    .from(PROPOSALS_TABLE)
    .select("id")
    .eq("agent_id", agentId)
    .eq("kind", "urgent")
    .gte("created_at", cutoff)
    .limit(1);
  if (error) {
    console.warn("[proposalService] lastUrgent failed:", error.message);
    return null;
  }
  return (data ?? [])[0] ?? null;
}

// =========================================================================
// Принятие / отклонение / просрочка
// =========================================================================

export async function acceptProposal(id, overrides = {}) {
  assertProposalId(id);
  const client = getServiceRoleClient();
  const { data: proposal, error: getErr } = await client
    .from(PROPOSALS_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (getErr) {
    throw new Error(`Не удалось получить предложение: ${getErr.message}`);
  }
  if (!proposal) {
    throw new Error(`Предложение ${id} не найдено.`);
  }
  if (proposal.status !== "pending") {
    throw new Error(`Нельзя принять предложение в статусе «${proposal.status}».`);
  }

  // Создаём задачу. brief + task_type + project_id берём из payload, с
  // возможностью override от UI («принять с правками»).
  const payload = proposal.payload ?? {};
  const taskType = overrides.task_type ?? payload.task_type ?? "ideas_free";
  const brief = overrides.brief ?? payload.what ?? payload.brief ?? "";
  const title = overrides.title ?? payload.title ?? null;
  const projectId = overrides.project_id ?? payload.project_id ?? null;

  if (!brief || typeof brief !== "string" || !brief.trim()) {
    throw new Error("В предложении нет текста брифа (payload.what или brief).");
  }

  const taskId = await createTask({
    taskType,
    params: { user_input: brief.trim() },
    title,
    agentId: proposal.agent_id,
    projectId,
  });

  const { data: updated, error: updErr } = await client
    .from(PROPOSALS_TABLE)
    .update({
      status: "accepted",
      decided_at: new Date().toISOString(),
      resulting_task_id: taskId,
    })
    .eq("id", id)
    .select()
    .maybeSingle();
  if (updErr) {
    throw new Error(`Не удалось обновить предложение: ${updErr.message}`);
  }
  return { proposal: updated, task_id: taskId };
}

export async function rejectProposal(id) {
  assertProposalId(id);
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(PROPOSALS_TABLE)
    .update({ status: "rejected", decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (error) {
    throw new Error(`Не удалось отклонить предложение: ${error.message}`);
  }
  if (!data) {
    throw new Error(`Предложение ${id} не найдено или уже принято/отклонено.`);
  }
  return data;
}

// Просрочка предложений старше N дней (вызывается из cron — Сессия 24).
export async function expireOldProposals(days = 14) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(PROPOSALS_TABLE)
    .update({ status: "expired", decided_at: new Date().toISOString() })
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .select("id");
  if (error) {
    throw new Error(`Не удалось просрочить старые предложения: ${error.message}`);
  }
  return (data ?? []).length;
}

// =========================================================================
// Чтение
// =========================================================================

export async function listProposals({
  agentId = null,
  status = null,
  limit = 50,
  offset = 0,
} = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 500));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const client = getServiceRoleClient();
  let query = client
    .from(PROPOSALS_TABLE)
    .select("*")
    .order("created_at", { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);
  if (agentId) query = query.eq("agent_id", agentId);
  if (status) {
    if (!VALID_STATUSES.has(status)) {
      throw new Error(`Неизвестный status «${status}».`);
    }
    query = query.eq("status", status);
  }
  const { data, error } = await query;
  if (error) {
    throw new Error(`Не удалось получить список предложений: ${error.message}`);
  }
  return data ?? [];
}

export async function getProposalById(id) {
  assertProposalId(id);
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(PROPOSALS_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    throw new Error(`Не удалось получить предложение: ${error.message}`);
  }
  return data ?? null;
}

// =========================================================================
// Дневник (read-only журнал пропусков такта 1)
// =========================================================================

export async function appendDiary({ agent_id, triggered_by, reason_to_skip }) {
  assertAgentId(agent_id);
  if (!triggered_by || !reason_to_skip) {
    throw new Error("triggered_by и reason_to_skip обязательны.");
  }
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(DIARY_TABLE)
    .insert({
      agent_id,
      triggered_by,
      reason_to_skip: String(reason_to_skip).slice(0, 2000),
    })
    .select()
    .maybeSingle();
  if (error) {
    throw new Error(`Не удалось записать в дневник: ${error.message}`);
  }
  return data;
}

export async function getDiary(agentId, { limit = 100, offset = 0 } = {}) {
  assertAgentId(agentId);
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
  const safeOffset = Math.max(0, Number(offset) || 0);
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from(DIARY_TABLE)
    .select("*")
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);
  if (error) {
    throw new Error(`Не удалось получить дневник: ${error.message}`);
  }
  return data ?? [];
}

// =========================================================================
// Cooldown 7 дней по типу триггера на агента (используется triggerService).
// =========================================================================

// Возвращает ISO-строку последнего размышления (предложение или запись в
// дневнике) по этому triggered_by за последние N дней. Если ничего — null.
export async function getLastReflection(agentId, triggeredBy, days = 7) {
  assertAgentId(agentId);
  if (!triggeredBy) return null;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const client = getServiceRoleClient();
  const [pRes, dRes] = await Promise.all([
    client
      .from(PROPOSALS_TABLE)
      .select("created_at")
      .eq("agent_id", agentId)
      .eq("triggered_by", triggeredBy)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1),
    client
      .from(DIARY_TABLE)
      .select("created_at")
      .eq("agent_id", agentId)
      .eq("triggered_by", triggeredBy)
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  const p = pRes.data?.[0]?.created_at ?? null;
  const d = dRes.data?.[0]?.created_at ?? null;
  if (!p && !d) return null;
  if (!p) return d;
  if (!d) return p;
  return p > d ? p : d;
}
