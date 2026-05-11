// Одноразовая миграция структуры bucket'ов команды под Сессию 4 этапа 2.
//
// История: первая версия скрипта пыталась использовать кириллические имена
// в Storage (`Стратегия команды/Миссия.md`, `Шаблоны задач/...`). Supabase
// Storage отбивал такие ключи с ошибкой `Invalid key` — он не принимает
// пробелы и кириллицу в путях. Перевели целевые имена на латиницу со слэшем,
// человекочитаемые лейблы остались только в UI (см. InstructionsWorkspace).
//
// Что делает:
//
//   0. Чистит кириллические пути в bucket `team-prompts`, если они остались
//      от частично-успешных прогонов старой версии скрипта. Это страховка —
//      обычно их нет (старый скрипт падал до создания файлов), но лучше
//      перебдеть, чтобы не висели «фантомы» в Storage Dashboard.
//
//   1. Копирует из bucket `team-database` два файла:
//        context.md → bucket `team-prompts` / `strategy/mission.md`
//        concept.md → bucket `team-prompts` / `strategy/goals.md`
//      Метод Supabase Storage `copy()` не работает между bucket'ами — поэтому
//      используется пара `download()` + `upload()`. Оригиналы в `team-database`
//      НЕ удаляются — оставляем как backup, удалить руками через Supabase
//      Dashboard после ручной проверки прода (см. чеклист Сессии 4).
//
//   2. Внутри bucket'а `team-prompts` переносит пять файлов шаблонов из корня
//      в подпапку `task-templates/` (имена сохраняются — менять было нечего,
//      они и так на латинице):
//        ideas-questions.md       → task-templates/ideas-questions.md
//        ideas-free.md            → task-templates/ideas-free.md
//        research-direct.md       → task-templates/research-direct.md
//        write-text.md            → task-templates/write-text.md
//        edit-text-fragments.md   → task-templates/edit-text-fragments.md
//
// Идемпотентность: если файл уже на новом месте — шаг пропускается с логом,
// падать не должен. Это позволяет безопасно перезапускать скрипт несколько раз
// (например, после деплоя на Railway).
//
// Запуск:
//   cd backend && npm run migrate:instructions
//
// Зависит только от SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (тащит их из
// process.env через dotenv; на Railway эти переменные уже выставлены).

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "[migrate-instructions] не заданы SUPABASE_URL и/или SUPABASE_SERVICE_ROLE_KEY. " +
      "Положи их в backend/.env (см. .env.example) или передай через окружение.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const SOURCE_BUCKET = "team-database";
const PROMPTS_BUCKET = "team-prompts";

// Шаг 1: копирование context.md / concept.md → strategy/...
const STRATEGY_COPIES = [
  { from: "context.md", to: "strategy/mission.md" },
  { from: "concept.md", to: "strategy/goals.md" },
];

// Шаг 2: перенос пяти шаблонов из корня в подпапку task-templates/.
// Имена не меняются — они и так на латинице с дефисами.
const TEMPLATE_MOVES = [
  { from: "ideas-questions.md", to: "task-templates/ideas-questions.md" },
  { from: "ideas-free.md", to: "task-templates/ideas-free.md" },
  { from: "research-direct.md", to: "task-templates/research-direct.md" },
  { from: "write-text.md", to: "task-templates/write-text.md" },
  { from: "edit-text-fragments.md", to: "task-templates/edit-text-fragments.md" },
];

// Кириллические папки, которые могла создать старая версия скрипта. Шаг 0
// чистит их содержимое (если файлы есть) и оставляет bucket в чистом виде.
const LEGACY_CYRILLIC_FOLDERS = ["Стратегия команды", "Шаблоны задач"];

// Проверка существования файла. Возвращает true/false без бросания ошибок.
// Supabase Storage не имеет HEAD-метода — используем download() и ловим ошибку.
async function fileExists(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) return false;
  return !!data;
}

// Step 0. Чистим кириллические пути в team-prompts, если остались.
async function cleanupLegacyCyrillic() {
  let removed = 0;
  for (const folder of LEGACY_CYRILLIC_FOLDERS) {
    const { data, error } = await supabase.storage
      .from(PROMPTS_BUCKET)
      .list(folder, { limit: 1000 });
    if (error) {
      // Папки с таким именем нет — нормальная ситуация, идём дальше.
      continue;
    }
    const names = (data ?? [])
      .map((row) => row?.name)
      .filter((name) => typeof name === "string" && name.length > 0);
    if (names.length === 0) continue;

    const paths = names.map((name) => `${folder}/${name}`);
    const { error: rmErr } = await supabase.storage
      .from(PROMPTS_BUCKET)
      .remove(paths);
    if (rmErr) {
      console.warn(
        `[step 0] Не удалось удалить кириллические файлы из "${folder}": ${rmErr.message}`,
      );
      continue;
    }
    for (const p of paths) {
      console.log(`[step 0] Удалён legacy-файл: ${p}`);
      removed += 1;
    }
  }
  if (removed === 0) {
    console.log("[step 0] Кириллических файлов не найдено — чистить нечего.");
  } else {
    console.log(`[step 0] Готово: удалено ${removed} legacy-файлов.`);
  }
  return { removed };
}

// Step 1. Копируем context.md / concept.md из team-database в team-prompts
// под латинские имена в strategy/.
async function copyStrategyFiles() {
  let moved = 0;
  let skipped = 0;

  for (const { from, to } of STRATEGY_COPIES) {
    const alreadyThere = await fileExists(PROMPTS_BUCKET, to);
    if (alreadyThere) {
      console.log(`[step 1] Файл уже на новом месте, пропуск: ${to}`);
      skipped += 1;
      continue;
    }

    // Скачиваем исходник из team-database.
    const { data: blob, error: downErr } = await supabase.storage
      .from(SOURCE_BUCKET)
      .download(from);
    if (downErr || !blob) {
      console.warn(
        `[step 1] Не удалось скачать ${SOURCE_BUCKET}/${from}: ${downErr?.message ?? "пусто"} — пропуск.`,
      );
      continue;
    }
    const buffer = Buffer.from(await blob.arrayBuffer());

    const { error: upErr } = await supabase.storage
      .from(PROMPTS_BUCKET)
      .upload(to, buffer, { contentType: "text/markdown", upsert: false });
    if (upErr) {
      console.error(`[step 1] Не удалось загрузить ${PROMPTS_BUCKET}/${to}: ${upErr.message}`);
      continue;
    }

    console.log(`[step 1] Скопирован ${from} → ${to}`);
    moved += 1;
  }

  console.log(`[step 1] Готово: скопировано ${moved}, пропущено ${skipped}.`);
  return { moved, skipped };
}

// Step 2. Перемещаем пять шаблонов в подпапку `task-templates/` —
// имена не меняются. move() работает в пределах одного bucket'а.
async function moveTemplateFiles() {
  let moved = 0;
  let skipped = 0;

  for (const { from, to } of TEMPLATE_MOVES) {
    const alreadyThere = await fileExists(PROMPTS_BUCKET, to);
    if (alreadyThere) {
      console.log(`[step 2] Файл уже на новом месте, пропуск: ${to}`);
      skipped += 1;
      continue;
    }

    const oldExists = await fileExists(PROMPTS_BUCKET, from);
    if (!oldExists) {
      console.warn(
        `[step 2] Исходный файл не найден: ${PROMPTS_BUCKET}/${from} — пропуск.`,
      );
      continue;
    }

    const { error: moveErr } = await supabase.storage
      .from(PROMPTS_BUCKET)
      .move(from, to);
    if (moveErr) {
      console.error(
        `[step 2] Не удалось переместить ${from} → ${to}: ${moveErr.message}`,
      );
      continue;
    }

    console.log(`[step 2] Перемещён ${from} → ${to}`);
    moved += 1;
  }

  console.log(`[step 2] Готово: перемещено ${moved}, пропущено ${skipped}.`);
  return { moved, skipped };
}

async function main() {
  console.log("[migrate-instructions] старт миграции структуры team-prompts.");
  const step0 = await cleanupLegacyCyrillic();
  const step1 = await copyStrategyFiles();
  const step2 = await moveTemplateFiles();
  const total = step1.moved + step1.skipped + step2.moved + step2.skipped;
  console.log(
    `[migrate-instructions] Готово: всего обработано ${total} файлов ` +
      `(перенесено ${step1.moved + step2.moved}, пропущено ${step1.skipped + step2.skipped}, ` +
      `legacy-удалено ${step0.removed}). ` +
      "Оригиналы context.md / concept.md остаются в bucket team-database как backup — " +
      "удалить руками через Supabase Dashboard после ручной проверки прода.",
  );
}

main().catch((err) => {
  console.error("[migrate-instructions] упало:", err);
  process.exit(1);
});
