#!/usr/bin/env node
// Сессия 29: добавляет YAML-frontmatter `self_review_default: <bool>` в пять
// шаблонов задач (team-prompts/task-templates/<slug>.md).
//
// Маппинг по умолчанию (из ТЗ Сессии 29):
//   write-text          → true   (полноценный текст — есть что проверять)
//   edit-text-fragments → true   (правки требуют сверки с инструкциями)
//   ideas-free          → false  (короткие идеи — self-review шумит)
//   ideas-questions     → false  (генерация вопросов — без чек-листа)
//   research-direct     → false  (фактура с источника — без чек-листа)
//
// Скрипт идемпотентный:
//   * Если frontmatter уже есть и поле self_review_default задано — не трогает.
//   * Если frontmatter есть, но поля нет — добавляет поле.
//   * Если frontmatter нет — оборачивает файл `--- ... ---`.
//
// Запуск: `npm run apply:self-review-defaults` в backend/.
//   Требует SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY в env.

import "dotenv/config";
import matter from "gray-matter";
import { downloadFile, uploadFile } from "../src/services/team/teamStorage.js";

const BUCKET = "team-prompts";
const FOLDER = "task-templates";

const DEFAULTS = {
  "write-text.md": true,
  "edit-text-fragments.md": true,
  "ideas-free.md": false,
  "ideas-questions.md": false,
  "research-direct.md": false,
};

async function main() {
  let touched = 0;
  let skipped = 0;
  for (const [filename, defaultValue] of Object.entries(DEFAULTS)) {
    const path = `${FOLDER}/${filename}`;
    let raw;
    try {
      raw = await downloadFile(BUCKET, path);
    } catch (err) {
      console.warn(`! ${path} — не нашёлся в Storage, пропуск (${err.message ?? err})`);
      continue;
    }

    const parsed = matter(raw);
    if (
      parsed.data &&
      typeof parsed.data === "object" &&
      Object.prototype.hasOwnProperty.call(parsed.data, "self_review_default")
    ) {
      console.log(`= ${filename}: self_review_default уже задан (${parsed.data.self_review_default}) — пропуск`);
      skipped++;
      continue;
    }

    const newData = { ...(parsed.data ?? {}), self_review_default: defaultValue };
    const next = matter.stringify(parsed.content, newData);
    await uploadFile(BUCKET, path, next, "text/markdown; charset=utf-8");
    console.log(`+ ${filename}: добавлено self_review_default: ${defaultValue}`);
    touched++;
  }

  console.log(`\nГотово. Обновлено: ${touched}, пропущено: ${skipped}.`);
}

main().catch((err) => {
  console.error("Ошибка:", err);
  process.exit(1);
});
