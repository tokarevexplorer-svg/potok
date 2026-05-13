// Сессия 44 этапа 2 (пункт 22): poll-сервис Anthropic Batch API.
//
// Каждые 5 минут (через cron) проходит по задачам в статусе
// 'awaiting_resource' с непустым batch_id и:
//   1. Запрашивает статус у Anthropic (checkBatchStatus).
//   2. Если 'ended' — забирает результаты, сохраняет артефакт, ставит
//      task.status='done' (или 'revision' если требуется self-review;
//      простоты ради сейчас просто 'done', self-review для batch не
//      делаем — это вторичный вызов, и он должен бы тоже идти в batch).
//   3. Если 'in_progress'/'canceling' — пропускает (поллер дёрнет позже).
//   4. Если result.ok=false — переводит в 'error' с понятным сообщением.
//
// Биллинг: cost × 0.5 — скидка Anthropic Batch API. Реализовано через
// recordCall({ costMultiplier: 0.5, purpose: 'batch' }).

import {
  checkBatchStatus,
  getBatchResults,
} from "../services/team/llmClient.js";
import { getServiceRoleClient } from "../services/team/teamSupabase.js";
import { appendTaskSnapshot, getTaskById } from "../services/team/teamSupabase.js";
import { recordCall } from "../services/team/costTracker.js";
import { uploadFile } from "../services/team/teamStorage.js";

const DATABASE_BUCKET = "team-database";

// Достаём все задачи в awaiting_resource с непустым batch_id.
// Берём last-snapshot-per-id через клиентскую дедупликацию (тот же приём,
// что в getActiveTaskIds — DISTINCT ON через подзапрос Supabase JS API не даёт).
async function fetchPendingBatchTasks() {
  const client = getServiceRoleClient();
  // Сначала собираем все строки для id с непустым batch_id, потом дедуп по id.
  const { data, error } = await client
    .from("team_tasks")
    .select("*")
    .not("batch_id", "is", null)
    .order("created_at", { ascending: false });
  if (error) {
    console.error(`[batch-poll] query failed: ${error.message}`);
    return [];
  }
  const seen = new Set();
  const latest = [];
  for (const row of data ?? []) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    latest.push(row);
  }
  return latest.filter((t) => t.status === "awaiting_resource");
}

// Сохраняет результат как артефакт. Имя файла унифицированное —
// `batches/<task_id>.md`. Тонкая обёртка, не пытаемся повторить per-type
// форматирование (handler'ы делают много разного). UI всё равно читает
// task.result для preview, артефакт нужен для Storage-trail.
async function saveBatchArtifact(task, text) {
  const path = `batches/${task.id}.md`;
  const lines = [
    `# ${task.title || task.type}`,
    "",
    `_batch result · ${task.provider}/${task.model} · task \`${task.id}\` · batch \`${task.batch_id}\`_`,
    "",
    text || "",
  ];
  await uploadFile(DATABASE_BUCKET, path, lines.join("\n"));
  return path;
}

// Применяет результат одного «закончившегося» batch к задаче.
async function applyBatchResult(task, batchResult, endedAt) {
  const taskId = task.id;
  const fresh = await getTaskById(taskId);
  if (!fresh) return;

  if (batchResult.ok) {
    const tokens = {
      input: batchResult.inputTokens ?? 0,
      output: batchResult.outputTokens ?? 0,
      cached: batchResult.cachedTokens ?? 0,
    };
    let artifactPath = fresh.artifact_path ?? null;
    try {
      artifactPath = await saveBatchArtifact(fresh, batchResult.text);
    } catch (err) {
      console.warn(`[batch-poll] save artifact failed for ${taskId}: ${err.message}`);
    }

    let apiEntry = null;
    try {
      apiEntry = await recordCall({
        provider: fresh.provider,
        model: fresh.model,
        inputTokens: tokens.input,
        outputTokens: tokens.output,
        cachedTokens: tokens.cached,
        taskId,
        success: true,
        agentId: fresh.agent_id ?? null,
        purpose: "batch",
        // Anthropic Batch API: 50% скидка. costTracker умножает результат
        // pricing × multiplier при записи (Сессия 44).
        costMultiplier: 0.5,
      });
    } catch (err) {
      console.warn(`[batch-poll] recordCall failed for ${taskId}: ${err.message}`);
    }

    await appendTaskSnapshot({
      id: fresh.id,
      type: fresh.type,
      title: fresh.title,
      status: "done",
      params: fresh.params,
      modelChoice: fresh.model_choice,
      provider: fresh.provider,
      model: fresh.model,
      prompt: fresh.prompt,
      promptOverrideUsed: fresh.prompt_override_used,
      result: batchResult.text,
      artifactPath,
      tokens,
      costUsd: Number(apiEntry?.cost_usd ?? 0),
      error: null,
      startedAt: fresh.started_at,
      finishedAt: endedAt || new Date().toISOString(),
      agentId: fresh.agent_id,
      parentTaskId: fresh.parent_task_id,
      suggestedNextSteps: fresh.suggested_next_steps,
      projectId: fresh.project_id,
      selfReviewEnabled: fresh.self_review_enabled,
      selfReviewExtraChecks: fresh.self_review_extra_checks,
      selfReviewResult: fresh.self_review_result,
      stepState: fresh.step_state,
      clarificationEnabled: fresh.clarification_enabled,
      clarificationQuestions: fresh.clarification_questions,
      clarificationAnswers: fresh.clarification_answers,
      comparisonGroupId: fresh.comparison_group_id,
      batchMode: fresh.batch_mode,
      batchId: fresh.batch_id, // оставляем для трассируемости
    });
    return { ok: true };
  }

  // ошибка batch
  const message =
    batchResult.errorMessage ||
    `Batch завершился со статусом ${batchResult.errorType}.`;
  await appendTaskSnapshot({
    id: fresh.id,
    type: fresh.type,
    title: fresh.title,
    status: "error",
    params: fresh.params,
    modelChoice: fresh.model_choice,
    provider: fresh.provider,
    model: fresh.model,
    prompt: fresh.prompt,
    promptOverrideUsed: fresh.prompt_override_used,
    result: fresh.result,
    artifactPath: fresh.artifact_path,
    tokens: fresh.tokens,
    costUsd: fresh.cost_usd ?? 0,
    error: `Batch error: ${message}`,
    startedAt: fresh.started_at,
    finishedAt: new Date().toISOString(),
    agentId: fresh.agent_id,
    parentTaskId: fresh.parent_task_id,
    suggestedNextSteps: fresh.suggested_next_steps,
    projectId: fresh.project_id,
    selfReviewEnabled: fresh.self_review_enabled,
    selfReviewExtraChecks: fresh.self_review_extra_checks,
    selfReviewResult: fresh.self_review_result,
    stepState: fresh.step_state,
    clarificationEnabled: fresh.clarification_enabled,
    clarificationQuestions: fresh.clarification_questions,
    clarificationAnswers: fresh.clarification_answers,
    comparisonGroupId: fresh.comparison_group_id,
    batchMode: fresh.batch_mode,
    batchId: fresh.batch_id,
  });
  return { ok: false };
}

// Главная функция, дёргается из cron'а раз в 5 минут.
export async function tickBatchPoll() {
  const tasks = await fetchPendingBatchTasks();
  if (tasks.length === 0) return { checked: 0, completed: 0, errored: 0 };
  let completed = 0;
  let errored = 0;
  for (const task of tasks) {
    try {
      const status = await checkBatchStatus(task.batch_id);
      if (status.status !== "ended") {
        // in_progress / canceling — ждём следующий тик.
        continue;
      }
      const results = await getBatchResults(task.batch_id);
      // У нас один request в batch — берём первый. На всякий случай матчим
      // по customId = `task_<id>`, но если матча нет, берём первый элемент.
      const customId = `task_${task.id}`;
      const r = results.find((x) => x.customId === customId) ?? results[0];
      if (!r) {
        await appendTaskSnapshot({
          id: task.id,
          type: task.type,
          title: task.title,
          status: "error",
          params: task.params,
          modelChoice: task.model_choice,
          provider: task.provider,
          model: task.model,
          prompt: task.prompt,
          promptOverrideUsed: task.prompt_override_used,
          result: task.result,
          artifactPath: task.artifact_path,
          tokens: task.tokens,
          costUsd: task.cost_usd ?? 0,
          error: "Batch вернул пустой набор результатов.",
          startedAt: task.started_at,
          finishedAt: new Date().toISOString(),
          agentId: task.agent_id,
          parentTaskId: task.parent_task_id,
          suggestedNextSteps: task.suggested_next_steps,
          projectId: task.project_id,
          selfReviewEnabled: task.self_review_enabled,
          selfReviewExtraChecks: task.self_review_extra_checks,
          selfReviewResult: task.self_review_result,
          stepState: task.step_state,
          clarificationEnabled: task.clarification_enabled,
          clarificationQuestions: task.clarification_questions,
          clarificationAnswers: task.clarification_answers,
          comparisonGroupId: task.comparison_group_id,
          batchMode: task.batch_mode,
          batchId: task.batch_id,
        });
        errored += 1;
        continue;
      }
      const applied = await applyBatchResult(task, r, status.endedAt);
      if (applied?.ok) completed += 1;
      else errored += 1;
    } catch (err) {
      console.warn(`[batch-poll] task ${task.id} failed: ${err?.message ?? err}`);
      errored += 1;
    }
  }
  return { checked: tasks.length, completed, errored };
}
