// Сессия 34 этапа 2 (пункт 17): мерджинг нескольких артефактов в один.
//
// На входе — массив путей в bucket'е team-database + инструкция Влада
// («объедини в один документ по порядку», «убери дубли», и т.д.). На выходе —
// новый артефакт, склееный через LLM. Расход пишется с purpose='merge'.

import { downloadFile, uploadFile } from "./teamStorage.js";
import { call as llmCall } from "./llmClient.js";
import { recordCall } from "./costTracker.js";
import { getApiKey } from "./keysService.js";

const BUCKET = "team-database";
const MERGE_FOLDER = "merges";

// Подбираем дешёвую модель по тем же провайдерам, что в Сессии 33.
async function pickProvider() {
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

function nowSlug() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

// =========================================================================
// mergeArtifacts — главный метод.
//
// artifactPaths: массив строк-путей в bucket team-database (не URL'ы).
// instruction: текст инструкции от Влада.
// options:
//   - targetTaskId (опц.) — если передан, артефакт сохраняется как
//     дочерний к задаче (используется для merge-from-task UI).
//
// Возвращает: { artifact_path, content, sources, cost_usd, tokens }.
// =========================================================================
export async function mergeArtifacts(artifactPaths, instruction, { targetTaskId = null } = {}) {
  if (!Array.isArray(artifactPaths) || artifactPaths.length < 2) {
    throw new Error("Передай минимум 2 артефакта.");
  }
  const cleanInstruction = String(instruction ?? "").trim();
  if (!cleanInstruction) {
    throw new Error("Инструкция объединения не может быть пустой.");
  }

  // 1) Скачиваем содержимое всех артефактов.
  const sources = [];
  for (const path of artifactPaths) {
    if (typeof path !== "string" || !path.trim()) continue;
    let content;
    try {
      content = await downloadFile(BUCKET, path);
    } catch (err) {
      throw new Error(`Не удалось скачать артефакт «${path}»: ${err?.message ?? err}`);
    }
    sources.push({ path, content });
  }
  if (sources.length < 2) {
    throw new Error("После скачивания осталось меньше 2 артефактов.");
  }

  // 2) Выбираем LLM-провайдера.
  const provider = await pickProvider();
  if (!provider) {
    throw new Error("Нет доступного LLM-провайдера для объединения.");
  }

  // 3) Собираем промпт.
  const systemPrompt = [
    "Ты объединяешь несколько артефактов в один документ по инструкции пользователя.",
    "Следуй инструкции точно. Не добавляй собственных комментариев и не «улучшай» сверх запрошенного.",
    "Если инструкция требует убрать дубли — сохрани все уникальные мысли.",
    "Если инструкция требует упорядочить — соблюдай порядок (по умолчанию — порядок, в котором артефакты переданы).",
  ].join("\n");

  const blocks = sources.map((s, i) => `Артефакт ${i + 1} ("${shortName(s.path)}"):\n${s.content}`);
  const userPrompt = [
    `Инструкция:\n${cleanInstruction}`,
    "",
    ...blocks,
    "",
    "Выдай объединённый документ. Никаких пояснений до или после — только сам документ.",
  ].join("\n\n");

  // 4) Запрос.
  let response;
  try {
    response = await llmCall({
      provider: provider.name,
      model: provider.model,
      systemPrompt,
      userPrompt,
      maxTokens: 8192,
    });
  } catch (err) {
    throw new Error(`LLM упал на объединении: ${err?.message ?? err}`);
  }

  // 5) Запись расходов.
  let apiEntry = null;
  try {
    apiEntry = await recordCall({
      provider: provider.name,
      model: provider.model,
      inputTokens: Number(response?.inputTokens ?? 0),
      outputTokens: Number(response?.outputTokens ?? 0),
      cachedTokens: Number(response?.cachedTokens ?? 0),
      taskId: targetTaskId,
      success: true,
      agentId: null,
      purpose: "merge",
    });
  } catch (err) {
    console.warn(`[merge] recordCall failed: ${err?.message ?? err}`);
  }

  // 6) Сохраняем результат как новый артефакт.
  const text = response?.text ?? "";
  const fileName = `merge_${nowSlug()}.md`;
  const targetPath = `${MERGE_FOLDER}/${fileName}`;
  const header = [
    `# Объединение ${sources.length} артефактов`,
    "",
    `_${new Date().toISOString()} · ${provider.name}/${provider.model}_`,
    "",
    "## Инструкция",
    "",
    cleanInstruction,
    "",
    "## Источники",
    ...sources.map((s, i) => `${i + 1}. \`${s.path}\``),
    "",
    "## Результат",
    "",
  ].join("\n");
  const body = header + text;
  await uploadFile(BUCKET, targetPath, body, "text/markdown; charset=utf-8");

  return {
    artifact_path: targetPath,
    content: text,
    sources: sources.map((s) => s.path),
    provider: provider.name,
    model: provider.model,
    cost_usd: Number(apiEntry?.cost_usd ?? 0),
    tokens: {
      input: Number(response?.inputTokens ?? 0),
      output: Number(response?.outputTokens ?? 0),
      cached: Number(response?.cachedTokens ?? 0),
    },
  };
}

function shortName(path) {
  const seg = String(path ?? "").split("/").pop();
  return seg || path;
}
