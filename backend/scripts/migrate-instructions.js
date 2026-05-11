// Одноразовая миграция структуры bucket'ов команды под Сессию 4 этапа 2.
//
// Что делает:
//
//   1. Копирует из bucket `team-database` два файла:
//        context.md → bucket `team-prompts` / `Стратегия команды/Миссия.md`
//        concept.md → bucket `team-prompts` / `Стратегия команды/Цели на период.md`
//      Метод Supabase Storage `copy()` не работает между bucket'ами — поэтому
//      используется пара `download()` + `upload()`. Оригиналы в `team-database`
//      НЕ удаляются — оставляем как backup, удалить руками через Supabase
//      Dashboard после ручной проверки прода (см. чеклист Сессии 4).
//
//   2. Внутри bucket'а `team-prompts` переименовывает пять файлов шаблонов в
//      человекочитаемые имена и переносит их в подпапку `Шаблоны задач/`:
//        ideas-questions.md       → Шаблоны задач/Идеи и вопросы для исследования.md
//        ideas-free.md            → Шаблоны задач/Свободные идеи.md
//        research-direct.md       → Шаблоны задач/Прямое исследование.md
//        write-text.md            → Шаблоны задач/Написание текста.md
//        edit-text-fragments.md   → Шаблоны задач/Правка фрагментов.md
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

// Шаг 1: копирование context.md / concept.md → Стратегия команды/...
const STRATEGY_COPIES = [
  { from: "context.md", to: "Стратегия команды/Миссия.md" },
  { from: "concept.md", to: "Стратегия команды/Цели на период.md" },
];

// Шаг 2: переименование пяти шаблонов внутри team-prompts.
const TEMPLATE_MOVES = [
  { from: "ideas-questions.md", to: "Шаблоны задач/Идеи и вопросы для исследования.md" },
  { from: "ideas-free.md", to: "Шаблоны задач/Свободные идеи.md" },
  { from: "research-direct.md", to: "Шаблоны задач/Прямое исследование.md" },
  { from: "write-text.md", to: "Шаблоны задач/Написание текста.md" },
  { from: "edit-text-fragments.md", to: "Шаблоны задач/Правка фрагментов.md" },
];

// Проверка существования файла. Возвращает true/false без бросания ошибок.
// Supabase Storage не имеет HEAD-метода — используем download() и ловим ошибку.
async function fileExists(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) return false;
  return !!data;
}

// Step 1. Копируем context.md / concept.md из team-database в team-prompts
// под человекочитаемые имена в Стратегии команды/.
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

// Step 2. Перемещаем пять шаблонов в подпапку «Шаблоны задач/» с
// человекочитаемыми именами. Используем move() — он работает в пределах одного
// bucket'а и сохраняет атрибуты.
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

    console.log(`[step 2] Переименован ${from} → ${to}`);
    moved += 1;
  }

  console.log(`[step 2] Готово: перемещено ${moved}, пропущено ${skipped}.`);
  return { moved, skipped };
}

async function main() {
  console.log("[migrate-instructions] старт миграции структуры team-prompts.");
  const step1 = await copyStrategyFiles();
  const step2 = await moveTemplateFiles();
  const total = step1.moved + step1.skipped + step2.moved + step2.skipped;
  console.log(
    `[migrate-instructions] Готово: всего обработано ${total} файлов ` +
      `(перенесено ${step1.moved + step2.moved}, пропущено ${step1.skipped + step2.skipped}). ` +
      "Оригиналы context.md / concept.md остаются в bucket team-database как backup — " +
      "удалить руками через Supabase Dashboard после ручной проверки прода.",
  );
}

main().catch((err) => {
  console.error("[migrate-instructions] упало:", err);
  process.exit(1);
});
