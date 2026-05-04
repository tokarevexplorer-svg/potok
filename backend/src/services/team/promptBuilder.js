// Сборщик промптов из шаблонов команды.
//
// Прямой портирование `dkl_tool/backend/services/prompt_builder.py` на JS.
// Шаблон — markdown-файл в bucket'е team-prompts с двумя секциями:
//
//   ... любая преамбула с заметками ...
//   ## System
//   ...тело системного промпта с {{плейсхолдерами}}...
//   ## User           ← опциональная; если её нет, user-сообщение = {{user_input}}
//   ...тело пользовательского сообщения с {{плейсхолдерами}}...
//
// Сборщик автоматически тянет context.md и concept.md из team-database, если
// в шаблоне есть {{context}} / {{concept}}, и НЕ переданы в variables. Эти
// два больших блока кладутся в cacheableBlocks — Anthropic-клиент маркирует
// их как ephemeral cache и серьёзно экономит на повторных вызовах.

import { downloadFile, listFiles } from "./teamStorage.js";

// {{name}} — буквы латиницы, цифры и underscore. Регистр важен.
// Пробелы внутри {{ name }} разрешены. Совпадает с Python-версией.
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

const PROMPTS_BUCKET = "team-prompts";
const DATABASE_BUCKET = "team-database";

// Возвращает все имена плейсхолдеров, упомянутые в тексте.
function findPlaceholders(text) {
  const found = new Set();
  if (!text) return found;
  // Reset lastIndex (RE с флагом g — состояние сохраняется между вызовами).
  PLACEHOLDER_RE.lastIndex = 0;
  let match;
  while ((match = PLACEHOLDER_RE.exec(text)) !== null) {
    found.add(match[1]);
  }
  return found;
}

// Подставляет значения переменных вместо {{name}}. Если значение для
// плейсхолдера не передано — заменяем на пустую строку (как в Python).
function replacePlaceholders(text, variables) {
  if (!text) return "";
  PLACEHOLDER_RE.lastIndex = 0;
  return text.replace(PLACEHOLDER_RE, (_full, key) => {
    const val = variables[key];
    if (val === undefined || val === null) return "";
    return String(val);
  });
}

// Делит шаблон на (system_body, user_body | null). Если `## System` нет —
// весь файл считается system-телом, user_body = null. Поведение совпадает
// с Python prompt_builder._split_sections.
function splitSections(template) {
  // Heading «## System» — case-insensitive, отдельная строка, опциональные
  // пробелы по бокам. /m чтобы ^ и $ матчились на началах/концах строк.
  const sysRe = /^[ \t]*##[ \t]*system[ \t]*$/im;
  const sysMatch = template.match(sysRe);
  if (!sysMatch) {
    return { systemBody: template.trim(), userBody: null };
  }

  const afterSys = template.slice(sysMatch.index + sysMatch[0].length);

  const userRe = /^[ \t]*##[ \t]*user[ \t]*$/im;
  const userMatch = afterSys.match(userRe);
  if (userMatch) {
    const systemBody = afterSys.slice(0, userMatch.index).trim();
    const userBody = afterSys.slice(userMatch.index + userMatch[0].length).trim();
    return { systemBody, userBody };
  }

  return { systemBody: afterSys.trim(), userBody: null };
}

// Скачивает файл из team-database, возвращает строку или пустую строку.
// Используется только для context.md / concept.md в авто-загрузке. Если
// файла нет (свежий проект, Влад ещё не написал контекст) — пусто, не падаем.
async function loadDatabaseFile(name) {
  try {
    return await downloadFile(DATABASE_BUCKET, name);
  } catch {
    return "";
  }
}

// Главная функция. Принимает имя шаблона (с или без `.md`) и переменные.
// Возвращает {system, user, cacheableBlocks, template}:
//   system — финальный текст с подставленными плейсхолдерами
//   user — финальный текст пользовательского сообщения
//   cacheableBlocks — массив строк (context, concept), для Anthropic-кеша
//   template — фактическое имя файла шаблона (с .md)
//
// Бросает ошибку с понятным русским сообщением, если шаблона нет.
export async function buildPrompt(templateName, variables = {}) {
  const vars = { ...variables };

  const finalName = templateName.endsWith(".md") ? templateName : `${templateName}.md`;

  let raw;
  try {
    raw = await downloadFile(PROMPTS_BUCKET, finalName);
  } catch {
    throw new Error(`Шаблон не найден: ${finalName}`);
  }

  const { systemBody, userBody } = splitSections(raw);

  // Авто-загрузка context / concept, если упомянуты и не переданы.
  const referenced = new Set([...findPlaceholders(systemBody), ...findPlaceholders(userBody ?? "")]);
  if (referenced.has("context") && vars.context === undefined) {
    vars.context = await loadDatabaseFile("context.md");
  }
  if (referenced.has("concept") && vars.concept === undefined) {
    vars.concept = await loadDatabaseFile("concept.md");
  }

  // Если ## User секции в шаблоне нет — user-сообщение это просто
  // {{user_input}} (или пустая строка).
  let userText;
  if (userBody === null) {
    userText = String(vars.user_input ?? "");
  } else {
    userText = replacePlaceholders(userBody, vars);
  }

  const systemText = replacePlaceholders(systemBody, vars);

  // В cacheableBlocks кладём context и concept как есть (без подстановки —
  // они и так чистый текст без плейсхолдеров). Пустые блоки не включаем,
  // чтобы Anthropic не получил «whitespace-only» блок (он на это ругается).
  const cacheableBlocks = [];
  for (const key of ["context", "concept"]) {
    const val = vars[key];
    if (val && String(val).trim()) {
      cacheableBlocks.push(String(val));
    }
  }

  return {
    system: systemText,
    user: userText,
    cacheableBlocks,
    template: finalName,
  };
}

// Возвращает список имён всех шаблонов в bucket'е team-prompts (только .md).
// Сортируется по имени для стабильности UI.
export async function listTemplates() {
  const files = await listFiles(PROMPTS_BUCKET, "");
  return files
    .map((f) => f.name)
    .filter((name) => typeof name === "string" && name.endsWith(".md"))
    .sort();
}
