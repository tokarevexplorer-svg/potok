// Сессия 46 этапа 2 (пункт 22): промоут артефакта в кастомную базу.
//
// Не создаёт базу сразу — только просит LLM предложить структуру.
// Результат отдаём UI-мастеру, где Влад редактирует и финализирует.
// Это критично: LLM часто не угадывает формат, Влад должен иметь шанс
// поправить колонки до окончательного CREATE TABLE.

import { downloadFile } from "./teamStorage.js";
import { sendSystemRequest } from "./systemLLMService.js";

const BUCKET = "team-database";
const MAX_INPUT_CHARS = 8000;

// Те же 8 типов колонок, что в customDatabaseService.VALID_COLUMN_TYPES.
const VALID_TYPES = new Set([
  "text",
  "long_text",
  "number",
  "url",
  "select",
  "multi_select",
  "date",
  "boolean",
]);

// Безопасный парсинг JSON: модель может вернуть текст в ```json...``` блоке
// или с лишним текстом «вот предложенная структура». Снимаем код-блоки
// и пытаемся найти первый валидный JSON-объект.
function extractJsonObject(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  // Снимаем тройные обратные кавычки.
  const stripped = text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, "$1");
  // Ищем первый { и последний } — простой эвристический парсер.
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const candidate = stripped.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

// Нормализуем то, что вернула LLM, под контракт UI-мастера.
// columns обязательны; name/description опциональны (UI задаст дефолты).
function normalizeSuggestion(obj, artifactPath) {
  if (!obj || typeof obj !== "object") {
    return { name: defaultName(artifactPath), description: null, columns: [] };
  }
  const name =
    typeof obj.name === "string" && obj.name.trim()
      ? obj.name.trim()
      : defaultName(artifactPath);
  const description =
    typeof obj.description === "string" && obj.description.trim()
      ? obj.description.trim()
      : null;

  const rawCols = Array.isArray(obj.columns) ? obj.columns : [];
  const seen = new Set();
  const columns = [];
  for (const c of rawCols) {
    if (!c || typeof c !== "object") continue;
    const cname = String(c.name ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32);
    if (!cname) continue;
    if (seen.has(cname)) continue;
    if (!/^[a-z][a-z0-9_]*$/.test(cname)) continue;
    if (["id", "created_at"].includes(cname)) continue;
    const type = VALID_TYPES.has(String(c.type ?? "").trim())
      ? String(c.type).trim()
      : "text";
    const label =
      typeof c.label === "string" && c.label.trim() ? c.label.trim() : cname;
    const entry = { name: cname, label, type };
    if (
      (type === "select" || type === "multi_select") &&
      Array.isArray(c.options)
    ) {
      entry.options = c.options
        .map((o) => String(o ?? "").trim())
        .filter(Boolean);
    }
    seen.add(cname);
    columns.push(entry);
  }
  return { name, description, columns };
}

function defaultName(artifactPath) {
  const fileName = String(artifactPath ?? "")
    .split("/")
    .pop() ?? "";
  return fileName.replace(/\.[^.]+$/, "").trim() || "Новая база";
}

// Главный метод: скачивает артефакт, дёргает LLM, возвращает suggestion.
//
// Возвращает: { suggestion: { name, description, columns }, raw, tokens, cost_usd }.
export async function promoteArtifact(artifactPath) {
  const cleanPath = String(artifactPath ?? "").trim();
  if (!cleanPath) throw new Error("artifact_path обязателен.");

  let content;
  try {
    content = await downloadFile(BUCKET, cleanPath);
  } catch (err) {
    throw new Error(`Не удалось скачать артефакт «${cleanPath}»: ${err?.message ?? err}`);
  }
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("Артефакт пустой — нечего анализировать.");
  }
  const truncated =
    content.length > MAX_INPUT_CHARS
      ? content.slice(0, MAX_INPUT_CHARS) + "\n\n[…обрезано…]"
      : content;

  const systemPrompt = [
    "Ты предлагаешь структуру для пользовательской базы данных на основе текста артефакта.",
    "Не обсуждай выбор, не извиняйся — верни СТРОГО JSON в формате:",
    "{",
    '  "name": "<имя базы>",',
    '  "description": "<одна короткая строка>",',
    '  "columns": [',
    '    {"name": "<латиница_нижнего_регистра>", "label": "<подпись для UI>", "type": "<text|long_text|number|url|select|multi_select|date|boolean>", "options": ["<опционально для select/multi_select>"]}',
    "  ]",
    "}",
    "",
    "Правила:",
    "- name колонок — только латиница нижнего регистра, цифры, подчёркивания, начало — буква.",
    "- Не используй id и created_at — они создаются автоматически.",
    "- Включай только колонки, для которых явно видны данные в тексте.",
    "- Не больше 8 колонок.",
    "- Если артефакт — это список однотипных элементов, выведи поля из элемента (имя, описание, дата, статус и т.п.).",
    "- Если артефакт — длинный связный текст, лучше предложить колонки {title, summary, tags(multi_select), date}.",
  ].join("\n");

  const userPrompt = [
    "Артефакт:",
    "```",
    truncated,
    "```",
    "",
    "Верни JSON по описанному формату.",
  ].join("\n");

  // Сессия 49: переход на Системную LLM. provider/model берётся в Админке.
  let response;
  try {
    response = await sendSystemRequest({
      systemFunction: "promote_artifact",
      systemPrompt,
      userPrompt,
      maxTokens: 2048,
    });
  } catch (err) {
    throw new Error(`LLM упал при анализе артефакта: ${err?.message ?? err}`);
  }

  const parsed = extractJsonObject(response?.text ?? "");
  const suggestion = normalizeSuggestion(parsed, cleanPath);

  return {
    suggestion,
    raw: response?.text ?? "",
    tokens: {
      input: Number(response?.inputTokens ?? 0),
      output: Number(response?.outputTokens ?? 0),
      cached: Number(response?.cachedTokens ?? 0),
    },
    cost_usd: Number(response?.costUsd ?? 0),
  };
}
