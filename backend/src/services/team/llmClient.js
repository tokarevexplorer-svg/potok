// Унифицированный LLM-клиент для команды: один интерфейс на трёх провайдеров
// (Anthropic, OpenAI, Google AI Studio).
//
// Прямой портирование `dkl_tool/backend/services/llm_client.py` на JS ESM.
// Возвращает одинаковый объект {text, inputTokens, outputTokens, cachedTokens},
// чтобы остальной код не ветвился по провайдеру.
//
// Особенности:
//   - Anthropic поддерживает prompt caching через `cache_control: ephemeral`.
//     Cacheable-блоки (обычно context.md и concept.md) маркируются как
//     ephemeral — повторный вызов с тем же контентом в ~5 мин окне
//     попадает в кеш и оплачивается дешевле.
//   - У OpenAI API возвращает cached_tokens неявно — мы их забираем из
//     prompt_tokens_details, если доступно.
//   - У Google пока нет publicly-доступного prompt caching через generate_content,
//     поэтому cached_tokens возвращаем как отдаёт SDK (обычно 0).
//
// Ключи читаются через keysService.getApiKey(provider) — НЕ из env Railway
// (см. STAGE1_ARCHITECTURE_v2.md, раздел 3.3).

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { getApiKey } from "./keysService.js";

// Явно отдельный класс ошибок, чтобы caller (taskRunner) мог отличить «упал
// провайдер» от «упала наша логика». Сообщения у LLMError всегда на русском.
export class LLMError extends Error {
  constructor(message) {
    super(message);
    this.name = "LLMError";
  }
}

// Получает ключ из БД (через keysService) и кидает понятную русскую ошибку,
// если ключа нет. Сообщение копирует формулировку из ДК Лурье — Влад уже
// привык к ней.
async function ensureKey(provider) {
  const key = await getApiKey(provider);
  if (!key) {
    throw new LLMError(
      `Не задан API-ключ для провайдера ${provider}. Добавь его в Админке.`,
    );
  }
  return key;
}

// Достаём короткое полезное сообщение из исключения SDK. Многие SDK-ошибки
// несут полное тело ответа в `body.error.message` — оно всегда информативнее
// чем `String(exc)`. Если ничего не нашли — возвращаем имя класса ошибки.
function shortExcMessage(exc) {
  const body = exc?.body;
  if (body && typeof body === "object") {
    const err = body.error;
    if (err && typeof err === "object" && typeof err.message === "string") {
      return err.message;
    }
    if (typeof err === "string") return err;
  }
  let msg = String(exc?.message ?? exc ?? "").trim();
  if (!msg) msg = exc?.constructor?.name ?? "Unknown error";
  if (msg.length > 400) msg = msg.slice(0, 400) + "…";
  return msg;
}

// Главная функция. Сигнатура повторяет Python-версию:
//   provider — "anthropic" | "openai" | "google"
//   model — id модели в провайдере (например, "claude-sonnet-4-5")
//   systemPrompt, userPrompt — строки
//   cacheableBlocks — массив строк (обычно context, concept) — для Anthropic
//     каждая обернётся в block с cache_control = ephemeral. Для OpenAI/Google
//     этот параметр игнорируется (там нет такого механизма).
//   maxTokens — лимит на ответ.
//
// Возвращает {text, inputTokens, outputTokens, cachedTokens} либо бросает LLMError.
export async function call({
  provider,
  model,
  systemPrompt = "",
  userPrompt = "",
  cacheableBlocks = [],
  maxTokens = 4096,
}) {
  if (provider === "anthropic") {
    return callAnthropic({ model, systemPrompt, userPrompt, cacheableBlocks, maxTokens });
  }
  if (provider === "openai") {
    return callOpenAI({ model, systemPrompt, userPrompt, maxTokens });
  }
  if (provider === "google") {
    return callGoogle({ model, systemPrompt, userPrompt, maxTokens });
  }
  throw new LLMError(`Неизвестный провайдер: ${provider}`);
}

// ---------- Anthropic ----------

async function callAnthropic({ model, systemPrompt, userPrompt, cacheableBlocks, maxTokens }) {
  const apiKey = await ensureKey("anthropic");
  const client = new Anthropic({ apiKey });

  // Anthropic ожидает system как массив типизированных блоков. Cacheable-
  // блоки (обычно context и concept) маркируем cache_control: ephemeral —
  // SDK сам разрулит и в Usage отдаст cache_read_input_tokens.
  // После кешируемых блоков идёт остальной system как обычный блок.
  const systemBlocks = [];
  for (const block of cacheableBlocks) {
    if (!block || !block.trim()) continue;
    systemBlocks.push({
      type: "text",
      text: block,
      cache_control: { type: "ephemeral" },
    });
  }
  if (systemPrompt && systemPrompt.trim()) {
    systemBlocks.push({ type: "text", text: systemPrompt });
  }

  const requestBody = {
    model,
    max_tokens: maxTokens,
    messages: [{ role: "user", content: userPrompt || "ping" }],
  };
  // Anthropic ругается на whitespace-only system-блоки — пропускаем поле,
  // если контента действительно нет.
  if (systemBlocks.length > 0) {
    requestBody.system = systemBlocks;
  }

  let response;
  try {
    response = await client.messages.create(requestBody);
  } catch (exc) {
    // SDK выдаёт типизированную иерархию ошибок — раскладываем в понятные
    // русские сообщения, как в Python-версии.
    if (exc instanceof Anthropic.AuthenticationError) {
      throw new LLMError(
        "Anthropic API: ключ невалидный или отозван. Обнови его в Админке.",
      );
    }
    if (exc instanceof Anthropic.PermissionDeniedError) {
      throw new LLMError(
        `Anthropic API: доступ запрещён (${shortExcMessage(exc)}). ` +
          `Проверь, активирован ли биллинг и есть ли доступ к модели "${model}".`,
      );
    }
    if (exc instanceof Anthropic.NotFoundError) {
      throw new LLMError(
        `Anthropic API: модель "${model}" не найдена. ` +
          `Проверь её id в config/pricing.json и доступные модели в твоём аккаунте.`,
      );
    }
    if (exc instanceof Anthropic.RateLimitError) {
      throw new LLMError(
        `Anthropic API: превышен лимит запросов (${shortExcMessage(exc)}). Попробуй позже.`,
      );
    }
    if (exc instanceof Anthropic.BadRequestError) {
      throw new LLMError(`Anthropic API: некорректный запрос — ${shortExcMessage(exc)}`);
    }
    if (exc instanceof Anthropic.APIConnectionError) {
      throw new LLMError(
        `Anthropic API: не удалось подключиться (${shortExcMessage(exc)}). Проверь сеть.`,
      );
    }
    throw new LLMError(`Anthropic API: ${shortExcMessage(exc)}`);
  }

  // Собираем текст из блоков content (могут быть text-блоки + tool_use, нам
  // нужны только текстовые).
  let text = "";
  for (const block of response.content ?? []) {
    if (block?.type === "text" && typeof block.text === "string") {
      text += block.text;
    }
  }

  const usage = response.usage ?? {};
  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreation = usage.cache_creation_input_tokens ?? 0;

  // Anthropic'овский `input_tokens` НЕ включает кешированные (ни read, ни
  // creation) токены. Чтобы costTracker корректно посчитал биллинг по
  // трём ставкам — суммируем все три bucket'а в total_input.
  const totalInput = Number(inputTokens) + Number(cacheRead) + Number(cacheCreation);

  return {
    text,
    inputTokens: totalInput,
    outputTokens: Number(outputTokens),
    cachedTokens: Number(cacheRead),
  };
}

// ---------- OpenAI ----------

async function callOpenAI({ model, systemPrompt, userPrompt, maxTokens }) {
  const apiKey = await ensureKey("openai");
  const client = new OpenAI({ apiKey });

  const messages = [];
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: userPrompt || " " });

  let response;
  try {
    // Старшие модели OpenAI ждут max_completion_tokens, более старые — max_tokens.
    // Пробуем сначала новый параметр; если SDK отвергает — фолбэк на старый.
    try {
      response = await client.chat.completions.create({
        model,
        messages,
        max_completion_tokens: maxTokens,
      });
    } catch (innerExc) {
      // BadRequestError из-за неподдерживаемого параметра — пробуем max_tokens.
      const msg = String(innerExc?.message ?? "").toLowerCase();
      if (
        innerExc instanceof OpenAI.BadRequestError &&
        (msg.includes("max_completion_tokens") || msg.includes("unrecognized"))
      ) {
        response = await client.chat.completions.create({
          model,
          messages,
          max_tokens: maxTokens,
        });
      } else {
        throw innerExc;
      }
    }
  } catch (exc) {
    if (exc instanceof OpenAI.AuthenticationError) {
      throw new LLMError("OpenAI API: ключ невалидный или отозван. Обнови его в Админке.");
    }
    if (exc instanceof OpenAI.PermissionDeniedError) {
      throw new LLMError(
        `OpenAI API: доступ запрещён (${shortExcMessage(exc)}). ` +
          `Проверь, оплачен ли аккаунт и доступна ли модель "${model}".`,
      );
    }
    if (exc instanceof OpenAI.NotFoundError) {
      throw new LLMError(
        `OpenAI API: модель "${model}" не найдена. ` +
          `Проверь id в config/pricing.json и доступные модели у себя в аккаунте.`,
      );
    }
    if (exc instanceof OpenAI.BadRequestError) {
      throw new LLMError(`OpenAI API: некорректный запрос — ${shortExcMessage(exc)}`);
    }
    if (exc instanceof OpenAI.RateLimitError) {
      throw new LLMError(
        `OpenAI API: превышен лимит запросов (${shortExcMessage(exc)}). Попробуй позже.`,
      );
    }
    if (exc instanceof OpenAI.APIConnectionError) {
      throw new LLMError(
        `OpenAI API: не удалось подключиться (${shortExcMessage(exc)}). Проверь сеть.`,
      );
    }
    throw new LLMError(`OpenAI API: ${shortExcMessage(exc)}`);
  }

  const text = response.choices?.[0]?.message?.content ?? "";

  const usage = response.usage ?? {};
  const inputTokens = usage.prompt_tokens ?? 0;
  const outputTokens = usage.completion_tokens ?? 0;
  // Implicit cached tokens — OpenAI отдаёт через prompt_tokens_details.cached_tokens,
  // если в их реализации кеша было попадание.
  const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;

  return {
    text,
    inputTokens: Number(inputTokens),
    outputTokens: Number(outputTokens),
    cachedTokens: Number(cachedTokens),
  };
}

// ---------- Google AI Studio ----------

async function callGoogle({ model, systemPrompt, userPrompt, maxTokens }) {
  const apiKey = await ensureKey("google");
  const client = new GoogleGenerativeAI(apiKey);

  // У Google system-инструкция передаётся при инициализации модели
  // (а не как отдельный role в сообщениях).
  const modelParams = {
    model,
    generationConfig: { maxOutputTokens: maxTokens },
  };
  if (systemPrompt && systemPrompt.trim()) {
    modelParams.systemInstruction = systemPrompt;
  }
  const generative = client.getGenerativeModel(modelParams);

  let response;
  try {
    const result = await generative.generateContent(userPrompt || " ");
    response = result.response;
  } catch (exc) {
    // У Google SDK типизация ошибок беднее: GoogleGenerativeAIFetchError ловит
    // практически всё. Различаем по сообщению — на 401/403/404/429 даём
    // понятные русские формулировки.
    const msg = shortExcMessage(exc);
    const low = msg.toLowerCase();
    if (
      low.includes("api key") ||
      low.includes("api_key") ||
      low.includes("permission") ||
      low.includes("unauthorized") ||
      low.includes("401") ||
      low.includes("403")
    ) {
      throw new LLMError(
        `Google AI Studio: ключ невалидный или нет доступа (${msg}). Обнови его в Админке.`,
      );
    }
    if (low.includes("not found") || low.includes("404") || (low.includes("model") && low.includes("not"))) {
      throw new LLMError(
        `Google AI Studio: модель "${model}" не найдена (${msg}). ` +
          `Проверь id в config/pricing.json и доступные модели в Google AI Studio.`,
      );
    }
    if (low.includes("quota") || low.includes("rate") || low.includes("429")) {
      throw new LLMError(`Google AI Studio: превышен лимит (${msg}). Попробуй позже.`);
    }
    throw new LLMError(`Google API: ${msg}`);
  }

  // .text() это метод-геттер ответа, может бросить если был блок safety —
  // ловим, отдаём пусто.
  let text = "";
  try {
    text = (response?.text?.() ?? "").trim();
  } catch {
    text = "";
  }

  const usage = response?.usageMetadata ?? {};
  const inputTokens = usage.promptTokenCount ?? 0;
  const outputTokens = usage.candidatesTokenCount ?? 0;
  const cachedTokens = usage.cachedContentTokenCount ?? 0;

  return {
    text,
    inputTokens: Number(inputTokens),
    outputTokens: Number(outputTokens),
    cachedTokens: Number(cachedTokens),
  };
}
