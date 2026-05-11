// Ручной запуск триггеров автономности (Сессия 22 этапа 2, пункт 15).
//
// Использование:
//   npm run triggers:run                — запустить weekly для всех
//                                          eligible-агентов (autonomy_level=1).
//   npm run triggers:run -- --agent <id> — для конкретного агента.
//
// В Сессии 24 будет node-cron каждые 6/24 часа; сейчас — только ручной CLI.
// Скрипт проверяет глобальный тумблер autonomy_enabled_globally; если он
// false — выводит сообщение и выходит без вызовов LLM.

import "dotenv/config";
import {
  checkAutonomyEnabled,
  getEligibleAgents,
  runWeeklyReflection,
  runWeeklyReflectionForAll,
} from "../src/services/team/triggerService.js";
import { getAgent } from "../src/services/team/agentService.js";

function parseArgs(argv) {
  const out = { agent: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--agent" || a === "-a") out.agent = argv[++i] ?? null;
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function printUsageAndExit(code = 0) {
  console.log(
    [
      "Ручной запуск триггеров автономности.",
      "",
      "Использование:",
      "  npm run triggers:run",
      "  npm run triggers:run -- --agent <id>",
      "",
      "Глобальный тумблер autonomy_enabled_globally должен быть true.",
    ].join("\n"),
  );
  process.exit(code);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) printUsageAndExit(0);

  const enabled = await checkAutonomyEnabled();
  if (!enabled) {
    console.log(
      "[run-triggers] autonomy_enabled_globally = false — все триггеры спят.",
    );
    console.log(
      "[run-triggers] Включи переключатель в Админке (Сессия 23) или",
    );
    console.log(
      "[run-triggers] вручную: UPDATE team_settings SET value = 'true'::jsonb",
    );
    console.log("[run-triggers]              WHERE key = 'autonomy_enabled_globally';");
    return;
  }

  if (args.agent) {
    // Проверяем, что агент существует и eligible.
    const agent = await getAgent(args.agent).catch(() => null);
    if (!agent) {
      console.error(`[run-triggers] агент «${args.agent}» не найден.`);
      process.exit(1);
    }
    if ((agent.autonomy_level ?? 0) < 1) {
      console.error(
        `[run-triggers] у агента «${args.agent}» autonomy_level=${agent.autonomy_level ?? 0} — не запустится.`,
      );
      process.exit(1);
    }
    console.log(`[run-triggers] weekly_window для «${agent.display_name}»…`);
    const result = await runWeeklyReflection(args.agent, {
      note: "Еженедельное окно: оглянись на свою зону.",
    });
    console.log(`[run-triggers] результат: ${JSON.stringify(result, null, 2)}`);
    return;
  }

  const eligible = await getEligibleAgents();
  if (eligible.length === 0) {
    console.log("[run-triggers] Нет агентов с autonomy_level=1. Включи в карточке агента (Сессия 23).");
    return;
  }
  console.log(`[run-triggers] К обработке: ${eligible.length} агент(ов).`);

  const results = await runWeeklyReflectionForAll();
  for (const r of results) {
    console.log(`[${r.agentId}] ${r.result.phase}${r.result.reason ? ` (${r.result.reason})` : ""}`);
  }
  const proposals = results.filter((r) => r.result.phase === "proposal_created").length;
  const skipped = results.filter((r) => r.result.phase !== "proposal_created").length;
  console.log(`[run-triggers] Готово. Создано предложений: ${proposals}, пропущено: ${skipped}.`);
}

main().catch((err) => {
  console.error("[run-triggers] упало:", err);
  process.exit(1);
});
