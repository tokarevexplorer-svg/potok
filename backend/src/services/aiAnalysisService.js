import OpenAI from "openai";
import { env } from "../config/env.js";

const openai = new OpenAI({ apiKey: env.openaiApiKey });

// Категории — те же ключи, что в frontend/src/lib/types.ts (AiCategory).
// Меняешь здесь — меняй и там, иначе фронт не отрисует значение.
// Список взят из CLAUDE.md (раздел «Категория AI»).
const CATEGORIES = [
  { key: "vibe-coding", label: "Вайб-кодинг" },
  { key: "history", label: "История" },
  { key: "culture", label: "Культура" },
  { key: "spb", label: "Санкт-Петербург" },
  { key: "humor", label: "Юмор" },
  { key: "lifestyle", label: "Лайфстайл" },
  { key: "business", label: "Бизнес / предпринимательство" },
  { key: "travel", label: "Путешествия" },
  { key: "food", label: "Еда" },
  { key: "motivation", label: "Мотивация / саморазвитие" },
  { key: "tech", label: "Технологии" },
  { key: "education", label: "Образование" },
  { key: "other", label: "Другое" },
];

const VALID_KEYS = new Set(CATEGORIES.map((c) => c.key));

// Максимумы — чтобы не отправлять в OpenAI «Войну и мир» (caption иногда длинные).
const MAX_TRANSCRIPT_CHARS = 8000;
const MAX_CAPTION_CHARS = 2000;

const SYSTEM_PROMPT = [
  "Ты — помощник русскоязычного блогера, разбирающего Reels из Instagram.",
  "На вход — описание под видео (caption) и транскрипция речи (если есть).",
  "Твоя задача — дать короткое саммари и категорию.",
  "",
  "Саммари: 2–3 коротких предложения по делу — о чём видео и в чём его идея.",
  "Не пересказывай дословно, не используй вводные («в этом видео», «автор рассказывает»).",
  "Пиши уверенно, как будто сам коротко рассказал коллеге, что увидел.",
  "Если данных мало или они противоречивы — пиши то, что точно понятно, без выдумок.",
  "",
  "Категория: выбери ОДИН ключ из списка ниже. Список ключ → русское название:",
  ...CATEGORIES.map((c) => `  ${c.key} — ${c.label}`),
  "",
  'Если ни одна категория не подходит — выбери "other" и в category_suggestion напиши',
  "свою короткую категорию по-русски (1–3 слова, с большой буквы).",
  "Во всех остальных случаях category_suggestion = null.",
  "",
  "Ответ строго в JSON по схеме:",
  '{ "summary": string, "category": string, "category_suggestion": string | null }',
].join("\n");

function buildUserPrompt({ caption, transcript }) {
  const parts = [];
  if (caption && caption.trim()) {
    parts.push("Описание под видео (caption):", caption.slice(0, MAX_CAPTION_CHARS));
  } else {
    parts.push("Описание под видео: отсутствует.");
  }
  parts.push("");
  if (transcript && transcript.trim()) {
    parts.push("Транскрипция речи:", transcript.slice(0, MAX_TRANSCRIPT_CHARS));
  } else {
    parts.push("Транскрипция: речи нет или не получена.");
  }
  return parts.join("\n");
}

// Возвращает один из вариантов:
//   { status: "done", summary, category, categorySuggestion }
//   { status: "skipped" } — нет ни caption, ни транскрипции
// Любая ошибка (сеть, парсинг) бросается наружу — videoProcessor её ловит.
export async function analyzeVideo({ caption, transcript }) {
  const hasCaption = !!(caption && caption.trim());
  const hasTranscript = !!(transcript && transcript.trim());

  // Анализировать пустоту бессмысленно — отдадим обратно «пропущено».
  if (!hasCaption && !hasTranscript) {
    return { status: "skipped" };
  }

  const completion = await openai.chat.completions.create({
    model: env.analysisModel,
    // JSON-режим: модель обязана вернуть валидный JSON. Сам формат описан в SYSTEM_PROMPT.
    response_format: { type: "json_object" },
    temperature: 0.3,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: buildUserPrompt({ caption, transcript }) },
    ],
  });

  const content = completion.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI вернул пустой ответ.");
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (err) {
    throw new Error(
      `Не смогли распарсить JSON от OpenAI: ${err instanceof Error ? err.message : err}`,
    );
  }

  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const rawCategory = typeof parsed.category === "string" ? parsed.category.trim() : "";
  const rawSuggestion =
    typeof parsed.category_suggestion === "string"
      ? parsed.category_suggestion.trim()
      : "";

  if (!summary) {
    throw new Error("OpenAI не вернул саммари.");
  }

  // Если модель промахнулась с ключом — мягко скатываем в other и сохраняем как
  // подсказку всё, что она прислала, чтобы Влад мог решить вручную.
  let category = rawCategory;
  let categorySuggestion = rawSuggestion || null;
  if (!VALID_KEYS.has(category)) {
    categorySuggestion = categorySuggestion ?? rawCategory ?? null;
    category = "other";
  }

  return { status: "done", summary, category, categorySuggestion };
}
