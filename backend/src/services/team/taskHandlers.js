// Пять обработчиков задач команды + реестр TASK_HANDLERS.
//
// Прямой портирование handler-функций из `dkl_tool/backend/services/task_runner.py`
// на JS, плюс адаптация под Supabase Storage вместо локальной файловой системы:
//   - артефакт сохраняется через teamStorage.uploadFile в bucket team-database
//   - artifact_path хранится как путь внутри bucket'а (без bucket-префикса)
//   - чтение research-файлов для write_text идёт через teamStorage.downloadFile
//
// Реестр TASK_HANDLERS — точка расширения для будущих агентов на этапе 2.
// Добавление нового типа задачи = новый handler + регистрация в TASK_HANDLERS +
// маппинг шаблона в taskRunner.taskTemplateName + (опционально) построение
// artifactPath в _artifactPathFor.
//
// Версионирование write_text работает через listFiles в папке точки —
// читаем все файлы, ищем максимальный vN, прибавляем 1.

import { uploadFile, downloadFile, listFiles } from "./teamStorage.js";
import { call as llmCall } from "./llmClient.js";
import { buildPrompt } from "./promptBuilder.js";
import { fetchSource } from "./contentFetcher.js";

const DATABASE_BUCKET = "team-database";

// =========================================================================
// helpers
// =========================================================================

function timestamp() {
  // YYYY-MM-DD_HHMM в локальном времени, как в Python-версии.
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `_${pad(d.getHours())}${pad(d.getMinutes())}`
  );
}

function firstLine(text) {
  if (!text) return "";
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (line) return line;
  }
  return "";
}

// Транслитерация кириллицы в латиницу. Supabase Storage не принимает в
// ключах объектов non-ASCII символы (отдаёт `Invalid key: ...`), поэтому
// слаги путей обязаны быть в ASCII. Python-версия ДК Лурье работала с
// локальной файловой системой, где UTF-8 проходил — здесь среда строже.
// Таблица ниже — стандартная ГОСТ-подобная транслитерация (без диакритики).
const CYRILLIC_MAP = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya",
};

function transliterate(text) {
  let out = "";
  for (const ch of String(text ?? "")) {
    const lower = ch.toLowerCase();
    out += CYRILLIC_MAP[lower] ?? ch;
  }
  return out;
}

// Аналог _slugify из Python: убираем пунктуацию, схлопываем пробелы в дефисы,
// переводим в нижний регистр. Перед слаггингом транслитерируем кириллицу —
// Supabase Storage отказывается принимать non-ASCII в путях.
function slugify(text, maxLen = 40) {
  let s = transliterate(text)
    .normalize("NFKD")
    // Удаляем всё, что не ASCII-буква/цифра/пробел/дефис/подчёркивание.
    .replace(/[^A-Za-z0-9\s_-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  if (!s) s = "task";
  s = s.slice(0, maxLen).replace(/-+$/g, "");
  return s || "task";
}

// Подбирает следующий номер версии для папки точки в bucket'е team-database.
// listFiles даёт список файлов в каталоге. Ищем максимальный vN_ префикс,
// прибавляем 1. Если папки нет (свежая точка) — возвращаем 1.
async function nextVersion(pointDir) {
  let files;
  try {
    files = await listFiles(DATABASE_BUCKET, pointDir);
  } catch {
    return 1;
  }
  let highest = 0;
  const re = /^v(\d+)_/i;
  for (const file of files) {
    const m = (file?.name ?? "").match(re);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n)) highest = Math.max(highest, n);
  }
  return highest + 1;
}

// Путь до артефакта в bucket'е team-database (без префикса bucket'а — Supabase
// кладёт его сам). artifact_path в team_tasks хранится в этом же формате.
async function artifactPathFor(taskType, params) {
  const ts = timestamp();

  if (taskType === "ideas_free") {
    const slug = slugify(firstLine(params.user_input) || "ideas-free");
    return `ideas/${ts}_${slug}.md`;
  }
  if (taskType === "ideas_questions_for_research") {
    const slug = slugify(firstLine(params.user_input) || "questions");
    return `ideas/${ts}_questions_${slug}.md`;
  }
  if (taskType === "research_direct") {
    const topic = firstLine(params.source) || firstLine(params.user_input) || "research";
    const slug = slugify(topic);
    return `research/${ts}_${slug}.md`;
  }
  if (taskType === "write_text") {
    const point = (params.point_name ?? "").trim();
    const slug = slugify(point || "untitled-point");
    const pointDir = `texts/${slug}`;
    const version = await nextVersion(pointDir);
    return `${pointDir}/v${version}_${ts}.md`;
  }
  // Фолбэк: ideas/<ts>_<slug>.md.
  const slug = slugify(taskType);
  return `ideas/${ts}_${slug}.md`;
}

// Сохраняет артефакт в bucket team-database. headerLines — список строк,
// которые пойдут вверх артефакта; затем пустая строка, затем тело.
async function saveArtifact(path, body, headerLines = []) {
  const pieces = [];
  if (headerLines.length > 0) {
    pieces.push(headerLines.join("\n"));
    pieces.push("");
  }
  pieces.push(body ?? "");
  await uploadFile(DATABASE_BUCKET, path, pieces.join("\n"));
}

// Сборка research-блока для write_text. paths — массив строк-путей в team-database
// (например, ["research/2026-05-04_petersburg.md"]). Молча пропускает то, что
// не нашли в Storage.
async function gatherResearch(paths) {
  if (!paths || paths.length === 0) return "";
  const pieces = [];
  for (const raw of paths) {
    const rel = (raw ?? "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel) continue;
    let body;
    try {
      body = await downloadFile(DATABASE_BUCKET, rel);
    } catch {
      continue; // нет файла — пропускаем
    }
    const fileName = rel.split("/").pop() || rel;
    const title = fileName.replace(/\.md$/i, "");
    pieces.push(
      `### Источник: ${title}\n_путь: ${rel}_\n\n${(body ?? "").trim()}`,
    );
  }
  if (pieces.length === 0) return "";
  return pieces.join("\n\n---\n\n");
}

// Превращает структурированный список правок в markdown-блок для шаблона
// edit-text-fragments.md. Ровно как в Python-версии.
export function formatEdits(edits) {
  if (!Array.isArray(edits) || edits.length === 0) {
    return "(пустой список — применять только общую инструкцию)";
  }
  const pieces = [];
  let idx = 1;
  for (const edit of edits) {
    if (!edit || typeof edit !== "object") continue;
    const fragment = (edit.fragment ?? "").trim();
    const instruction = (edit.instruction ?? "").trim();
    if (!fragment && !instruction) continue;
    pieces.push(
      `### Правка ${idx}\n` +
        `Фрагмент:\n«${fragment}»\n\n` +
        `Что сделать: ${instruction || "(инструкция не указана)"}`,
    );
    idx += 1;
  }
  if (pieces.length === 0) {
    return "(пустой список — применять только общую инструкцию)";
  }
  return pieces.join("\n\n---\n\n");
}

// Helper для preview prompt в taskRunner.previewPrompt (нужен gatherResearch
// без вызова handler'а).
export async function buildPreviewVariables(taskType, params) {
  const variables = { ...(params || {}) };

  if (taskType === "write_text" && !(variables.research ?? "").toString().trim()) {
    const paths = Array.isArray(variables.research_paths) ? variables.research_paths : [];
    variables.research = await gatherResearch(paths);
  }

  if (taskType === "edit_text_fragments") {
    const rawEdits = variables.edits;
    if (Array.isArray(rawEdits)) {
      variables.edits = formatEdits(rawEdits);
    } else if (!String(rawEdits ?? "").trim()) {
      variables.edits = formatEdits([]);
    }
    if (!String(variables.user_input ?? "").trim()) {
      variables.user_input =
        "Примени все перечисленные правки и верни обновлённый текст целиком.";
    }
  }

  return variables;
}

// =========================================================================
// handlers (по одной функции на каждый тип задачи)
// =========================================================================

async function handleIdeasFree(task) {
  const { params, prompt, provider, model } = task;

  const result = await llmCall({
    provider,
    model,
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    cacheableBlocks: prompt.cacheable_blocks ?? prompt.cacheableBlocks ?? [],
  });

  const path = await artifactPathFor("ideas_free", params);
  const headerLines = [
    `# ${task.title || "Идеи (свободные)"}`,
    "",
    `_${task.created_at} · ${provider}/${model} · task \`${task.id}\`_`,
    "",
    "## Запрос",
    "",
    (params.user_input ?? "").trim(),
    "",
    "## Ответ",
  ];
  await saveArtifact(path, result.text, headerLines);

  return {
    result: result.text,
    artifactPath: path,
    tokens: {
      input: result.inputTokens ?? 0,
      output: result.outputTokens ?? 0,
      cached: result.cachedTokens ?? 0,
    },
  };
}

async function handleIdeasQuestionsForResearch(task) {
  const { params, prompt, provider, model } = task;

  const result = await llmCall({
    provider,
    model,
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    cacheableBlocks: prompt.cacheable_blocks ?? prompt.cacheableBlocks ?? [],
  });

  const path = await artifactPathFor("ideas_questions_for_research", params);
  const topic = (params.user_input ?? "").trim();
  const headerLines = [
    `# ${task.title || "Вопросы для исследования"}`,
    "",
    `_${task.created_at} · ${provider}/${model} · task \`${task.id}\`_`,
    "",
    "## Тема",
    "",
    topic,
    "",
    "## Вопросы",
  ];
  await saveArtifact(path, result.text, headerLines);

  return {
    result: result.text,
    artifactPath: path,
    tokens: {
      input: result.inputTokens ?? 0,
      output: result.outputTokens ?? 0,
      cached: result.cachedTokens ?? 0,
    },
  };
}

async function handleResearchDirect(task) {
  const { params, provider, model } = task;
  const source = (params.source ?? "").trim();

  let usedPrompt;
  let fetchedLabel = source;
  let fetchedKind = "manual";

  if (task.prompt_override_used) {
    // Юзер сам отредактировал промпт — доверяем ему, source повторно не качаем.
    usedPrompt = task.prompt;
  } else {
    if (!source) {
      throw new Error("Не указан источник (URL или путь к файлу)");
    }
    const fetched = await fetchSource(source);
    fetchedLabel = fetched.label;
    fetchedKind = fetched.kind;
    usedPrompt = await buildPrompt("research-direct.md", {
      user_input: params.user_input ?? "",
      source_label: fetched.label,
      source_text: fetched.text,
    });
  }

  const result = await llmCall({
    provider,
    model,
    systemPrompt: usedPrompt.system,
    userPrompt: usedPrompt.user,
    cacheableBlocks: usedPrompt.cacheable_blocks ?? usedPrompt.cacheableBlocks ?? [],
  });

  const path = await artifactPathFor("research_direct", { ...params, source: fetchedLabel });
  const headerLines = [
    `# ${task.title || "Исследование"}`,
    "",
    `_${task.created_at} · ${provider}/${model} · task \`${task.id}\`_`,
    "",
    `**Источник:** ${fetchedLabel}  `,
    `**Тип:** ${fetchedKind}`,
    "",
    "## Вопрос",
    "",
    (params.user_input ?? "").trim(),
    "",
    "## Ответ",
  ];
  await saveArtifact(path, result.text, headerLines);

  return {
    result: result.text,
    artifactPath: path,
    prompt: usedPrompt,
    tokens: {
      input: result.inputTokens ?? 0,
      output: result.outputTokens ?? 0,
      cached: result.cachedTokens ?? 0,
    },
  };
}

async function handleWriteText(task) {
  const { params, provider, model } = task;

  let usedPrompt;
  if (task.prompt_override_used) {
    usedPrompt = task.prompt;
  } else {
    const researchBlob = await gatherResearch(params.research_paths || []);
    usedPrompt = await buildPrompt("write-text.md", {
      point_name: params.point_name ?? "",
      research: researchBlob,
      length_hint: params.length_hint ?? "произвольно",
      user_input: params.user_input ?? "",
    });
  }

  const result = await llmCall({
    provider,
    model,
    systemPrompt: usedPrompt.system,
    userPrompt: usedPrompt.user,
    cacheableBlocks: usedPrompt.cacheable_blocks ?? usedPrompt.cacheableBlocks ?? [],
    maxTokens: 8192,
  });

  const path = await artifactPathFor("write_text", params);
  // Текст хранит свой `# Point` заголовок — добавляем только html-комментарий
  // с трассируемостью (его легко скрыть в рендере).
  const headerLines = [
    `<!-- task ${task.id} · ${task.created_at} · ${provider}/${model} -->`,
  ];
  await saveArtifact(path, result.text, headerLines);

  return {
    result: result.text,
    artifactPath: path,
    prompt: usedPrompt,
    tokens: {
      input: result.inputTokens ?? 0,
      output: result.outputTokens ?? 0,
      cached: result.cachedTokens ?? 0,
    },
  };
}

async function handleEditFragments(task) {
  const { params, provider, model } = task;

  // taskRunner перед запуском прокидывает в params уже найденного parent'а
  // (parent_artifact_path, point_dir). Это позволяет handler'у быть тупым —
  // он не лезет в БД, всё нужное уже в task.
  const parentArtifact = (params.parent_artifact_path ?? "").trim();
  if (!parentArtifact) {
    throw new Error("У исходной задачи нет артефакта в Storage");
  }
  const pointDir = parentArtifact.includes("/")
    ? parentArtifact.slice(0, parentArtifact.lastIndexOf("/"))
    : "";
  if (!pointDir) {
    throw new Error(`Не удалось определить папку точки из пути ${parentArtifact}`);
  }

  let usedPrompt;
  if (task.prompt_override_used) {
    usedPrompt = task.prompt;
  } else {
    usedPrompt = await buildPrompt("edit-text-fragments.md", {
      full_text: params.full_text ?? "",
      edits: formatEdits(params.edits || []),
      general_instruction: (params.general_instruction ?? "").trim(),
      // У шаблона нет ## User секции — даём промпту явный turn-start вход.
      user_input:
        "Примени все перечисленные правки и верни обновлённый текст целиком.",
    });
  }

  const result = await llmCall({
    provider,
    model,
    systemPrompt: usedPrompt.system,
    userPrompt: usedPrompt.user,
    cacheableBlocks: usedPrompt.cacheable_blocks ?? usedPrompt.cacheableBlocks ?? [],
    maxTokens: 8192,
  });

  const ts = timestamp();
  const version = await nextVersion(pointDir);
  const path = `${pointDir}/v${version}_${ts}.md`;
  const parentId = (params.parent_task_id ?? "").trim();
  const headerLines = [
    `<!-- task ${task.id} · ${task.created_at} · ${provider}/${model} · edit of ${parentId} -->`,
  ];
  await saveArtifact(path, result.text, headerLines);

  return {
    result: result.text,
    artifactPath: path,
    prompt: usedPrompt,
    tokens: {
      input: result.inputTokens ?? 0,
      output: result.outputTokens ?? 0,
      cached: result.cachedTokens ?? 0,
    },
  };
}

// =========================================================================
// реестр
// =========================================================================

// Реестр обработчиков. Ключ = type из team_tasks, значение = async-функция.
// Точка расширения для этапа 2 (новые типы задач для AI-агентов).
export const TASK_HANDLERS = {
  ideas_free: handleIdeasFree,
  ideas_questions_for_research: handleIdeasQuestionsForResearch,
  research_direct: handleResearchDirect,
  write_text: handleWriteText,
  edit_text_fragments: handleEditFragments,
};

// Человекочитаемые названия для UI и заголовков артефактов.
export const TASK_TITLES = {
  ideas_free: "Идеи и вопросы (свободные)",
  ideas_questions_for_research: "Идеи и вопросы (для исследования)",
  research_direct: "Исследовать напрямую",
  write_text: "Написать текст",
  edit_text_fragments: "Правка через AI",
};

// Имя файла шаблона в bucket'е team-prompts. Маппинг тип → имя файла.
export function taskTemplateName(taskType) {
  const map = {
    ideas_free: "ideas-free.md",
    ideas_questions_for_research: "ideas-questions.md",
    research_direct: "research-direct.md",
    write_text: "write-text.md",
    edit_text_fragments: "edit-text-fragments.md",
  };
  return map[taskType] ?? `${taskType}.md`;
}

// Технические типы — не показываются в канбане как самостоятельные карточки.
// edit_text_fragments всегда привязан к родительской write_text задаче.
export const HIDDEN_TYPES_IN_LOG = new Set(["edit_text_fragments"]);
