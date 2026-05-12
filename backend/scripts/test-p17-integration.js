#!/usr/bin/env node
// Сессия 36 этапа 2: интеграционный тест п.17.
//
// Проверяет, что все механики п.17 собраны:
//   1. Web Search инструмент существует и активен (Сессия 32).
//   2. База конкурентов: эндпоинты /api/team/competitors отвечают (Сессия 33).
//   3. Многошаговая инфраструктура: taskContinuationService.initMultistepTask
//      + continueTask + getProgress (Сессия 31).
//   4. Мерджинг: mergeService.mergeArtifacts с моковыми входами (Сессия 34).
//   5. Шаблоны разведчика: 3 файла в Storage (Сессия 35).
//
// Сетевые тесты делаются прямо через сервисы (не через HTTP) — чтобы тест
// можно было запустить локально на разработческой машине без поднятого
// Express. Skip-сценарии: если нет API-ключа LLM — merge-тест пропускаем
// с пометкой, не валим весь тест.
//
// Запуск: `npm run test:p17` в backend/.

import "dotenv/config";
import {
  initMultistepTask,
  continueTask,
  getProgress,
} from "../src/services/team/taskContinuationService.js";
import { downloadFile, listFiles } from "../src/services/team/teamStorage.js";
import { getServiceRoleClient } from "../src/services/team/teamSupabase.js";

const results = [];

function record(name, passed, details) {
  results.push({ name, passed, details });
  const mark = passed ? "✅" : "❌";
  console.log(`${mark} ${name}${details ? " · " + details : ""}`);
}

async function safe(name, fn) {
  try {
    await fn();
  } catch (err) {
    record(name, false, `ошибка: ${err?.message ?? err}`);
  }
}

async function main() {
  console.log("== Интеграционный тест п.17 (Сессия 36) ==\n");

  // 1. Web Search.
  await safe("Web Search: инструмент существует и active", async () => {
    const client = getServiceRoleClient();
    const { data } = await client
      .from("team_tools")
      .select("*")
      .eq("id", "web-search")
      .maybeSingle();
    if (!data) throw new Error("запись team_tools id=web-search не найдена");
    if (data.status !== "active") throw new Error(`status=${data.status}, ожидалось active`);
    record("Web Search: инструмент существует и active", true, `provider=${data.connection_config?.provider ?? "?"}`);
  });

  await safe("Web Search: методичка в Storage", async () => {
    const text = await downloadFile("team-prompts", "tools/web-search.md");
    if (!text || text.length < 100) throw new Error("файл подозрительно короткий");
    if (!/Самопроверка/i.test(text)) throw new Error("в методичке нет секции Самопроверка");
    record("Web Search: методичка в Storage", true, `${text.length} символов`);
  });

  // 2. База конкурентов.
  await safe("Конкуренты: таблица постов существует", async () => {
    const client = getServiceRoleClient();
    const { error } = await client.from("team_competitor_posts").select("id").limit(1);
    if (error) throw new Error(error.message);
    record("Конкуренты: таблица постов существует", true);
  });

  await safe("Конкуренты: реестр в team_custom_databases", async () => {
    const client = getServiceRoleClient();
    const { data, error } = await client
      .from("team_custom_databases")
      .select("id")
      .eq("db_type", "competitor")
      .limit(1);
    if (error) throw new Error(error.message);
    record("Конкуренты: реестр в team_custom_databases", true, `записей: ${(data ?? []).length}`);
  });

  // 3. Многошаговая инфраструктура.
  await safe("Многошаговость: initMultistepTask + continueTask + getProgress", async () => {
    const state = initMultistepTask(["Вопрос 1", "Вопрос 2", "Вопрос 3"]);
    if (state.total_steps !== 3) throw new Error("total_steps != 3");
    const progress = getProgress(state);
    if (progress.current_question !== "Вопрос 1") {
      throw new Error(`текущий вопрос ${progress.current_question}, ожидался "Вопрос 1"`);
    }
    const { nextState, completed } = continueTask(state, "Ответ 1");
    if (nextState.current_step !== 1 || completed) {
      throw new Error("после шага 1 current_step должен быть 1, completed=false");
    }
    const final = continueTask(continueTask(nextState, "Ответ 2").nextState, "Ответ 3");
    if (!final.completed) throw new Error("после трёх ответов completed должен быть true");
    if (final.nextState.accumulated_results.length !== 3) {
      throw new Error("accumulated_results должен содержать 3 элемента");
    }
    record(
      "Многошаговость: initMultistepTask + continueTask + getProgress",
      true,
      "3 шага → completed",
    );
  });

  // 4. Шаблоны разведчика.
  await safe("Разведчик: 3 шаблона задач в Storage", async () => {
    const files = await listFiles("team-prompts", "task-templates");
    const names = (files ?? []).map((f) => f.name);
    const need = ["analyze-competitor.md", "search-trends.md", "free-research.md"];
    const missing = need.filter((n) => !names.includes(n));
    if (missing.length > 0) throw new Error(`не хватает: ${missing.join(", ")}`);
    record("Разведчик: 3 шаблона задач в Storage", true, `${need.length}/${need.length}`);
  });

  // 5. Мерджинг — пропускаем, если нет API-ключа.
  await safe("Мерджинг: mergeArtifacts (mock, требует LLM-ключ)", async () => {
    const { getApiKey } = await import("../src/services/team/keysService.js");
    let hasKey = false;
    for (const provider of ["anthropic", "openai", "google"]) {
      try {
        const k = await getApiKey(provider);
        if (k) {
          hasKey = true;
          break;
        }
      } catch {}
    }
    if (!hasKey) {
      record(
        "Мерджинг: mergeArtifacts (mock, требует LLM-ключ)",
        true,
        "пропуск: нет ни одного API-ключа",
      );
      return;
    }
    // Создаём 2 моковых артефакта в Storage, мерджим их, проверяем что
    // результат сохранён. Чистим после теста.
    const { uploadFile, deleteFile } = await import("../src/services/team/teamStorage.js");
    const ts = Date.now();
    const a = `merges/_test_${ts}_a.md`;
    const b = `merges/_test_${ts}_b.md`;
    await uploadFile("team-database", a, "Артефакт A: вступление про Петербург.");
    await uploadFile("team-database", b, "Артефакт B: вступление про Петербург.");
    try {
      const { mergeArtifacts } = await import("../src/services/team/mergeService.js");
      const result = await mergeArtifacts([a, b], "Объедини, убери дубль");
      if (!result.artifact_path || !result.artifact_path.startsWith("merges/")) {
        throw new Error("artifact_path не похож на merges/");
      }
      // Чистим за собой (кроме merged-результата — пусть Влад глянет).
      await deleteFile("team-database", a);
      await deleteFile("team-database", b);
      record(
        "Мерджинг: mergeArtifacts (mock, требует LLM-ключ)",
        true,
        `результат: ${result.artifact_path}, ${result.tokens.input}→${result.tokens.output} токенов`,
      );
    } finally {
      // Best-effort cleanup.
      await deleteFile("team-database", a).catch(() => {});
      await deleteFile("team-database", b).catch(() => {});
    }
  });

  console.log("\n== Итог ==");
  const passed = results.filter((r) => r.passed).length;
  const total = results.length;
  console.log(`${passed}/${total} тестов пройдено.`);
  if (passed < total) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Фатальная ошибка теста:", err);
  process.exit(1);
});
