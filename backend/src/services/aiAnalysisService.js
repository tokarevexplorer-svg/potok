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

// Контекст блога и правила классификации is_reference. Скопировано из CLAUDE.md
// (раздел «Контекст блога для AI-классификации»). Используется и в основном
// промпте анализа, и в промпте для разовой переклассификации старых видео.
// Если меняешь блог — меняй здесь, и желательно ещё в CLAUDE.md, чтобы оставались
// в синхроне.
const BLOG_CONTEXT = [
  "Контекст блога владельца:",
  "Блог исследует историю и культуру (преимущественно России и русскоязычного",
  "пространства) через короткие журналистские сюжеты. Главный принцип — точки",
  "поворота: события, ошибки, запреты, странности и случайности, которые повлияли",
  "на культуру, общество или повседневность сильнее, чем кажется на первый взгляд.",
  "Подача — журналистский репортаж, серьёзная подача с ироничной сутью, в стиле",
  "Парфёнова. Циклы: исторические запреты в России (главный), исторические ошибки,",
  "культурные и городские странности (Петербург), возможный сатирический слой.",
  "",
  "is_reference = TRUE (брать) если видео про:",
  "- Историю России, СССР, Российской империи: события, фигуры, бытовые детали, курьёзы, государственные решения",
  "- Культурную историю: литература, искусство, музыка, кино, мода, язык — через призму «почему так получилось»",
  "- Религиозную и церковную историю, историю текстов и канонов",
  "- Городские странности, локальные феномены, историю мест (особенно Петербург)",
  "- Истории государственных запретов, цензуры, ограничений — любых эпох и стран",
  "- Антропологические и социологические сюжеты с историческим разворотом",
  "- Истории об «ошибках истории» — переписывания, искажения, случайности",
  "- Зарубежные исторические сюжеты с универсальным механизмом",
  "- Видео других авторов на смежные темы (история, культура, антропология, религия, городские исследования)",
  "- Видео, сильные по форме (монтаж, хук, звук, работа с архивом, подача рассказчика), если тема смежная — брать с пометкой «референс по форме»",
  "",
  "is_reference = FALSE (не брать) если видео про:",
  "- Новостной/политический контент, политическая аналитика",
  "- Личный лайфстайл: распорядок дня, рутины, гардероб, отношения",
  "- Тревел в формате «10 мест, которые стоит посетить»",
  "- Бизнес, маркетинг, саморазвитие, продуктивность",
  "- Бьюти, мода, фитнес, кулинария (без историко-культурного разворота)",
  "- Развлекательный контент: челленджи, трюки, pranks, скетчи без смысла",
  "- Технологии, гаджеты, IT (если не история технологии как культурного феномена)",
  "- Кино-обзоры в формате рецензии (без культурного разбора)",
  "- Академические лекции, формат «учитель у доски»",
  "- Узкие профессиональные ниши (медицина, юриспруденция, программирование)",
  "",
  "Правило при сомнениях:",
  "- Если тема смежная и можно извлечь хотя бы один работающий приём — is_reference = true.",
  "- Если видео хорошо снято, но про полностью чужую тему (косметика, фитнес, стартапы) — is_reference = false.",
].join("\n");

const SYSTEM_PROMPT = [
  "Ты — помощник русскоязычного блогера, разбирающего Reels и посты из Instagram.",
  "На вход — описание под видео (caption) и транскрипция речи (если есть).",
  "Твоя задача — дать короткое саммари, категорию и определить, относится ли",
  "контент к теме блога владельца.",
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
  BLOG_CONTEXT,
  "",
  "Ответ строго в JSON по схеме:",
  '{ "summary": string, "category": string, "category_suggestion": string | null, "is_reference": boolean }',
].join("\n");

// Узкий промпт только для переклассификации is_reference. Используется
// одноразовым endpoint'ом /api/reprocess-references — там не нужно перегенерировать
// саммари и категорию, экономим токены вывода.
const RECLASSIFY_SYSTEM_PROMPT = [
  "Ты — помощник русскоязычного блогера. У тебя одна задача: определить, относится",
  "ли этот контент к теме блога владельца, по правилам ниже.",
  "",
  BLOG_CONTEXT,
  "",
  'Ответ строго в JSON: { "is_reference": boolean }',
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
//   { status: "done", summary, category, categorySuggestion, isReference }
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

  // is_reference — bool. Если модель не вернула или прислала мусор, оставляем null,
  // тогда в БД запишется null = «не определено», и в UI появится placeholder.
  const isReference =
    typeof parsed.is_reference === "boolean" ? parsed.is_reference : null;

  return { status: "done", summary, category, categorySuggestion, isReference };
}

// Узкая разовая операция: пересчитать только is_reference для уже обработанного
// видео, не трогая саммари и категорию. Используется одноразовым endpoint'ом
// /api/reprocess-references после обновления промпта (Сессия 21) — на тот момент
// в БД лежат сотни видео, классифицированных по старой короткой формулировке.
//
// Принимает caption / transcript / прежнее AI-саммари (всё опционально). Если
// есть саммари — это обычно лучший компактный сигнал, передаём его модели как
// дополнительный контекст. Возвращает:
//   { status: "done", isReference: boolean | null }
//   { status: "skipped" } — нет вообще никаких данных, классифицировать нечего
export async function reclassifyIsReference({ caption, transcript, summary }) {
  const hasCaption = !!(caption && caption.trim());
  const hasTranscript = !!(transcript && transcript.trim());
  const hasSummary = !!(summary && summary.trim());

  if (!hasCaption && !hasTranscript && !hasSummary) {
    return { status: "skipped" };
  }

  const parts = [];
  if (hasSummary) {
    parts.push("Саммари (от прошлого AI-анализа):", summary.slice(0, MAX_CAPTION_CHARS));
    parts.push("");
  }
  if (hasCaption) {
    parts.push("Описание под видео (caption):", caption.slice(0, MAX_CAPTION_CHARS));
  } else {
    parts.push("Описание под видео: отсутствует.");
  }
  parts.push("");
  if (hasTranscript) {
    parts.push("Транскрипция речи:", transcript.slice(0, MAX_TRANSCRIPT_CHARS));
  } else {
    parts.push("Транскрипция: речи нет или не получена.");
  }

  const completion = await openai.chat.completions.create({
    model: env.analysisModel,
    response_format: { type: "json_object" },
    // 0.2 — нужна стабильность по тем же входным данным; в основном анализе 0.3,
    // тут чуть жёстче, чтобы не ловить дрейф на последовательных прогонах.
    temperature: 0.2,
    messages: [
      { role: "system", content: RECLASSIFY_SYSTEM_PROMPT },
      { role: "user", content: parts.join("\n") },
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

  const isReference =
    typeof parsed.is_reference === "boolean" ? parsed.is_reference : null;

  return { status: "done", isReference };
}
