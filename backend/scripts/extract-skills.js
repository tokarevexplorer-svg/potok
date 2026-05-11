// Ручной запуск batch skill extraction (Сессия 26 этапа 2, пункт 10).
//
// Использование:
//   npm run extract:skills                — для всех активных агентов.
//   npm run extract:skills -- --agent <id> — только для одного агента.
//   npm run extract:skills -- --dry-run    — показать кандидатов без LLM-вызовов
//                                            (только подсчёт «сколько было бы»).
//
// Batch-вариант берёт задачи со score = threshold - 1 (порог из
// team_settings.skill_extraction_threshold). Это «околопороговые» задачи,
// которые тоже могут содержать полезные паттерны, но дёргать LLM на них
// при каждой оценке слишком дорого — выгребаем оптом.

import "dotenv/config";
import {
  processBatchSkillExtraction,
  getSkillThreshold,
} from "../src/services/team/skillExtractorService.js";
import { listAgents, getAgent } from "../src/services/team/agentService.js";

function parseArgs(argv) {
  const out = { agent: null, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--agent" || a === "-a") out.agent = argv[++i] ?? null;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function printUsageAndExit(code = 0) {
  console.log(
    [
      "Batch skill extraction для околопороговых задач (score = threshold - 1).",
      "",
      "Использование:",
      "  npm run extract:skills",
      "  npm run extract:skills -- --agent <id>",
      "  npm run extract:skills -- --dry-run",
    ].join("\n"),
  );
  process.exit(code);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) printUsageAndExit(0);

  const threshold = await getSkillThreshold();
  const batchScore = Math.max(0, threshold - 1);
  console.log(
    `[extract-skills] порог threshold=${threshold}, batch обрабатывает score=${batchScore}.`,
  );
  if (args.dryRun) {
    console.log("[extract-skills] DRY-RUN: LLM не дёргается, только подсчёт.");
  }

  let agents;
  if (args.agent) {
    const one = await getAgent(args.agent).catch(() => null);
    if (!one) {
      console.error(`[extract-skills] агент «${args.agent}» не найден.`);
      process.exit(1);
    }
    agents = [one];
  } else {
    agents = await listAgents({ status: "active" });
  }

  if (agents.length === 0) {
    console.log("[extract-skills] Нет агентов для обработки.");
    return;
  }

  let totalProcessed = 0;
  let totalCreated = 0;
  for (const agent of agents) {
    try {
      const r = await processBatchSkillExtraction(agent.id, { dryRun: args.dryRun });
      totalProcessed += r.processed;
      totalCreated += r.created;
      console.log(
        `[${agent.id}] processed=${r.processed}, created=${r.created} (batchScore=${r.batchScore})`,
      );
    } catch (err) {
      console.error(`[${agent.id}] упало: ${err?.message ?? err}`);
    }
  }
  console.log(
    `[extract-skills] Готово. Всего обработано задач: ${totalProcessed}, создано кандидатов: ${totalCreated}.`,
  );
}

main().catch((err) => {
  console.error("[extract-skills] упало:", err);
  process.exit(1);
});
