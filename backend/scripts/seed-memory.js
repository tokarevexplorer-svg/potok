// Seed-скрипт для ручного добавления правил в team_agent_memory
// (Сессия 8 этапа 2, этап 1 пункт 3).
//
// Использование:
//   npm run seed:memory -- --agent <agentId> --rule "<текст правила>"
//   npm run seed:memory -- --agent <agentId> --file <path-to-file>
//
// Файл с правилами — по одному правилу на строку. Пустые строки и строки,
// начинающиеся с `#` (комментарий), игнорируются. Правило может быть с
// маркером списка в начале (`- ` или `* `) — он снимается.
//
// Все правила пишутся с source = 'seed', status = 'active'.
//
// Идемпотентность: если у агента уже есть active-правило с точно таким же
// текстом — пропуск (через ensureRule в memoryService).
//
// Зависит только от SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY (через .env
// или окружение).

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { ensureRule } from "../src/services/team/memoryService.js";

function parseArgs(argv) {
  const args = { agent: null, rule: null, file: null, source: "seed" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--agent" || a === "-a") args.agent = argv[++i] ?? null;
    else if (a === "--rule" || a === "-r") args.rule = argv[++i] ?? null;
    else if (a === "--file" || a === "-f") args.file = argv[++i] ?? null;
    else if (a === "--source" || a === "-s") args.source = argv[++i] ?? "seed";
    else if (a === "--help" || a === "-h") args.help = true;
  }
  return args;
}

function printUsageAndExit(code = 0) {
  const lines = [
    "Использование:",
    '  npm run seed:memory -- --agent <agentId> --rule "<текст правила>"',
    "  npm run seed:memory -- --agent <agentId> --file <путь-к-файлу>",
    "",
    "Аргументы:",
    "  --agent, -a   ID агента (обязательно).",
    '  --rule,  -r   текст одного правила (в кавычках, если есть пробелы).',
    "  --file,  -f   файл с правилами по одному на строку.",
    '  --source, -s  значение source (по умолчанию "seed").',
    "",
    "Пример:",
    '  npm run seed:memory -- --agent test-agent --rule "Вступление не больше двух предложений"',
  ];
  console.log(lines.join("\n"));
  process.exit(code);
}

function readRulesFromFile(filePath) {
  const abs = path.resolve(filePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`Файл не найден: ${abs}`);
  }
  const raw = fs.readFileSync(abs, "utf-8");
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.replace(/^[-*]\s+/, "")) // снимем маркер списка
    .filter((l) => l.length > 0);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) printUsageAndExit(0);

  if (!args.agent) {
    console.error("Не указан --agent. Запусти с --help для справки.");
    process.exit(1);
  }
  if (!args.rule && !args.file) {
    console.error("Нужен либо --rule, либо --file. Запусти с --help для справки.");
    process.exit(1);
  }
  if (args.rule && args.file) {
    console.error("Укажи только что-то одно: --rule или --file.");
    process.exit(1);
  }

  let rules;
  if (args.rule) {
    rules = [args.rule.trim()];
  } else {
    rules = readRulesFromFile(args.file);
  }
  if (rules.length === 0) {
    console.log("[seed-memory] Нечего добавлять — список правил пуст.");
    return;
  }

  console.log(`[seed-memory] Агент: ${args.agent}. К добавлению: ${rules.length}.`);

  let created = 0;
  let skipped = 0;
  for (const text of rules) {
    try {
      const { rule, created: wasCreated } = await ensureRule({
        agentId: args.agent,
        content: text,
        source: args.source,
      });
      if (wasCreated) {
        created += 1;
        console.log(`  + добавлено: ${rule.id}  «${text}»`);
      } else {
        skipped += 1;
        console.log(`  · уже есть, пропуск: ${rule.id}  «${text}»`);
      }
    } catch (err) {
      console.error(`  ! ошибка для «${text}»: ${err?.message ?? err}`);
    }
  }

  console.log(`[seed-memory] Готово. Добавлено: ${created}, пропущено: ${skipped}.`);
}

main().catch((err) => {
  console.error("[seed-memory] упало:", err);
  process.exit(1);
});
