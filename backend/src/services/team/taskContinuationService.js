// Сессия 31 этапа 2 (пункт 17): продвижение многошаговых задач.
//
// Многошаговая задача — это та, что нуждается в нескольких отдельных
// LLM-вызовах (например, исследователь идёт по списку вопросов в NotebookLM,
// см. Сессию 38). step_state хранит прогресс между вызовами:
//
//   {
//     current_step: 0,          // 0-based индекс шага в работе
//     total_steps: 5,           // длина массива steps
//     steps: [
//       { question: "…", status: "pending"|"done", result?: "…" },
//       ...
//     ],
//     accumulated_results: [],  // массив { question, answer } для финального синтеза
//     notebook_id: null,        // опц. для интеграции с NotebookLM-воркером
//     synthesis_pending: false, // если true — все шаги пройдены, ждём финальный синтез
//     started_at: "ISO-датa"
//   }
//
// Сервис тонкий: инициализация state + продвижение указателя. Полноценный
// исполнитель NotebookLM-задач — отдельный воркер (Сессия 38).

const NOW_ISO = () => new Date().toISOString();

export function initMultistepTask(steps, options = {}) {
  const arr = Array.isArray(steps) ? steps : [];
  const normalized = arr
    .map((entry, idx) => {
      if (typeof entry === "string") return { question: entry.trim(), status: "pending" };
      if (entry && typeof entry === "object") {
        const q = typeof entry.question === "string" ? entry.question.trim() : "";
        if (!q) return null;
        return { question: q, status: entry.status === "done" ? "done" : "pending", ...entry };
      }
      return null;
    })
    .filter((e) => e && e.question);
  return {
    current_step: 0,
    total_steps: normalized.length,
    steps: normalized,
    accumulated_results: [],
    notebook_id: options.notebook_id ?? null,
    synthesis_pending: false,
    started_at: NOW_ISO(),
  };
}

// continueTask принимает текущий step_state и результат шага. Возвращает
// новое состояние + флаг completed (=true, если все шаги пройдены и нужен
// финальный синтез).
export function continueTask(stepState, stepResult) {
  if (!stepState || !Array.isArray(stepState.steps)) {
    throw new Error("continueTask: пустой step_state");
  }
  const idx = Number(stepState.current_step ?? 0);
  if (!Number.isInteger(idx) || idx < 0 || idx >= stepState.steps.length) {
    throw new Error(`continueTask: некорректный current_step=${idx}`);
  }
  const steps = stepState.steps.map((s, i) => {
    if (i !== idx) return s;
    return {
      ...s,
      status: "done",
      result: stepResult ?? null,
    };
  });
  const accumulated = Array.isArray(stepState.accumulated_results)
    ? [...stepState.accumulated_results]
    : [];
  accumulated.push({
    question: steps[idx].question,
    answer: stepResult ?? "",
  });
  const nextIdx = idx + 1;
  const completed = nextIdx >= steps.length;
  return {
    nextState: {
      ...stepState,
      current_step: nextIdx,
      steps,
      accumulated_results: accumulated,
      synthesis_pending: completed,
    },
    completed,
    currentResult: stepResult,
  };
}

// getProgress — короткое summary для UI (текущий шаг / всего, текущий вопрос).
export function getProgress(stepState) {
  if (!stepState) return null;
  const idx = Number(stepState.current_step ?? 0);
  const total = Number(stepState.total_steps ?? 0);
  const steps = Array.isArray(stepState.steps) ? stepState.steps : [];
  const currentQuestion = idx >= 0 && idx < steps.length ? steps[idx]?.question ?? null : null;
  return {
    current_step: idx,
    total_steps: total,
    current_question: currentQuestion,
    synthesis_pending: stepState.synthesis_pending === true,
  };
}
