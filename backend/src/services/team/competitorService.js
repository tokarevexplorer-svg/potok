// Сессия 33 этапа 2 (пункт 17): сервис управления базой конкурентов.
//
// Поверх apifyService и Системной LLM (через llmClient): добавление блогера →
// парсинг постов → AI-саммари (type, topic, hook, summary) → запись в
// team_competitor_posts. Запись о самом блогере живёт в team_custom_databases
// с db_type='competitor'.

import { getServiceRoleClient } from "./teamSupabase.js";
import {
  parseInstagramAccount,
  estimateCost as estimateApifyCost,
  extractInstagramUsername,
  hasApifyToken,
} from "./apifyService.js";
import { call as llmCall } from "./llmClient.js";
import { recordCall } from "./costTracker.js";
import { getApiKey } from "./keysService.js";

const COMPETITOR_DB_TYPE = "competitor";

// =========================================================================
// listCompetitors — выводит блогеров из team_custom_databases.
// =========================================================================
export async function listCompetitors() {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_custom_databases")
    .select("*")
    .eq("db_type", COMPETITOR_DB_TYPE)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Не удалось получить список конкурентов: ${error.message}`);
  return data ?? [];
}

// Возвращает блогера по slug-имени (= username).
export async function getCompetitorByUsername(username) {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_custom_databases")
    .select("*")
    .eq("db_type", COMPETITOR_DB_TYPE)
    .eq("table_name", username)
    .maybeSingle();
  if (error) throw new Error(`Не удалось получить конкурента: ${error.message}`);
  return data ?? null;
}

export async function getCompetitorById(id) {
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_custom_databases")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Не удалось получить конкурента: ${error.message}`);
  return data ?? null;
}

// =========================================================================
// Состояние: сейчас обрабатывается? Кладём в schema_definition.processing.
// =========================================================================
async function setProcessing(competitorId, processing, lastError = null) {
  const client = getServiceRoleClient();
  const competitor = await getCompetitorById(competitorId);
  if (!competitor) return;
  const schema = (competitor.schema_definition ?? {}) || {};
  schema.processing = !!processing;
  schema.last_error = lastError;
  if (!processing) schema.last_parsed_at = new Date().toISOString();
  const { error } = await client
    .from("team_custom_databases")
    .update({ schema_definition: schema })
    .eq("id", competitorId);
  if (error) {
    console.warn(`[competitor] не удалось обновить processing: ${error.message}`);
  }
}

// =========================================================================
// estimateForUrl — оценка стоимости запуска парсинга.
// =========================================================================
export function estimateForUrl(instagramUrl, resultsLimit = 30) {
  const username = extractInstagramUsername(instagramUrl);
  const apify = estimateApifyCost(resultsLimit);
  // Грубая оценка стоимости AI-саммари: 1500 input + 250 output токенов на пост
  // у gpt-4o-mini = ~$0.0005. Дорогая модель — выше; берём дешёвую как floor.
  const aiPerPost = 0.0005;
  const ai_usd = Math.round(apify.estimated_posts * aiPerPost * 1000) / 1000;
  return {
    username,
    estimated_posts: apify.estimated_posts,
    apify_usd: apify.estimated_usd,
    ai_usd,
    total_usd:
      Math.round((apify.estimated_usd + ai_usd) * 1000) / 1000,
  };
}

// =========================================================================
// addCompetitor — создаёт запись блогера, запускает парсинг асинхронно.
//
// Поведение:
//   1. Идемпотентно — если запись с таким username уже есть, обновляем
//      schema_definition.processing=true и перезапускаем.
//   2. Возвращает запись из team_custom_databases (без ожидания парсинга).
//   3. Парсинг в фоне через setImmediate → processCompetitor.
// =========================================================================
export async function addCompetitor(instagramUrl, { resultsLimit = 30 } = {}) {
  const username = extractInstagramUsername(instagramUrl);
  const client = getServiceRoleClient();

  let competitor = await getCompetitorByUsername(username);
  if (!competitor) {
    const { data, error } = await client
      .from("team_custom_databases")
      .insert({
        name: username,
        description: `Instagram: @${username}`,
        table_name: username,
        db_type: COMPETITOR_DB_TYPE,
        schema_definition: {
          username,
          processing: true,
          last_error: null,
          last_parsed_at: null,
        },
      })
      .select()
      .maybeSingle();
    if (error) {
      throw new Error(`Не удалось создать запись конкурента: ${error.message}`);
    }
    competitor = data;
  } else {
    await setProcessing(competitor.id, true, null);
  }

  // Запуск в фоне.
  setImmediate(() => {
    processCompetitor(competitor.id, { resultsLimit }).catch((err) => {
      console.error(
        `[competitor] processCompetitor(${username}) упал:`,
        err?.message ?? err,
      );
    });
  });

  return competitor;
}

// =========================================================================
// processCompetitor — полный flow: парсинг → AI-саммари → запись постов.
// =========================================================================
export async function processCompetitor(competitorId, { resultsLimit = 30 } = {}) {
  const competitor = await getCompetitorById(competitorId);
  if (!competitor) throw new Error(`Конкурент ${competitorId} не найден.`);
  const username = (competitor.schema_definition?.username ?? competitor.table_name)
    ?.toString()
    .trim();
  if (!username) {
    await setProcessing(competitorId, false, "Не задан username");
    throw new Error(`У конкурента ${competitorId} нет username.`);
  }

  try {
    const result = await parseInstagramAccount(username, { resultsLimit });

    // Записываем расход Apify отдельной строкой в team_api_calls.
    try {
      // Apify не возвращает фактическую стоимость в JS-клиенте; используем оценку.
      const apifyCost = estimateApifyCost(result.posts.length).estimated_usd;
      await recordCall({
        provider: "apify",
        model: "instagram-scraper",
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        taskId: null,
        success: true,
        agentId: null,
        purpose: "apify",
        costOverrideUsd: apifyCost,
      });
    } catch (err) {
      console.warn(`[competitor] recordCall(apify) не удалось: ${err?.message ?? err}`);
    }

    const client = getServiceRoleClient();
    for (const post of result.posts) {
      // AI-саммари для каждого поста. На неудачи — продолжаем, сохраняем
      // пост без саммари.
      let summary = null;
      try {
        summary = await summarizePost(post);
      } catch (err) {
        console.warn(
          `[competitor] summarize ${post.external_id} упало: ${err?.message ?? err}`,
        );
      }

      const row = {
        competitor_id: competitorId,
        external_id: post.external_id,
        caption: post.caption,
        url: post.url,
        type: post.type,
        likes_count: post.likes_count,
        comments_count: post.comments_count,
        video_url: post.video_url,
        posted_at: post.posted_at,
        ai_summary: summary,
      };
      const { error } = await client
        .from("team_competitor_posts")
        .upsert(row, { onConflict: "competitor_id,external_id" });
      if (error) {
        console.warn(`[competitor] upsert post ${post.external_id} упало: ${error.message}`);
      }
    }

    await setProcessing(competitorId, false, null);
    return { processed: result.posts.length };
  } catch (err) {
    const msg = err?.message ?? String(err);
    await setProcessing(competitorId, false, msg);
    throw err;
  }
}

// =========================================================================
// summarizePost — AI-саммари одного поста через дешёвую модель.
//
// Возвращает JSON-объект { type, topic, hook, summary }. На ошибки парсинга
// — возвращает null, чтобы вызывающий код сохранил пост без саммари.
// =========================================================================
async function summarizePost(post) {
  const caption = (post.caption ?? "").slice(0, 2000);
  const transcription = (post.transcription ?? "").slice(0, 2000);
  if (!caption && !transcription) return null;

  // Выбираем дешёвую модель. Anthropic Haiku → OpenAI 4o-mini → Gemini Flash.
  const provider = await pickCheapProvider();
  if (!provider) {
    throw new Error("Нет доступного провайдера для AI-саммари.");
  }

  const systemPrompt =
    "Ты анализируешь Instagram-ролик блогера. Верни строго JSON: " +
    '{"type":"…","topic":"…","hook":"…","summary":"…"}. ' +
    "type — формат/рубрика, topic — тема в одной фразе, hook — какой хук использован, " +
    "summary — 2 предложения. Только JSON, без обёрток.";
  const userPrompt = [
    `Caption:\n${caption || "(пусто)"}`,
    "",
    `Транскрипция:\n${transcription || "(нет)"}`,
  ].join("\n");

  const response = await llmCall({
    provider: provider.name,
    model: provider.model,
    systemPrompt,
    userPrompt,
    maxTokens: 400,
  });

  try {
    await recordCall({
      provider: provider.name,
      model: provider.model,
      inputTokens: Number(response?.inputTokens ?? 0),
      outputTokens: Number(response?.outputTokens ?? 0),
      cachedTokens: Number(response?.cachedTokens ?? 0),
      taskId: null,
      success: true,
      agentId: null,
      purpose: "competitor_analysis",
    });
  } catch (err) {
    console.warn(`[competitor] recordCall(competitor_analysis) failed: ${err?.message ?? err}`);
  }

  return parseSummaryJson(response?.text ?? "");
}

function parseSummaryJson(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fence) text = fence[1].trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  try {
    const obj = JSON.parse(text.slice(first, last + 1));
    return {
      type: typeof obj.type === "string" ? obj.type : null,
      topic: typeof obj.topic === "string" ? obj.topic : null,
      hook: typeof obj.hook === "string" ? obj.hook : null,
      summary: typeof obj.summary === "string" ? obj.summary : null,
    };
  } catch {
    return null;
  }
}

async function pickCheapProvider() {
  const options = [
    { name: "anthropic", model: "claude-haiku-4-5" },
    { name: "openai", model: "gpt-4o-mini" },
    { name: "google", model: "gemini-2.5-flash" },
  ];
  for (const o of options) {
    try {
      const key = await getApiKey(o.name);
      if (key) return o;
    } catch {
      // Continue
    }
  }
  return null;
}

// =========================================================================
// listPosts — постов конкурента с пагинацией.
// =========================================================================
export async function listPosts(competitorId, { limit = 30, offset = 0 } = {}) {
  const client = getServiceRoleClient();
  const { data, error, count } = await client
    .from("team_competitor_posts")
    .select("*", { count: "exact" })
    .eq("competitor_id", competitorId)
    .order("posted_at", { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1);
  if (error) throw new Error(`Не удалось получить посты конкурента: ${error.message}`);
  return { posts: data ?? [], total: count ?? 0 };
}

// =========================================================================
// hasApifyToken — пробник для UI Админки.
// =========================================================================
export { hasApifyToken };
