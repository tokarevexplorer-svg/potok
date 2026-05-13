// Сессия 34 этапа 2 (пункт 17): мерджинг нескольких артефактов в один.
//
// На входе — массив путей в bucket'е team-database + инструкция Влада
// («объедини в один документ по порядку», «убери дубли», и т.д.). На выходе —
// новый артефакт, склееный через LLM. Расход пишется с purpose='merge'.

import { downloadFile, uploadFile } from "./teamStorage.js";
import { sendSystemRequest } from "./systemLLMService.js";

const BUCKET = "team-database";
const MERGE_FOLDER = "merges";

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

  // 2) Собираем промпт.
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

  // 3) Запрос + биллинг через Системную LLM (Сессия 49).
  let response;
  try {
    response = await sendSystemRequest({
      systemFunction: "merge",
      systemPrompt,
      userPrompt,
      maxTokens: 8192,
      taskId: targetTaskId,
    });
  } catch (err) {
    throw new Error(`LLM упал на объединении: ${err?.message ?? err}`);
  }

  // 4) Сохраняем результат как новый артефакт.
  const text = response?.text ?? "";
  const fileName = `merge_${nowSlug()}.md`;
  const targetPath = `${MERGE_FOLDER}/${fileName}`;
  const header = [
    `# Объединение ${sources.length} артефактов`,
    "",
    `_${new Date().toISOString()} · ${response.provider}/${response.model}_`,
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
    provider: response.provider,
    model: response.model,
    cost_usd: Number(response?.costUsd ?? 0),
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
