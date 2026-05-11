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
// Сборщик автоматически тянет Миссию и Цели на период из bucket'а
// team-prompts (папка «Стратегия команды»), если в шаблоне есть {{mission}} /
// {{goals}} (или старые алиасы {{context}} / {{concept}}), и они не переданы
// в variables. Эти большие блоки кладутся в cacheableBlocks — Anthropic-клиент
// маркирует их как ephemeral cache и серьёзно экономит на повторных вызовах.
//
// Сессия 4 этапа 2: переезд двух базовых файлов из bucket team-database
// (context.md / concept.md в корне) в bucket team-prompts (Стратегия команды/
// Миссия.md / Цели на период.md). Ключи cacheable_blocks переименованы
// `context` → `mission`, `concept` → `goals`. Старые имена работают как
// алиасы — это backward-compat для шаблонов, которые ещё используют
// {{context}} / {{concept}} в тексте.

import { downloadFile, listFiles } from "./teamStorage.js";

// {{name}} — буквы латиницы, цифры и underscore. Регистр важен.
// Пробелы внутри {{ name }} разрешены. Совпадает с Python-версией.
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

const PROMPTS_BUCKET = "team-prompts";

// Пути к стратегическим блокам в bucket'е team-prompts. После Сессии 4
// они переехали из team-database/context.md и team-database/concept.md.
const MISSION_PATH = "Стратегия команды/Миссия.md";
const GOALS_PATH = "Стратегия команды/Цели на период.md";

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

// Скачивает файл из bucket'а team-prompts (Стратегия команды/...), возвращает
// строку или пустую строку. Используется в авто-загрузке mission / goals.
// Если файла нет (свежий проект, Влад ещё не написал миссию) — пусто, не падаем.
async function loadStrategyFile(path) {
  try {
    return await downloadFile(PROMPTS_BUCKET, path);
  } catch {
    return "";
  }
}

// Главная функция. Принимает имя шаблона (с или без `.md`) и переменные.
// Возвращает {system, user, cacheableBlocks, template}:
//   system — финальный текст с подставленными плейсхолдерами
//   user — финальный текст пользовательского сообщения
//   cacheableBlocks — массив строк (mission, goals), для Anthropic-кеша
//   template — фактическое имя файла шаблона (с .md)
//
// Имя шаблона может быть полным путём внутри bucket'а (например,
// «Шаблоны задач/Свободные идеи.md»). Бросает ошибку с понятным русским
// сообщением, если шаблона нет.
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

  // Авто-загрузка mission / goals (и их алиасов context / concept), если
  // упомянуты в шаблоне и не переданы вызывающим кодом.
  const referenced = new Set([...findPlaceholders(systemBody), ...findPlaceholders(userBody ?? "")]);

  const wantsMission = referenced.has("mission") || referenced.has("context");
  if (wantsMission) {
    let missionText = null;
    if (vars.mission !== undefined) missionText = vars.mission;
    else if (vars.context !== undefined) missionText = vars.context;
    else missionText = await loadStrategyFile(MISSION_PATH);
    // Заполняем оба ключа, чтобы шаблоны со старым именованием тоже сработали.
    if (vars.mission === undefined) vars.mission = missionText;
    if (vars.context === undefined) vars.context = missionText;
  }

  const wantsGoals = referenced.has("goals") || referenced.has("concept");
  if (wantsGoals) {
    let goalsText = null;
    if (vars.goals !== undefined) goalsText = vars.goals;
    else if (vars.concept !== undefined) goalsText = vars.concept;
    else goalsText = await loadStrategyFile(GOALS_PATH);
    if (vars.goals === undefined) vars.goals = goalsText;
    if (vars.concept === undefined) vars.concept = goalsText;
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

  // В cacheableBlocks кладём mission и goals как есть (без подстановки —
  // они и так чистый текст без плейсхолдеров). Пустые блоки не включаем,
  // чтобы Anthropic не получил «whitespace-only» блок (он на это ругается).
  // Старые ключи context / concept служат фолбэком, если шаблон/код ещё
  // не переехал на новые имена.
  const cacheableBlocks = [];
  const seen = new Set();
  for (const key of ["mission", "context", "goals", "concept"]) {
    const val = vars[key];
    if (val && String(val).trim() && !seen.has(String(val))) {
      cacheableBlocks.push(String(val));
      seen.add(String(val));
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
// После Сессии 4 пять шаблонов задач переехали в подпапку `Шаблоны задач/` —
// поэтому листим её, а не корень. Возвращаем имена с префиксом папки.
export async function listTemplates() {
  const folder = "Шаблоны задач";
  const files = await listFiles(PROMPTS_BUCKET, folder);
  return files
    .map((f) => f.name)
    .filter((name) => typeof name === "string" && name.endsWith(".md"))
    .map((name) => `${folder}/${name}`)
    .sort();
}
