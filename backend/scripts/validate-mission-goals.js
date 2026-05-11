// Валидатор структуры Mission и Goals (Сессия 7 этапа 2).
//
// Проверяет, что в bucket `team-prompts` лежат:
//   - strategy/mission.md с 5 секциями: Концепция, North Star,
//     Целевая аудитория, Табу, Ценности.
//   - strategy/goals.md  с 4 секциями: Фокус на период, Текущая точка,
//     Рубрики в работе, KPI на период.
//
// Для каждой секции выводит статус:
//   ✅  найдена и наполнена реальным текстом;
//   ⚠️  найдена, но содержимое — placeholder ([в скобках] / `tba` / пусто);
//   ❌  заголовок отсутствует.
//
// Скрипт идемпотентный, ничего не модифицирует — только читает Storage.
//
// Запуск:
//   cd backend && npm run validate:mission-goals
//
// Используется:
//   - после Сессии 7 — убедиться, что обязательные секции на месте;
//   - после ручного редактирования Влада в UI «Инструкции» — проверить, что
//     не сбилась структура заголовков.

import "dotenv/config";
import { downloadFile } from "../src/services/team/teamStorage.js";
import {
  analyzeMission,
  analyzeGoals,
} from "../src/services/team/promptBuilder.js";

const PROMPTS_BUCKET = "team-prompts";
const MISSION_PATH = "strategy/mission.md";
const GOALS_PATH = "strategy/goals.md";

// Лейблы для отображения. Ключи совпадают с MISSION_SECTIONS / GOALS_SECTIONS
// в promptBuilder.js — не меняем независимо, иначе разъедется.
const MISSION_LABELS = {
  concept: "Концепция",
  northStar: "North Star",
  audience: "Целевая аудитория",
  taboo: "Табу",
  values: "Ценности",
};

const GOALS_LABELS = {
  focus: "Фокус на период",
  currentPoint: "Текущая точка",
  rubrics: "Рубрики в работе",
  kpi: "KPI на период",
};

function statusIcon(status) {
  if (status === "filled") return "✅";
  if (status === "empty") return "⚠️";
  return "❌";
}

async function loadOrEmpty(path) {
  try {
    return await downloadFile(PROMPTS_BUCKET, path);
  } catch {
    return "";
  }
}

function printReport(title, path, labels, analysis) {
  console.log(`${title} (${PROMPTS_BUCKET}/${path})`);
  for (const [key, label] of Object.entries(labels)) {
    const status = analysis.details[key];
    console.log(`  ${statusIcon(status)}  ${label}`);
  }
  const emptyCount = Object.values(analysis.details).filter(
    (s) => s === "empty",
  ).length;
  const missingCount = Object.values(analysis.details).filter(
    (s) => s === "missing",
  ).length;

  const parts = [`${analysis.filled}/${analysis.total} секций заполнены`];
  if (emptyCount > 0) parts.push(`${emptyCount} с placeholder`);
  if (missingCount > 0) parts.push(`${missingCount} отсутствуют`);
  console.log(`  → ${title}: ${parts.join(", ")}.`);
}

async function main() {
  const [missionText, goalsText] = await Promise.all([
    loadOrEmpty(MISSION_PATH),
    loadOrEmpty(GOALS_PATH),
  ]);

  const missionAnalysis = analyzeMission(missionText);
  const goalsAnalysis = analyzeGoals(goalsText);

  console.log("[validate:mission-goals] проверка структуры Mission и Goals.\n");
  printReport("Mission", MISSION_PATH, MISSION_LABELS, missionAnalysis);
  console.log("");
  printReport("Goals", GOALS_PATH, GOALS_LABELS, goalsAnalysis);
  console.log("");

  const allFilled =
    missionAnalysis.filled === missionAnalysis.total &&
    goalsAnalysis.filled === goalsAnalysis.total;
  if (allFilled) {
    console.log(
      "Итог: ✅ Mission и Goals полностью заполнены. Готово к работе агентов.",
    );
    process.exit(0);
  } else {
    console.log(
      "Итог: ⚠️ есть секции без реального содержимого. Открой " +
        "/blog/team/instructions/ и заполни их через UI.",
    );
    process.exit(0); // 0 — это не ошибка, а нормальное состояние «надо доработать».
  }
}

main().catch((err) => {
  console.error("[validate:mission-goals] упало:", err);
  process.exit(1);
});
