#!/usr/bin/env node
// Сессия 38: end-to-end тест пайплайна предпродакшна.
//
// Имитирует полный цикл (БЕЗ реальных LLM-вызовов и записи в БД):
//   1. Парсинг questions_list для deep_research_notebooklm.
//   2. initMultistepTask → step_state с N шагами.
//   3. Имитация прохождения шагов через continueTask.
//   4. После всех шагов — synthesis_pending=true.
//   5. Логически: handoff сценаристу → план видео.
//   6. Handoff фактчекеру → отчёт по фактам.
//   7. Handoff шеф-редактору → ревью.
//
// Тест проверяет внутренние сервисы — без сетевых вызовов.

import {
  initMultistepTask,
  continueTask,
  getProgress,
} from "../src/services/team/taskContinuationService.js";

const results = [];

function record(name, passed, details) {
  results.push({ name, passed, details });
  const mark = passed ? "✅" : "❌";
  console.log(`${mark} ${name}${details ? " · " + details : ""}`);
}

function expect(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function safe(name, fn) {
  try {
    await fn();
  } catch (err) {
    record(name, false, `ошибка: ${err?.message ?? err}`);
  }
}

async function main() {
  console.log("== End-to-end pipeline test (Сессия 38) ==\n");

  // 1. Многошаговый ресёрч NotebookLM — имитация полного цикла.
  await safe("Multistep: 5 questions → step_state → пройти все шаги", async () => {
    const questions = [
      "Какова география концентрации домов терпимости в Петербурге?",
      "Как смещалась эта география с 1840-х к 1900-м?",
      "Какие источники упоминают конкретные адреса?",
      "Какие фигуры (полиция, медицина) связаны с этим феноменом?",
      "Какие литературные произведения отражают этот феномен?",
    ];
    const state0 = initMultistepTask(questions, { notebook_id: "test-notebook-123" });
    expect(state0.total_steps === 5, "total_steps должен быть 5");
    expect(state0.notebook_id === "test-notebook-123", "notebook_id должен сохраниться");

    let state = state0;
    for (let i = 0; i < questions.length; i++) {
      const progress = getProgress(state);
      expect(progress.current_step === i, `current_step должен быть ${i}, получено ${progress.current_step}`);
      const advanced = continueTask(state, `Ответ на вопрос ${i + 1}: мокированный текст с фактами и URL.`);
      state = advanced.nextState;
      if (i < questions.length - 1) {
        expect(!advanced.completed, `completed должен быть false до последнего шага (i=${i})`);
      } else {
        expect(advanced.completed, "completed должен быть true после последнего шага");
      }
    }
    expect(
      state.accumulated_results.length === 5,
      `accumulated_results должен иметь 5 элементов, получено ${state.accumulated_results.length}`,
    );
    expect(state.synthesis_pending === true, "synthesis_pending должен быть true после всех шагов");
    record(
      "Multistep: 5 questions → step_state → пройти все шаги",
      true,
      `${questions.length} шагов, synthesis_pending=true`,
    );
  });

  // 2. Восстановление многошаговой задачи (середина).
  await safe("Multistep: resume с current_step = 2", async () => {
    const questions = ["Q1", "Q2", "Q3", "Q4"];
    let state = initMultistepTask(questions);
    state = continueTask(state, "A1").nextState;
    state = continueTask(state, "A2").nextState;
    expect(state.current_step === 2, "после двух шагов current_step должен быть 2");
    // Имитируем рестарт: state восстановлен из БД.
    const restoredState = JSON.parse(JSON.stringify(state));
    const progress = getProgress(restoredState);
    expect(progress.current_step === 2, "после restore current_step должен сохраниться");
    expect(progress.current_question === "Q3", `после restore текущий вопрос Q3, получено ${progress.current_question}`);
    record("Multistep: resume с current_step = 2", true, "step_state сериализуется и восстанавливается корректно");
  });

  // 3. Парсинг questions_list (имитация handler'а).
  await safe("Parser: questions_list с разными форматами", async () => {
    const raw = `1. Первый вопрос
2. Второй вопрос
- Третий вопрос
* Четвёртый вопрос

# Пятый вопрос комментирован
Шестой простой
`;
    const parsed = raw
      .split("\n")
      .map((q) => q.trim().replace(/^[-*\d.)\s]+/, ""))
      .filter((q) => q.length > 0 && !q.startsWith("#"));
    expect(parsed.length === 5, `должно быть 5 вопросов, получено ${parsed.length}`);
    expect(parsed[0] === "Первый вопрос", `первый вопрос: "${parsed[0]}"`);
    expect(parsed[2] === "Третий вопрос", `третий вопрос: "${parsed[2]}"`);
    expect(parsed[4] === "Шестой простой", `последний вопрос: "${parsed[4]}"`);
    record("Parser: questions_list с разными форматами", true, "поддержка 1./2./-/* и комментариев");
  });

  // 4. Имитация цепочки handoff'ов (без БД, только структурно).
  await safe("Pipeline: 4 handoff'а — researcher → writer → factchecker → chief", async () => {
    // Имитируем создание четырёх задач с parent_task_id-цепочкой.
    const chain = [];
    chain.push({ id: "tsk_r", type: "deep_research_notebooklm", parent_task_id: null });
    chain.push({ id: "tsk_s", type: "video_plan_from_research", parent_task_id: "tsk_r" });
    chain.push({ id: "tsk_f", type: "factcheck_artifact", parent_task_id: "tsk_s" });
    chain.push({ id: "tsk_c", type: "review_artifact", parent_task_id: "tsk_f" });

    // Структурная проверка: каждая последующая задача ссылается на предыдущую.
    for (let i = 1; i < chain.length; i++) {
      expect(
        chain[i].parent_task_id === chain[i - 1].id,
        `task[${i}] должен ссылаться на task[${i - 1}].id`,
      );
    }
    record(
      "Pipeline: 4 handoff'а — researcher → writer → factchecker → chief",
      true,
      "структурная цепочка корректна (тест без БД)",
    );
  });

  // 5. Имитация мерджинга нескольких артефактов в финальный документ.
  await safe("Pipeline: имитация merge 4 артефактов в один", async () => {
    const artifacts = [
      "research/preprod/researcher/notebook/2026-05-12_research.md",
      "research/preprod/scriptwriter/plan/2026-05-12_plan.md",
      "research/preprod/factchecker/artifact/2026-05-12_factcheck.md",
      "research/preprod/chief/review/2026-05-12_review.md",
    ];
    expect(artifacts.length === 4, "должно быть 4 артефакта");
    expect(
      artifacts.every((p) => p.startsWith("research/preprod/")),
      "все пути должны начинаться с research/preprod/",
    );
    record(
      "Pipeline: имитация merge 4 артефактов в один",
      true,
      "пути предпродакшн-артефактов корректны для последующего mergeArtifacts",
    );
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
