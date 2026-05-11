/**
 * Многослойная сборка промпта для агентов команды (Сессия 6 этапа 2).
 *
 * Порядок слоёв (от общего к частному):
 *   1. Mission         — общая цель команды (кешируется)
 *   2. Author profile  — опц., профиль Влада-автора (кешируется)
 *   3. Role            — должностная инструкция агента (кешируется, заглушка)
 *   4. Goals           — цели на период (кешируется)
 *   5. Memory          — правила из БД team_agent_memory (динамика, НЕ кешируется)
 *   6. Skills          — рецепты успеха из Storage (кешируется)
 *   7. Task            — конкретная постановка задачи (динамика, не кешируется)
 *
 * Обоснование порядка:
 *   - Recency bias: задача в конце читается моделью «острее».
 *   - Lost-in-the-middle: начало и конец читаются хорошо, середина — хуже.
 *     Стабильные слои — в начале, динамика — в конце.
 *   - Prompt caching: стабильный префикс = экономия на кеше Anthropic ephemeral.
 *
 * Реализация:
 *   - До Сессии 6 модель была двухслойной: mission + goals + task (3 слоя).
 *     Новые слои — author_profile, role, memory, skills — добавлены с
 *     заглушками. Если соответствующие источники пусты (нет файла в Storage,
 *     не передан agent_name/agent_id, нет записей в team_agent_memory) — слой
 *     пропускается без ошибок и без шумных логов.
 *   - Текущий llmClient.js принимает cacheableBlocks (массив строк, каждая
 *     с cache_control) + systemPrompt (одна не-кешируемая строка). Поэтому
 *     физический порядок в запросе Anthropic становится:
 *       mission → author_profile → role → goals → skills (всё cacheable)
 *       → memory + task (склейка systemPrompt, non-cacheable).
 *     Логический порядок (memory ПЕРЕД skills) сохранён в массиве `layers`
 *     для превью промпта и getPromptLayersSummary — это для отладки и
 *     документации. На результат LLM эта разница не влияет: skills всё равно
 *     попадает в кеш, memory всё равно динамичная. Разнесение нужно только
 *     для cache-эффективности.
 *
 * Обратная совместимость:
 *   - Сигнатура buildPrompt(templateName, variables) — без изменений.
 *   - Новые опц. ключи в variables: `agent_name` (или `agentName`) для role/skills,
 *     `agent_id` (или `agentId`) для memory. Если не переданы — слои пропускаются,
 *     поведение совпадает с двухслойной моделью.
 *   - Старые алиасы плейсхолдеров в шаблонах ({{context}}, {{concept}}) и
 *     ключи в vars (context/concept) продолжают работать.
 *
 * @see Claude_team_stage2.MD, Сессия 6
 */

import { downloadFile, listFiles } from "./teamStorage.js";

// {{name}} — буквы латиницы, цифры и underscore. Регистр важен.
// Пробелы внутри {{ name }} разрешены. Совпадает с Python-версией.
const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

const PROMPTS_BUCKET = "team-prompts";

// Пути к стратегическим блокам в bucket'е team-prompts. После Сессии 4
// они переехали из team-database/context.md и team-database/concept.md.
const MISSION_PATH = "strategy/mission.md";
const GOALS_PATH = "strategy/goals.md";
const AUTHOR_PROFILE_PATH = "strategy/author-profile.md";

// Корни папок для агент-зависимых слоёв. Появятся в Сессии 7+ (этап 2).
const ROLES_FOLDER = "roles"; // roles/<agent_name>.md
const SKILLS_FOLDER = "agent-skills"; // agent-skills/<agent_name>/*.md

// Логический порядок слоёв (от общего к частному). Используется в превью,
// summary и layers — для документации и отладки. См. JSDoc выше про физический
// порядок в Anthropic-запросе.
const LAYER_ORDER = [
  "mission",
  "author_profile",
  "role",
  "goals",
  "memory",
  "skills",
  "task",
];

// Лейблы слоёв для визуальных разделителей в превью промпта.
const LAYER_LABELS = {
  mission: "MISSION",
  author_profile: "AUTHOR_PROFILE",
  role: "ROLE",
  goals: "GOALS",
  memory: "MEMORY",
  skills: "SKILLS",
  task: "ЗАДАЧА",
};

// Сообщения-заглушки в превью для слоёв, которые на этом этапе ещё не загружаются.
const LAYER_SKIP_HINTS = {
  mission: "(пусто — strategy/mission.md ещё не заполнен)",
  author_profile: "(не загружен — файл strategy/author-profile.md отсутствует)",
  role: "(не загружен — агент не указан)",
  goals: "(пусто — strategy/goals.md ещё не заполнен)",
  memory: "(не загружен — агент не указан или таблица пуста)",
  skills: "(не загружен — агент не указан)",
  task: "(пусто — шаблон без ## System секции)",
};

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

// Скачивает файл из bucket'а team-prompts (strategy/...), возвращает
// строку или пустую строку. Используется в авто-загрузке всех слоёв.
// Если файла нет (свежий проект, Влад ещё не написал миссию) — пусто, не падаем.
async function loadStorageFile(path) {
  try {
    const text = await downloadFile(PROMPTS_BUCKET, path);
    return text ?? "";
  } catch {
    return "";
  }
}

// =========================================================================
// Загрузчики слоёв
// =========================================================================

// Mission — обязательный слой, читается из strategy/mission.md.
async function loadMission() {
  return await loadStorageFile(MISSION_PATH);
}

// Author profile — опциональный слой. Появится в этапе 2 (пункт 9).
// Если файла нет — слой пропускается без логов.
async function loadAuthorProfile() {
  return await loadStorageFile(AUTHOR_PROFILE_PATH);
}

// Role — заглушка для Сессии 6. Читает roles/<agent_name>.md, если задан.
// Позже (этап 2, пункт 7) сюда будет встраиваться автогенерируемый блок Awareness.
async function loadRole(agentName) {
  if (!agentName) return "";
  const path = `${ROLES_FOLDER}/${agentName}.md`;
  return await loadStorageFile(path);
}

// Goals — обязательный слой, читается из strategy/goals.md.
async function loadGoals() {
  return await loadStorageFile(GOALS_PATH);
}

// Memory — динамический слой из БД (таблица team_agent_memory, этап 1 пункт 3).
// Сейчас заглушка: возвращает пустой массив, потому что таблицы ещё нет.
// Когда появится — здесь будет SELECT * FROM team_agent_memory WHERE agent_id = ?
// (а ошибка отсутствия таблицы по-прежнему молчаливо превратится в [] — try/catch
// гарантирует, что промпт-сборка не падает).
async function loadMemoryRules(agentId) {
  if (!agentId) return [];
  // TODO(этап 1 пункт 3, Сессия 7): SELECT rule_text FROM team_agent_memory
  //   WHERE agent_id = $1 AND active = true ORDER BY created_at.
  // Пока таблица не создана — возвращаем пусто, без логов.
  return [];
}

// Превращает массив правил в markdown-блок `## Правила из памяти\n- ...`.
function formatMemoryAsMarkdown(rules) {
  if (!Array.isArray(rules) || rules.length === 0) return "";
  const lines = ["## Правила из памяти"];
  for (const rule of rules) {
    const text = String(rule ?? "").trim();
    if (text) lines.push(`- ${text}`);
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

// Skills — конкатенация всех .md из agent-skills/<agent_name>/ через `---`.
// Если папки нет или агент не задан — пусто. Этап 4 (пункт 10) добавит
// фильтрацию по релевантности — пока берём все.
async function loadSkills(agentName) {
  if (!agentName) return "";
  const folder = `${SKILLS_FOLDER}/${agentName}`;
  let files;
  try {
    files = await listFiles(PROMPTS_BUCKET, folder);
  } catch {
    return "";
  }
  if (!Array.isArray(files) || files.length === 0) return "";
  const mdFiles = files.filter(
    (f) => f && typeof f.name === "string" && f.name.toLowerCase().endsWith(".md"),
  );
  if (mdFiles.length === 0) return "";

  const bodies = [];
  for (const file of mdFiles) {
    const body = await loadStorageFile(`${folder}/${file.name}`);
    if (body && body.trim()) bodies.push(body.trim());
  }
  if (bodies.length === 0) return "";
  return bodies.join("\n\n---\n\n");
}

// =========================================================================
// Сводка слоёв
// =========================================================================

/**
 * Метаинформация о загруженных слоях. Логируется при каждой сборке промпта.
 * Не уходит в team_api_calls — слишком подробно для журнала.
 *
 * Оценка токенов — грубая (chars / 4). Реальный токенайзер у каждого провайдера
 * свой; для дашборда и сравнения порядков величин этого хватает.
 *
 * @param {Array<{key: string, content: string, cacheable: boolean, loaded: boolean}>} layers
 * @returns {{
 *   layers_loaded: string[],
 *   layers_skipped: string[],
 *   total_tokens_estimate: number,
 *   cache_eligible_tokens: number,
 * }}
 */
export function getPromptLayersSummary(layers) {
  const arr = Array.isArray(layers) ? layers : [];
  const loadedLayers = arr.filter((l) => l && l.loaded);
  const skippedLayers = arr.filter((l) => l && !l.loaded);
  const totalChars = loadedLayers.reduce(
    (acc, l) => acc + (l.content ? String(l.content).length : 0),
    0,
  );
  const cacheChars = loadedLayers
    .filter((l) => l.cacheable)
    .reduce((acc, l) => acc + (l.content ? String(l.content).length : 0), 0);
  return {
    layers_loaded: loadedLayers.map((l) => l.key),
    layers_skipped: skippedLayers.map((l) => l.key),
    total_tokens_estimate: Math.round(totalChars / 4),
    cache_eligible_tokens: Math.round(cacheChars / 4),
  };
}

// =========================================================================
// Главная функция
// =========================================================================

// Принимает имя шаблона (с или без `.md`) и переменные. Возвращает объект
// с собранным промптом + метаданными о слоях.
//
// Имя шаблона может быть полным путём внутри bucket'а (например,
// `task-templates/ideas-free.md`). Бросает ошибку с понятным русским
// сообщением, если шаблона нет.
//
// Возвращает:
//   - system          — текст для systemPrompt в llmClient (memory + task body,
//                       не-кешируемые слои склеены через два перевода строки)
//   - user            — пользовательское сообщение (после подстановки)
//   - cacheableBlocks — упорядоченный массив строк-блоков для cache_control
//                       (mission, author_profile, role, goals, skills) — каждая
//                       заворачивается в ephemeral cache в Anthropic-вызове
//   - template        — фактическое имя файла шаблона (с .md)
//   - layers          — массив всех 7 слоёв с метаданными {key, content, cacheable, loaded}
//   - layeredPreview  — единая строка с визуальными разделителями для UI превью
//   - summary         — результат getPromptLayersSummary (для отладки/логов)
export async function buildPrompt(templateName, variables = {}) {
  const vars = { ...variables };

  // Опц. параметры для агент-зависимых слоёв. Поддерживаем оба регистра.
  const agentName =
    (vars.agent_name ?? vars.agentName ?? "").toString().trim() || null;
  const agentId =
    (vars.agent_id ?? vars.agentId ?? "").toString().trim() || null;

  const finalName = templateName.endsWith(".md") ? templateName : `${templateName}.md`;

  let raw;
  try {
    raw = await downloadFile(PROMPTS_BUCKET, finalName);
  } catch {
    throw new Error(`Шаблон не найден: ${finalName}`);
  }

  const { systemBody, userBody } = splitSections(raw);

  // Какие плейсхолдеры упомянуты в шаблоне — нужно для авто-подстановки
  // mission/goals в тело шаблона (backward compat). Новые слои (role, memory,
  // skills) — НЕ подставляются плейсхолдерами; они добавляются как отдельные
  // блоки в системный промпт.
  const referenced = new Set([
    ...findPlaceholders(systemBody),
    ...findPlaceholders(userBody ?? ""),
  ]);

  // ---- Загрузка всех слоёв параллельно ----
  const [
    missionContent,
    authorProfileContent,
    roleContent,
    goalsContent,
    memoryRules,
    skillsContent,
  ] = await Promise.all([
    vars.mission !== undefined
      ? Promise.resolve(String(vars.mission ?? ""))
      : vars.context !== undefined
        ? Promise.resolve(String(vars.context ?? ""))
        : loadMission(),
    loadAuthorProfile(),
    loadRole(agentName),
    vars.goals !== undefined
      ? Promise.resolve(String(vars.goals ?? ""))
      : vars.concept !== undefined
        ? Promise.resolve(String(vars.concept ?? ""))
        : loadGoals(),
    loadMemoryRules(agentId),
    loadSkills(agentName),
  ]);

  const memoryContent = formatMemoryAsMarkdown(memoryRules);

  // ---- Backward compat: подставляем mission/goals в плейсхолдеры шаблона ----
  // Старые шаблоны используют {{mission}}/{{goals}} (или {{context}}/{{concept}})
  // внутри своего ## System — после Сессии 6 это всё ещё работает: значения,
  // загруженные выше, подставляются в тело шаблона. Дополнительно mission/goals
  // присутствуют как отдельные верхние слои (cacheableBlocks). Дубликат текста
  // в Anthropic-запросе — известная особенность, остаётся как было до Сессии 6.
  if (referenced.has("mission") && vars.mission === undefined) vars.mission = missionContent;
  if (referenced.has("context") && vars.context === undefined) vars.context = missionContent;
  if (referenced.has("goals") && vars.goals === undefined) vars.goals = goalsContent;
  if (referenced.has("concept") && vars.concept === undefined) vars.concept = goalsContent;

  // ---- Сборка тела задачи (task layer = подставленный systemBody) ----
  let userText;
  if (userBody === null) {
    userText = String(vars.user_input ?? "");
  } else {
    userText = replacePlaceholders(userBody, vars);
  }
  const taskContent = replacePlaceholders(systemBody, vars);

  // ---- Семь слоёв в логическом порядке ----
  const rawLayers = [
    { key: "mission", content: missionContent, cacheable: true },
    { key: "author_profile", content: authorProfileContent, cacheable: true },
    { key: "role", content: roleContent, cacheable: true },
    { key: "goals", content: goalsContent, cacheable: true },
    { key: "memory", content: memoryContent, cacheable: false },
    { key: "skills", content: skillsContent, cacheable: true },
    { key: "task", content: taskContent, cacheable: false },
  ];
  const layers = rawLayers.map((l) => ({
    ...l,
    content: l.content ?? "",
    loaded: !!(l.content && String(l.content).trim()),
  }));

  // ---- cacheableBlocks: упорядоченный массив для llmClient ----
  // Порядок в Anthropic-запросе: mission → author_profile → role → goals → skills
  // (всё, что cacheable=true и loaded=true; пустые/дубли пропускаем).
  const cacheableBlocks = [];
  const seenCache = new Set();
  for (const layer of layers) {
    if (!layer.cacheable || !layer.loaded) continue;
    const text = String(layer.content);
    if (seenCache.has(text)) continue;
    cacheableBlocks.push(text);
    seenCache.add(text);
  }

  // ---- system: склейка не-кешируемых слоёв (memory + task) ----
  // Эти слои идут как обычный текст в systemPrompt llmClient'а — после
  // cacheableBlocks. Memory ставится ПЕРЕД task: модель сначала читает
  // динамические правила, потом постановку задачи.
  const nonCacheableParts = layers
    .filter((l) => !l.cacheable && l.loaded)
    .map((l) => String(l.content).trim());
  const systemText = nonCacheableParts.join("\n\n");

  // ---- layeredPreview: единая строка для UI с разделителями ----
  // Используется фронтом, чтобы Влад видел каркас промпта с пометками
  // о незагруженных слоях. На сам Anthropic-запрос НЕ влияет.
  const previewLines = [];
  for (const layer of layers) {
    previewLines.push(`═══ ${LAYER_LABELS[layer.key]} ═══`);
    if (layer.loaded) {
      previewLines.push(String(layer.content).trim());
    } else {
      previewLines.push(LAYER_SKIP_HINTS[layer.key] ?? "(не загружен)");
    }
    previewLines.push("");
  }
  const layeredPreview = previewLines.join("\n").trim();

  // ---- summary + лог ----
  const summary = getPromptLayersSummary(layers);
  // Лог уйдёт в Railway Logs / локальную консоль при каждой сборке промпта.
  // В team_api_calls не пишем — для журнала слишком подробно.
  console.log(
    `[promptBuilder] template=${finalName} ` +
      `loaded=[${summary.layers_loaded.join(",")}] ` +
      `skipped=[${summary.layers_skipped.join(",")}] ` +
      `tokens≈${summary.total_tokens_estimate} ` +
      `cache_eligible≈${summary.cache_eligible_tokens}`,
  );

  return {
    system: systemText,
    user: userText,
    cacheableBlocks,
    template: finalName,
    layers,
    layeredPreview,
    summary,
  };
}

// Возвращает список имён всех шаблонов в bucket'е team-prompts (только .md).
// После Сессии 4 пять шаблонов задач переехали в подпапку `task-templates/` —
// поэтому листим её, а не корень. Возвращаем имена с префиксом папки.
export async function listTemplates() {
  const folder = "task-templates";
  const files = await listFiles(PROMPTS_BUCKET, folder);
  return files
    .map((f) => f.name)
    .filter((name) => typeof name === "string" && name.endsWith(".md"))
    .map((name) => `${folder}/${name}`)
    .sort();
}

// Экспортируем константы — могут пригодиться в скриптах валидации и тестах.
export { LAYER_ORDER, LAYER_LABELS };
