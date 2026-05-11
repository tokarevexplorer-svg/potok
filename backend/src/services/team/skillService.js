// Сервис навыков агентов (Сессия 25 этапа 2, пункт 10).
//
// Навыки хранятся как markdown-файлы в Storage:
//   team-prompts/agent-skills/<agent_id>/<skill-slug>.md
//
// Каждый файл начинается с YAML-frontmatter:
//   ---
//   skill_name: "Короткое название"
//   created_at: 2026-05-12T10:00:00.000Z
//   last_used: null
//   use_count: 0
//   status: active  # active | pinned | archived
//   source_task_id: tsk_abc123  # опц., из какой задачи извлекли
//   ---
//
//   ## Когда применять
//   <текст>
//
//   ## Что делать
//   <текст>
//
//   ## Почему работает
//   <текст — НЕ идёт в промпт, только для Влада>
//
// loadSkills в promptBuilder уже умеет читать .md из этой папки. Здесь
// мы добавляем frontmatter-фильтрацию (только active+pinned идут в
// промпт) и CRUD-методы для UI карточки агента.
//
// Latin-only пути (как в Сессии 4, 9, 20) — Supabase Storage отбивает
// кириллицу в ключах.

import matter from "gray-matter";
import {
  downloadFile,
  listFiles,
  uploadFile,
  deleteFile,
} from "./teamStorage.js";

const BUCKET = "team-prompts";
const FOLDER = "agent-skills";

const VALID_STATUSES = new Set(["active", "pinned", "archived"]);

function assertAgentId(agentId) {
  if (!agentId || typeof agentId !== "string" || !agentId.trim()) {
    throw new Error("agentId обязателен и должен быть непустой строкой.");
  }
}

// Транслитерация для slug'ов файлов (как в taskHandlers.transliterate).
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
    out += CYRILLIC_MAP[ch.toLowerCase()] ?? ch;
  }
  return out;
}
function slugify(text, maxLen = 40) {
  let s = transliterate(text)
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9\s_-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  if (!s) s = "skill";
  return s.slice(0, maxLen).replace(/-+$/g, "") || "skill";
}

// =========================================================================
// Чтение
// =========================================================================

// Список slug'ов файлов в папке агента (без .md). Не качаем содержимое —
// дешёвый список для UI.
export async function listSkillFiles(agentId) {
  assertAgentId(agentId);
  const folder = `${FOLDER}/${agentId}`;
  let files;
  try {
    files = await listFiles(BUCKET, folder);
  } catch {
    return [];
  }
  return (files ?? [])
    .filter((f) => f && typeof f.name === "string" && f.name.toLowerCase().endsWith(".md"))
    .map((f) => f.name.replace(/\.md$/i, ""));
}

// Полная карточка навыка: frontmatter + body. Если файл не парсится или
// нет frontmatter — возвращает дефолтные значения.
async function readSkillFile(agentId, slug) {
  const path = `${FOLDER}/${agentId}/${slug}.md`;
  let raw;
  try {
    raw = await downloadFile(BUCKET, path);
  } catch {
    return null;
  }
  const { data, content } = matter(String(raw ?? ""));
  const sections = parseSections(content);
  return {
    slug,
    path,
    skill_name: typeof data?.skill_name === "string" ? data.skill_name : slug,
    status: VALID_STATUSES.has(data?.status) ? data.status : "active",
    use_count: Number.isInteger(data?.use_count) ? data.use_count : 0,
    last_used: data?.last_used ?? null,
    created_at: data?.created_at ?? null,
    source_task_id: data?.source_task_id ?? null,
    when_to_apply: sections.when_to_apply ?? "",
    what_to_do: sections.what_to_do ?? "",
    why_it_works: sections.why_it_works ?? "",
    raw_body: content,
  };
}

function parseSections(content) {
  // Простой парсер ## Заголовок → текст до следующего ## или конца.
  const sections = {};
  const re = /^##\s+(.+?)\s*$/gm;
  const headings = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    headings.push({ key: m[1].trim().toLowerCase(), idx: m.index, end: m.index + m[0].length });
  }
  for (let i = 0; i < headings.length; i++) {
    const h = headings[i];
    const next = headings[i + 1];
    const body = content.slice(h.end, next ? next.idx : content.length).trim();
    if (/когда\s+применять/i.test(h.key)) sections.when_to_apply = body;
    else if (/что\s+делать/i.test(h.key)) sections.what_to_do = body;
    else if (/почему\s+работает/i.test(h.key)) sections.why_it_works = body;
  }
  return sections;
}

// Все навыки агента — массив объектов. Фильтр по status опц.
export async function getSkillsForAgent(
  agentId,
  { statuses = ["active", "pinned"] } = {},
) {
  const slugs = await listSkillFiles(agentId);
  const cards = [];
  for (const slug of slugs) {
    const card = await readSkillFile(agentId, slug);
    if (!card) continue;
    if (statuses && !statuses.includes(card.status)) continue;
    cards.push(card);
  }
  return cards;
}

// Markdown-блок для подмешивания в слой Skills промпта (Сессия 25).
// Из карточки берём skill_name + when_to_apply + what_to_do. why_it_works
// не идёт в промпт — это для Влада.
export async function getSkillsContentForPrompt(agentId) {
  if (!agentId) return "";
  const skills = await getSkillsForAgent(agentId, {
    statuses: ["active", "pinned"],
  });
  if (skills.length === 0) return "";

  const lines = [];
  for (const s of skills) {
    lines.push(`### ${s.skill_name}`);
    if (s.when_to_apply) {
      lines.push("**Когда применять:**");
      lines.push(s.when_to_apply);
    }
    if (s.what_to_do) {
      lines.push("**Что делать:**");
      lines.push(s.what_to_do);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

// =========================================================================
// Запись
// =========================================================================

// Создание нового skill-файла. Возвращает { slug, path, ... }.
// Если файл с таким slug уже есть — перезаписывает. Чтобы не перезаписать
// случайно, caller может предварительно проверить listSkillFiles.
export async function createSkillFile(agentId, input) {
  assertAgentId(agentId);
  const skillName = String(input?.skill_name ?? "").trim();
  if (!skillName) throw new Error("skill_name обязателен.");
  const when = String(input?.when_to_apply ?? "").trim();
  const what = String(input?.what_to_do ?? "").trim();
  const why = String(input?.why_it_works ?? "").trim();
  if (!when || !what) {
    throw new Error("when_to_apply и what_to_do обязательны.");
  }

  const slug = slugify(skillName);
  const path = `${FOLDER}/${agentId}/${slug}.md`;
  const frontmatter = {
    skill_name: skillName,
    status: VALID_STATUSES.has(input?.status) ? input.status : "active",
    created_at: new Date().toISOString(),
    last_used: null,
    use_count: 0,
  };
  if (input?.task_id) frontmatter.source_task_id = String(input.task_id);

  const body = renderBody({ when_to_apply: when, what_to_do: what, why_it_works: why });
  const fileContent = matter.stringify(body, frontmatter);
  await uploadFile(BUCKET, path, fileContent);
  return readSkillFile(agentId, slug);
}

function renderBody({ when_to_apply, what_to_do, why_it_works }) {
  const parts = [];
  if (when_to_apply) {
    parts.push("## Когда применять");
    parts.push(when_to_apply);
  }
  if (what_to_do) {
    parts.push("## Что делать");
    parts.push(what_to_do);
  }
  if (why_it_works) {
    parts.push("## Почему работает");
    parts.push(why_it_works);
  }
  return parts.join("\n\n");
}

// Полная замена содержимого/frontmatter навыка. patch может содержать:
//   skill_name (переименование оставит slug — для миграции slug пользуйся
//                createSkillFile с новым именем + удали старый);
//   status (active|pinned|archived);
//   when_to_apply / what_to_do / why_it_works.
export async function updateSkillFile(agentId, slug, patch = {}) {
  const current = await readSkillFile(agentId, slug);
  if (!current) {
    throw new Error(`Навык «${slug}» не найден.`);
  }
  const next = {
    skill_name: patch.skill_name?.trim?.() || current.skill_name,
    when_to_apply: patch.when_to_apply ?? current.when_to_apply,
    what_to_do: patch.what_to_do ?? current.what_to_do,
    why_it_works: patch.why_it_works ?? current.why_it_works,
    status: VALID_STATUSES.has(patch.status) ? patch.status : current.status,
  };
  const frontmatter = {
    skill_name: next.skill_name,
    status: next.status,
    created_at: current.created_at ?? new Date().toISOString(),
    last_used: current.last_used,
    use_count: current.use_count,
  };
  if (current.source_task_id) frontmatter.source_task_id = current.source_task_id;
  const body = renderBody(next);
  const path = `${FOLDER}/${agentId}/${slug}.md`;
  await uploadFile(BUCKET, path, matter.stringify(body, frontmatter));
  return readSkillFile(agentId, slug);
}

// Мягкое архивирование: status='archived'. Файл остаётся в Storage.
export async function archiveSkill(agentId, slug) {
  return updateSkillFile(agentId, slug, { status: "archived" });
}

// Физическое удаление файла из Storage.
export async function deleteSkillFile(agentId, slug) {
  const path = `${FOLDER}/${agentId}/${slug}.md`;
  await deleteFile(BUCKET, path);
  return { ok: true, slug };
}

// Инкремент use_count + обновление last_used. Дёргается из taskRunner
// при успешном использовании skill (отдельно, по обратной связи или ручному
// сигналу — на текущем этапе ничего не дёргает).
export async function incrementSkillUsage(agentId, slug) {
  const current = await readSkillFile(agentId, slug);
  if (!current) return null;
  const frontmatter = {
    skill_name: current.skill_name,
    status: current.status,
    created_at: current.created_at ?? new Date().toISOString(),
    last_used: new Date().toISOString(),
    use_count: (current.use_count ?? 0) + 1,
  };
  if (current.source_task_id) frontmatter.source_task_id = current.source_task_id;
  const body = renderBody(current);
  const path = `${FOLDER}/${agentId}/${slug}.md`;
  await uploadFile(BUCKET, path, matter.stringify(body, frontmatter));
  return readSkillFile(agentId, slug);
}
