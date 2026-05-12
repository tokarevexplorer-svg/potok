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
import { call as llmCall, callForTask } from "./llmClient.js";
import { buildPrompt } from "./promptBuilder.js";
import { fetchSource } from "./contentFetcher.js";
import {
  initMultistepTask,
  continueTask as continueMultistepTask,
} from "./taskContinuationService.js";
// persistStepState импортируется динамически внутри хендлера, чтобы
// избежать циклической зависимости с taskRunner (он импортирует
// TASK_HANDLERS отсюда).

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
  // Сессия 35: задачи разведчика складываются в research/scout/.
  if (taskType === "analyze_competitor") {
    const slug = slugify(firstLine(params.competitor_name) || firstLine(params.user_input) || "competitor");
    return `research/scout/${ts}_competitor_${slug}.md`;
  }
  if (taskType === "search_trends") {
    const slug = slugify(firstLine(params.focus) || firstLine(params.user_input) || "trends");
    return `research/scout/${ts}_trends_${slug}.md`;
  }
  if (taskType === "free_research") {
    const slug = slugify(firstLine(params.user_input) || "research");
    return `research/scout/${ts}_research_${slug}.md`;
  }
  // Сессия 37: задачи предпродакшна → research/preprod/<role>/...
  const PREPROD_PATHS = {
    deep_research_notebooklm: ["researcher", "notebook"],
    web_research: ["researcher", "web"],
    free_research_with_files: ["researcher", "free"],
    find_cross_references: ["researcher", "cross"],
    video_plan_from_research: ["scriptwriter", "plan"],
    creative_takes: ["scriptwriter", "creative"],
    script_draft: ["scriptwriter", "draft"],
    factcheck_artifact: ["factchecker", "artifact"],
    compare_two_versions: ["factchecker", "compare"],
    cold_factcheck: ["factchecker", "cold"],
    generate_ideas: ["chief", "ideas"],
    review_artifact: ["chief", "review"],
    daily_plan_breakdown: ["chief", "plan"],
  };
  if (PREPROD_PATHS[taskType]) {
    const [role, kind] = PREPROD_PATHS[taskType];
    const slug = slugify(
      firstLine(params.topic) ||
        firstLine(params.competitor_name) ||
        firstLine(params.focus) ||
        firstLine(params.user_input) ||
        taskType,
    );
    return `research/preprod/${role}/${ts}_${kind}_${slug}.md`;
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

  const result = await callForTask(task, {
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

  const result = await callForTask(task, {
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
    usedPrompt = await buildTaskPrompt("research_direct", {
      user_input: params.user_input ?? "",
      source_label: fetched.label,
      source_text: fetched.text,
    });
  }

  const result = await callForTask(task, {
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
    usedPrompt = await buildTaskPrompt("write_text", {
      point_name: params.point_name ?? "",
      research: researchBlob,
      length_hint: params.length_hint ?? "произвольно",
      user_input: params.user_input ?? "",
    });
  }

  const result = await callForTask(task, {
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
    usedPrompt = await buildTaskPrompt("edit_text_fragments", {
      full_text: params.full_text ?? "",
      edits: formatEdits(params.edits || []),
      general_instruction: (params.general_instruction ?? "").trim(),
      // У шаблона нет ## User секции — даём промпту явный turn-start вход.
      user_input:
        "Примени все перечисленные правки и верни обновлённый текст целиком.",
    });
  }

  const result = await callForTask(task, {
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
// Сессия 35: handlers задач разведчика
// =========================================================================
//
// Три новые задачи под аналитика-разведчика (Сессия 37 создаст самого
// агента через UI мастера). Все три — тонкие обёртки над одним LLM-вызовом
// + сохранение артефакта в research/scout/.
//
// callForTask автоматически подмешает Web Search, если у агента в Hands
// привязан web-search (Сессия 32).

async function handleScoutGeneric(task, fallbackTitle) {
  const { params, prompt, provider, model } = task;
  const result = await callForTask(task, {
    systemPrompt: prompt.system,
    userPrompt: prompt.user,
    cacheableBlocks: prompt.cacheable_blocks ?? prompt.cacheableBlocks ?? [],
  });
  const path = await artifactPathFor(task.type, params);
  const headerLines = [
    `# ${task.title || fallbackTitle}`,
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

async function handleAnalyzeCompetitor(task) {
  return handleScoutGeneric(task, "Анализ конкурента");
}

async function handleSearchTrends(task) {
  return handleScoutGeneric(task, "Поиск трендов");
}

async function handleFreeResearch(task) {
  return handleScoutGeneric(task, "Свободный ресёрч");
}

// =========================================================================
// Сессия 37: handlers задач предпродакшна (исследователь / сценарист /
// фактчекер / шеф-редактор). Все 13 задач — обёртки над handleScoutGeneric
// с разным fallback-title. Уникальная логика (NotebookLM multistep,
// шаги) появится в Сессии 38.
// =========================================================================

// Сессия 38: настоящий multistep для глубокого ресёрча через NotebookLM.
//
// Поток:
//   1. Парсим questions_list (по одной строке на вопрос) из params.
//   2. Инициализируем step_state, сохраняем в team_tasks.
//   3. Для каждого шага: callForTask на основной модели агента с user
//      промптом «<вопрос> · контекст: notebook_id».
//   4. После каждого шага — persistStepState (UI показывает прогресс).
//   5. Когда все шаги done — финальный синтез: один LLM-вызов со всеми
//      Q/A на сборку структурированного артефакта.
//   6. Артефакт сохраняется в research/preprod/researcher/notebook/.
//
// Реальной интеграции с NotebookLM в Сессии 38 нет — для каждого вопроса
// agent работает «по знаниям + Web Search если есть», notebook_id идёт в
// промпт как метаданные. Полноценный NotebookLM-воркер — Сессия 38+ за
// рамками текущего sprint'а.
async function handleDeepResearchNotebookLM(task) {
  const { params, prompt, provider, model } = task;
  const { persistStepState } = await import("./taskRunner.js");

  const notebookId = String(params.notebook_id ?? "").trim();
  const rawQuestions = String(params.questions_list ?? "").trim();
  const additionalContext = String(params.additional_context ?? "").trim();

  // Парсим вопросы: одна строка = один вопрос, пустые и закомментированные
  // (начинаются с #) — пропускаем.
  const questions = rawQuestions
    .split("\n")
    .map((q) => q.trim().replace(/^[-*\d.)\s]+/, ""))
    .filter((q) => q.length > 0 && !q.startsWith("#"));

  if (questions.length === 0) {
    // Нет вопросов — деградируем до обычного scout-handler'а.
    return handleScoutGeneric(task, "Глубокий ресёрч через NotebookLM");
  }

  // Инициализация step_state. Если задача уже в работе (recovery после
  // рестарта) — продолжаем с current_step, не сбрасываем результаты.
  let state = task.step_state ?? null;
  if (!state || !Array.isArray(state.steps) || state.total_steps !== questions.length) {
    state = initMultistepTask(questions, { notebook_id: notebookId || null });
    await persistStepState(task.id, state);
  }

  let totalInput = 0;
  let totalOutput = 0;
  let totalCached = 0;

  while (state.current_step < state.total_steps) {
    const idx = state.current_step;
    const question = state.steps[idx]?.question ?? `Вопрос ${idx + 1}`;
    const stepUserPrompt = buildStepUserPrompt({
      question,
      notebookId,
      additionalContext,
      previousAnswers: state.accumulated_results,
    });
    const stepSystemPrompt = prompt.system ?? "";

    const stepResult = await callForTask(task, {
      systemPrompt: stepSystemPrompt,
      userPrompt: stepUserPrompt,
      cacheableBlocks: prompt.cacheable_blocks ?? prompt.cacheableBlocks ?? [],
      maxTokens: 4096,
    });

    totalInput += Number(stepResult.inputTokens ?? 0);
    totalOutput += Number(stepResult.outputTokens ?? 0);
    totalCached += Number(stepResult.cachedTokens ?? 0);

    const advanced = continueMultistepTask(state, stepResult.text ?? "");
    state = advanced.nextState;
    await persistStepState(task.id, state);
  }

  // Финальный синтез.
  const synthesisPrompt = buildSynthesisUserPrompt(
    state.accumulated_results,
    notebookId,
    additionalContext,
  );
  const synthesis = await callForTask(task, {
    systemPrompt: prompt.system ?? "",
    userPrompt: synthesisPrompt,
    cacheableBlocks: prompt.cacheable_blocks ?? prompt.cacheableBlocks ?? [],
    maxTokens: 8192,
  });

  totalInput += Number(synthesis.inputTokens ?? 0);
  totalOutput += Number(synthesis.outputTokens ?? 0);
  totalCached += Number(synthesis.cachedTokens ?? 0);

  // Финальное состояние: synthesis_pending=false.
  state = { ...state, synthesis_pending: false };
  await persistStepState(task.id, state);

  const path = await artifactPathFor("deep_research_notebooklm", params);
  const headerLines = [
    `# ${task.title || "Глубокий ресёрч через NotebookLM"}`,
    "",
    `_${task.created_at} · ${provider}/${model} · task \`${task.id}\`_`,
    "",
    `**Notebook ID:** ${notebookId || "(не задан)"}`,
    `**Вопросов:** ${state.total_steps}`,
    "",
    "## Ответы по вопросам",
    "",
    ...state.accumulated_results.flatMap((qa, i) => [
      `### ${i + 1}. ${qa.question}`,
      "",
      qa.answer,
      "",
    ]),
    "## Синтез",
    "",
  ];
  await saveArtifact(path, synthesis.text ?? "", headerLines);

  return {
    result: synthesis.text ?? "",
    artifactPath: path,
    tokens: {
      input: totalInput,
      output: totalOutput,
      cached: totalCached,
    },
  };
}

function buildStepUserPrompt({ question, notebookId, additionalContext, previousAnswers }) {
  const lines = [];
  if (notebookId) lines.push(`Контекст: данные из NotebookLM (ID: ${notebookId}).`);
  if (additionalContext) lines.push(`Дополнительные указания: ${additionalContext}`);
  if (Array.isArray(previousAnswers) && previousAnswers.length > 0) {
    lines.push("");
    lines.push("Что уже ответили в предыдущих шагах (для согласованности):");
    for (const qa of previousAnswers.slice(-3)) {
      lines.push(`- ${qa.question}: ${(qa.answer ?? "").slice(0, 200)}…`);
    }
  }
  lines.push("");
  lines.push(`Вопрос: ${question}`);
  lines.push("");
  lines.push("Дай структурированный ответ с цитатами/источниками, если применимо.");
  return lines.join("\n");
}

function buildSynthesisUserPrompt(accumulated, notebookId, additionalContext) {
  const lines = [
    "Финальный шаг исследования: собери единый структурированный артефакт.",
    "",
    notebookId ? `Notebook: ${notebookId}` : "Без привязки к Notebook.",
    additionalContext ? `Контекст: ${additionalContext}` : "",
    "",
    "Ответы по вопросам:",
    "",
  ];
  for (const qa of accumulated) {
    lines.push(`### ${qa.question}`);
    lines.push("");
    lines.push(qa.answer ?? "");
    lines.push("");
  }
  lines.push(
    "Собери из этого единый артефакт: структурированные ответы с цитатами, без пересказа вопросов.",
  );
  return lines.join("\n");
}
async function handleWebResearch(task) {
  return handleScoutGeneric(task, "Ресёрч через Web Search");
}
async function handleFreeResearchWithFiles(task) {
  return handleScoutGeneric(task, "Свободный ресёрч с файлами");
}
async function handleFindCrossReferences(task) {
  return handleScoutGeneric(task, "Поиск пересечений в базах");
}
async function handleVideoPlanFromResearch(task) {
  return handleScoutGeneric(task, "План видео по ресёрчу");
}
async function handleCreativeTakes(task) {
  return handleScoutGeneric(task, "Креативные решения подачи");
}
async function handleScriptDraft(task) {
  return handleScoutGeneric(task, "Драфт сценарного текста");
}
async function handleFactcheckArtifact(task) {
  return handleScoutGeneric(task, "Проверка артефакта по фактам");
}
async function handleCompareTwoVersions(task) {
  return handleScoutGeneric(task, "Сверка двух версий");
}
async function handleColdFactcheck(task) {
  return handleScoutGeneric(task, "Холодный фактчек");
}
async function handleGenerateIdeas(task) {
  return handleScoutGeneric(task, "Генерация идей");
}
async function handleReviewArtifact(task) {
  return handleScoutGeneric(task, "Ревью артефакта");
}
async function handleDailyPlanBreakdown(task) {
  return handleScoutGeneric(task, "Декомпозиция плана дня");
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
  // Сессия 35: задачи разведчика.
  analyze_competitor: handleAnalyzeCompetitor,
  search_trends: handleSearchTrends,
  free_research: handleFreeResearch,
  // Сессия 37: задачи предпродакшна.
  deep_research_notebooklm: handleDeepResearchNotebookLM,
  web_research: handleWebResearch,
  free_research_with_files: handleFreeResearchWithFiles,
  find_cross_references: handleFindCrossReferences,
  video_plan_from_research: handleVideoPlanFromResearch,
  creative_takes: handleCreativeTakes,
  script_draft: handleScriptDraft,
  factcheck_artifact: handleFactcheckArtifact,
  compare_two_versions: handleCompareTwoVersions,
  cold_factcheck: handleColdFactcheck,
  generate_ideas: handleGenerateIdeas,
  review_artifact: handleReviewArtifact,
  daily_plan_breakdown: handleDailyPlanBreakdown,
};

// Человекочитаемые названия для UI и заголовков артефактов.
export const TASK_TITLES = {
  ideas_free: "Идеи и вопросы (свободные)",
  ideas_questions_for_research: "Идеи и вопросы (для исследования)",
  research_direct: "Исследовать напрямую",
  write_text: "Написать текст",
  edit_text_fragments: "Правка через AI",
  // Сессия 35.
  analyze_competitor: "Анализ конкурента",
  search_trends: "Поиск трендов",
  free_research: "Свободный ресёрч",
  // Сессия 37: предпродакшн.
  deep_research_notebooklm: "Глубокий ресёрч через NotebookLM",
  web_research: "Ресёрч через Web Search",
  free_research_with_files: "Свободный ресёрч с файлами",
  find_cross_references: "Поиск пересечений в базах",
  video_plan_from_research: "План видео по ресёрчу",
  creative_takes: "Креативные решения подачи",
  script_draft: "Драфт сценарного текста",
  factcheck_artifact: "Проверка артефакта по фактам",
  compare_two_versions: "Сверка двух версий",
  cold_factcheck: "Холодный фактчек",
  generate_ideas: "Генерация идей",
  review_artifact: "Ревью артефакта",
  daily_plan_breakdown: "Декомпозиция плана дня",
};

// Имена шаблонов задач в bucket team-prompts после Сессии 4 этапа 2 (без .md).
// Файлы лежат в подпапке `task-templates/`. Имена строго на латинице со
// слэшем и дефисом — Supabase Storage отбивает пути с пробелами/кириллицей.
const TEMPLATE_NAMES = {
  ideas_free: "ideas-free",
  ideas_questions_for_research: "ideas-questions",
  research_direct: "research-direct",
  write_text: "write-text",
  edit_text_fragments: "edit-text-fragments",
  // Сессия 35.
  analyze_competitor: "analyze-competitor",
  search_trends: "search-trends",
  free_research: "free-research",
  // Сессия 37.
  deep_research_notebooklm: "deep-research-notebooklm",
  web_research: "web-research",
  free_research_with_files: "free-research-with-files",
  find_cross_references: "find-cross-references",
  video_plan_from_research: "video-plan-from-research",
  creative_takes: "creative-takes",
  script_draft: "script-draft",
  factcheck_artifact: "factcheck-artifact",
  compare_two_versions: "compare-two-versions",
  cold_factcheck: "cold-factcheck",
  generate_ideas: "generate-ideas",
  review_artifact: "review-artifact",
  daily_plan_breakdown: "daily-plan-breakdown",
};

// Старые имена шаблонов (плоские, в корне bucket'а) — фолбэк, если новый
// файл по какой-то причине не доехал на конкретный окружение (например, на
// проде ещё не прогнан `npm run migrate:instructions`).
const LEGACY_TEMPLATE_NAMES = {
  ideas_free: "ideas-free.md",
  ideas_questions_for_research: "ideas-questions.md",
  research_direct: "research-direct.md",
  write_text: "write-text.md",
  edit_text_fragments: "edit-text-fragments.md",
};

// Имя файла шаблона в bucket'е team-prompts. Возвращает путь с подпапкой:
// `task-templates/ideas-free.md`.
export function taskTemplateName(taskType) {
  const name = TEMPLATE_NAMES[taskType];
  if (name) return `task-templates/${name}.md`;
  return LEGACY_TEMPLATE_NAMES[taskType] ?? `${taskType}.md`;
}

// Старый путь шаблона (в корне bucket'а). Используется как фолбэк, если
// новый файл не найден — см. buildTaskPrompt.
export function taskTemplateNameLegacy(taskType) {
  return LEGACY_TEMPLATE_NAMES[taskType] ?? `${taskType}.md`;
}

// Собирает промпт задачи через buildPrompt: сначала пробует новый путь
// (`task-templates/<name>.md`), при «Шаблон не найден» — старый flat-путь
// в корне (ideas-free.md и т.п.). При срабатывании фолбэка записывает
// предупреждение в лог, чтобы было видно, что миграция ещё не прогнана
// на этом окружении.
export async function buildTaskPrompt(taskType, variables = {}) {
  const primary = taskTemplateName(taskType);
  try {
    return await buildPrompt(primary, variables);
  } catch (err) {
    const msg = err?.message ?? "";
    if (!/Шаблон не найден/.test(msg)) throw err;
    const legacy = taskTemplateNameLegacy(taskType);
    if (legacy === primary) throw err;
    console.warn(
      `[team] шаблон "${primary}" не найден, fallback на "${legacy}". ` +
        "Прогоните `npm run migrate:instructions` на этом окружении.",
    );
    return await buildPrompt(legacy, variables);
  }
}

// Технические типы — не показываются в канбане как самостоятельные карточки.
// edit_text_fragments всегда привязан к родительской write_text задаче.
export const HIDDEN_TYPES_IN_LOG = new Set(["edit_text_fragments"]);
