// Сессия 29 этапа 2 (пункт 11): сервис самопроверки агента.
//
// После того как handler задачи получил первый ответ, и задача готова
// перейти в `done`, мы делаем второй вызов на той же модели и тех же
// слоях промпта (Mission/Role/Goals/Memory/Skills), плюс чек-лист из
// 5–6 источников, и просим агента ответить:
//   1) JSON-блок чек-листа: для каждого пункта "да"/"нет"/"неприменимо"
//      + короткий комментарий + сводка `passed`/`revision_needed`.
//   2) Если revision_needed=true — за JSON следует исправленный ответ,
//      где модель правит ТОЛЬКО пункты «нет».
//
// shouldSkipSelfReview — короткие проверки на «нечего проверять» (фича
// выключена, ответ слишком короткий, задача упала, чек-лист пустой).
//
// Стоимость второго вызова уходит в team_api_calls с purpose='self_review' —
// биллинг Сессии 49 покажет отдельной строкой.

import { getAgent } from "./agentService.js";
import { getRulesForAgent } from "./memoryService.js";
import { getSkillsForAgent } from "./skillService.js";
import { call as llmCall } from "./llmClient.js";
import { recordCall } from "./costTracker.js";
import { downloadFile } from "./teamStorage.js";

const MIN_RESULT_LENGTH = 100;
const PROMPTS_BUCKET = "team-prompts";
const MISSION_PATH = "strategy/mission.md";

// =========================================================================
// shouldSkipSelfReview — фильтр перед запуском
// =========================================================================
export function shouldSkipSelfReview(task, originalResult) {
  if (!task) return { skip: true, reason: "Нет задачи" };
  if (task.self_review_enabled !== true) {
    return { skip: true, reason: "Самопроверка выключена" };
  }
  if (typeof originalResult !== "string" || originalResult.trim().length < MIN_RESULT_LENGTH) {
    return { skip: true, reason: "Ответ короче 100 символов — нечего проверять" };
  }
  if (task.status === "error") {
    return { skip: true, reason: "Задача завершилась с ошибкой" };
  }
  return { skip: false };
}

// =========================================================================
// buildChecklist — сборка чек-листа из 5+ источников
// =========================================================================
//
// Источники:
//   1. memory_rule  — активные правила из team_agent_memory.
//   2. skill        — active/pinned навыки из agent-skills/.
//   3. template_field — поля из task.params (бриф). Простая эвристика:
//      берём все непустые строковые ключи кроме служебных.
//   4. mission_taboo — секция `## Табу` из strategy/mission.md.
//   5. vlad_extra   — task.self_review_extra_checks (по одному на строку).
//
// На будущее предусмотрен 6-й источник — «Самопроверка» секции из
// методичек инструментов (этап 5, пункт 17). Сейчас оставлен TODO,
// чтобы не вешать здесь зависимость от tools-сервиса до его готовности.
export async function buildChecklist(task, agent) {
  const checklist = [];

  // 1. Memory rules.
  if (agent?.id) {
    try {
      const rules = await getRulesForAgent(agent.id);
      for (const rule of rules) {
        const text = (rule?.content ?? "").trim();
        if (text) {
          checklist.push({
            source: "memory_rule",
            item: text,
            check: "Применено или непротиворечиво в ответе?",
          });
        }
      }
    } catch (err) {
      console.warn(`[selfReview] не удалось загрузить правила: ${err?.message ?? err}`);
    }
  }

  // 2. Skills.
  if (agent?.id) {
    try {
      const skills = await getSkillsForAgent(agent.id);
      for (const skill of skills) {
        const name = (skill?.skill_name ?? skill?.slug ?? "").trim();
        if (name) {
          checklist.push({
            source: "skill",
            item: name,
            check: "Применим к задаче? Если да — использован?",
          });
        }
      }
    } catch (err) {
      console.warn(`[selfReview] не удалось загрузить навыки: ${err?.message ?? err}`);
    }
  }

  // 3. Template fields — поля из task.params, заполненные Владом.
  //    Опускаем служебные ключи (agent_id, парные плейсхолдеры исходной задачи).
  const SKIP_PARAM_KEYS = new Set([
    "agent_id",
    "agent_name",
    "parent_task_id",
    "parent_artifact_path",
    "user_input",
  ]);
  const params = task?.params && typeof task.params === "object" ? task.params : {};
  for (const [key, value] of Object.entries(params)) {
    if (SKIP_PARAM_KEYS.has(key)) continue;
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) continue;
    // Длинные значения (research-результаты, source_text) не превращаем в
    // отдельные пункты чек-листа — это шум. Фильтр: длина > 400 символов.
    if (text.length > 400) continue;
    checklist.push({
      source: "template_field",
      item: `${key}: ${text}`,
      check: "Пункт из ТЗ закрыт?",
    });
  }

  // 4. Mission taboo.
  try {
    const mission = await loadStorageFile(MISSION_PATH);
    const taboos = extractTaboos(mission);
    for (const taboo of taboos) {
      checklist.push({
        source: "mission_taboo",
        item: taboo,
        check: "Ответ не нарушает табу?",
      });
    }
  } catch (err) {
    console.warn(`[selfReview] не удалось загрузить mission.md: ${err?.message ?? err}`);
  }

  // 5. Vlad extra.
  const extras = parseExtraChecks(task?.self_review_extra_checks);
  for (const item of extras) {
    checklist.push({
      source: "vlad_extra",
      item,
      check: "Выполнено?",
    });
  }

  // TODO Сессия 32+ (пункт 17): шестой источник — секции «Самопроверка»
  // из методичек инструментов, привязанных к агенту. Добавим, когда
  // toolService начнёт жить рядом с self-review.

  return checklist;
}

async function loadStorageFile(path) {
  try {
    return await downloadFile(PROMPTS_BUCKET, path);
  } catch {
    return "";
  }
}

function extractTaboos(missionText) {
  if (!missionText) return [];
  const re = /^[ \t]*##[ \t]+Табу[ \t]*$/im;
  const match = missionText.match(re);
  if (!match) return [];
  const after = missionText.slice(match.index + match[0].length);
  const nextRe = /^[ \t]*#{1,2}[ \t]+\S/m;
  const next = after.match(nextRe);
  const body = next ? after.slice(0, next.index) : after;
  const items = [];
  for (const line of body.split("\n")) {
    const m = line.match(/^[ \t]*[-*][ \t]+(.+)$/);
    if (m) {
      const text = m[1].trim();
      // Скипаем placeholder'ные строки `[...]` без живого текста.
      const residue = text.replace(/\[[^\[\]]*\]/g, "").trim();
      if (residue) items.push(text);
    }
  }
  return items;
}

function parseExtraChecks(extras) {
  if (typeof extras !== "string") return [];
  return extras
    .split("\n")
    .map((line) => line.replace(/^[ \t]*[-*•][ \t]+/, "").trim())
    .filter((line) => line.length > 0);
}

// =========================================================================
// runSelfReview — второй вызов LLM
// =========================================================================
export async function runSelfReview(task, agent, originalResult) {
  const checklist = await buildChecklist(task, agent);
  if (checklist.length === 0) {
    return { skipped: true, reason: "Чек-лист пуст" };
  }

  // Промпт второго вызова — отдельный системный + пользовательский.
  // Полный набор слоёв (Mission/Role/Goals/Memory/Skills) сюда НЕ
  // подкладываем повторно — задача уже была решена с ними; здесь нам
  // нужна короткая инструкция «проверь по чек-листу». Это сокращает
  // объём токенов второго вызова на 60-80% (типично).
  const systemPrompt = buildSelfReviewSystemPrompt();
  const userPrompt = buildSelfReviewUserPrompt(checklist, originalResult);

  const model = task?.model;
  const provider = task?.provider;
  if (!model || !provider) {
    return { skipped: true, reason: "Нет provider/model на задаче" };
  }

  let llmResponse;
  try {
    llmResponse = await llmCall({
      provider,
      model,
      systemPrompt,
      userPrompt,
      maxTokens: 4000,
    });
  } catch (err) {
    console.warn(`[selfReview] LLM call failed: ${err?.message ?? err}`);
    return { skipped: true, reason: `Ошибка LLM: ${err?.message ?? err}` };
  }

  // Запись расходов отдельной строкой — Сессия 49 в биллинге фильтрует
  // по purpose='self_review'.
  try {
    await recordCall({
      provider,
      model,
      inputTokens: Number(llmResponse?.inputTokens ?? 0),
      outputTokens: Number(llmResponse?.outputTokens ?? 0),
      cachedTokens: Number(llmResponse?.cachedTokens ?? 0),
      taskId: task?.id ?? null,
      success: true,
      agentId: task?.agent_id ?? null,
      purpose: "self_review",
    });
  } catch (err) {
    console.warn(`[selfReview] recordCall failed: ${err?.message ?? err}`);
  }

  return parseSelfReviewResponse(llmResponse?.text ?? "", checklist);
}

function buildSelfReviewSystemPrompt() {
  return [
    "Ты — тот же агент, что выполнил задачу выше. Сейчас ты проверяешь свой собственный ответ по чек-листу.",
    "",
    "Формат ответа — строгий, две части:",
    "",
    "1) JSON-блок с чек-листом. Один JSON-объект с двумя полями:",
    '   { "items": [{"item": "<текст пункта>", "result": "да" | "нет" | "неприменимо", "comment": "<одна строка>"}],',
    '     "passed": true|false, "revision_needed": true|false }',
    "",
    "Правила:",
    "   - Если все ответы \"да\" или \"неприменимо\" — passed=true, revision_needed=false.",
    "   - Если есть хотя бы один \"нет\" — passed=false, revision_needed=true.",
    "",
    "2) Если revision_needed=true — после JSON выведи маркер `---REVISED---` на отдельной строке,",
    "   а затем ИСПРАВЛЕННЫЙ ответ полностью. Правь ТОЛЬКО то, что чек-лист требует поправить.",
    "   Не переписывай и не «улучшай» текст сверх чек-листа.",
    "",
    "Если revision_needed=false — НЕ добавляй ничего после JSON.",
  ].join("\n");
}

function buildSelfReviewUserPrompt(checklist, originalResult) {
  const checklistLines = checklist.map(
    (entry, idx) => `${idx + 1}. [${entry.source}] ${entry.item} — ${entry.check}`,
  );
  return [
    "Чек-лист для проверки:",
    checklistLines.join("\n"),
    "",
    "Исходный ответ:",
    originalResult,
  ].join("\n");
}

// Парсит ответ модели: вытаскивает JSON и опц. revised-блок.
// Возвращает финальный объект `self_review_result`.
export function parseSelfReviewResponse(rawText, checklist) {
  const text = String(rawText ?? "");
  const result = {
    checklist: checklist.map((c) => ({
      source: c.source,
      item: c.item,
      result: "неприменимо",
      comment: "",
    })),
    passed: false,
    revised: false,
  };

  // 1. Найти JSON. Сначала ищем строку с `---REVISED---` — она делит ответ.
  const REVISED_MARKER = "---REVISED---";
  const markerIdx = text.indexOf(REVISED_MARKER);
  const jsonPart = markerIdx >= 0 ? text.slice(0, markerIdx) : text;
  const revisedPart = markerIdx >= 0 ? text.slice(markerIdx + REVISED_MARKER.length).trim() : "";

  // Снимаем markdown-обёртки ```json ... ```.
  let jsonText = jsonPart.trim();
  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) jsonText = fenceMatch[1].trim();

  // Часто модель выдаёт JSON внутри текста. Ищем фигурные скобки от первой { до последней }.
  const firstBrace = jsonText.indexOf("{");
  const lastBrace = jsonText.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    jsonText = jsonText.slice(firstBrace, lastBrace + 1);
  }

  let parsed = null;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    result.parse_error = "Не удалось распарсить JSON ответа self-review";
    return result;
  }

  if (parsed && Array.isArray(parsed.items)) {
    // Сопоставление item→checklist по индексу: модель в подавляющем
    // большинстве случаев сохраняет порядок. Если расходится — пишем по
    // тексту item.
    for (let i = 0; i < checklist.length; i++) {
      const planned = checklist[i];
      const got = parsed.items.find(
        (x) => typeof x?.item === "string" && x.item.trim() === planned.item.trim(),
      ) || parsed.items[i];
      if (got) {
        result.checklist[i].result = normalizeResultValue(got.result);
        result.checklist[i].comment = typeof got.comment === "string" ? got.comment : "";
      }
    }
  }

  result.passed = parsed?.passed === true;
  const revisionNeeded = parsed?.revision_needed === true;
  if (revisionNeeded && revisedPart) {
    result.revised = true;
    result.revised_result = revisedPart;
  }

  return result;
}

function normalizeResultValue(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "да" || s === "yes" || s === "true") return "да";
  if (s === "нет" || s === "no" || s === "false") return "нет";
  return "неприменимо";
}
