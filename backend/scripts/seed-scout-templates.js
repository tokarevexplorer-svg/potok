#!/usr/bin/env node
// Сессия 35: загружает 3 шаблона задач разведчика в Storage.
//
// Шаблоны идемпотентные — каждый загружается через uploadFile, который
// перезаписывает существующий файл. Frontmatter (self_review_default,
// clarification_default) — в шапке каждого файла.

import "dotenv/config";
import { uploadFile } from "../src/services/team/teamStorage.js";

const BUCKET = "team-prompts";
const FOLDER = "task-templates";

const TEMPLATES = {
  "analyze-competitor.md": `---
self_review_default: true
clarification_default: false
---
## System

{{mission}}
{{role}}
{{goals}}
{{memory}}
{{skills}}

Ты — аналитик-разведчик команды. Анализируешь контент блогера-конкурента.
Если у тебя в инструментах есть Web Search — используй для дополнительного
контекста по тематике/нише блогера. На каждое утверждение — источник.

## User

Проанализируй блогера: {{competitor_name}}

Данные из базы конкурентов:
{{competitor_data}}

Подготовь структурированный обзор:

1. Ключевые форматы и рубрики.
2. Характерные приёмы (хуки, структура, монтаж, ритм).
3. Темы, которые заходят лучше всего (по лайкам и комментам).
4. Что можно адаптировать для нашего блога — конкретные приёмы, не «вообще
   делать как они».
5. Чего точно НЕ делаем (табу из Mission — проверь, не нарушает ли блогер их).

Формат: маркированные списки с короткими пояснениями. Не пересказывай посты —
выделяй паттерны.
`,
  "search-trends.md": `---
self_review_default: false
clarification_default: false
---
## System

{{mission}}
{{role}}
{{goals}}
{{memory}}
{{skills}}

Ты — аналитик-разведчик команды. Ищешь свежие тренды в нишах, близких
к нашему блогу. Используй Web Search как основной инструмент. Без поиска
не выдумывай — лучше признайся, что нашёл мало, чем галлюцинируй.

## User

Тематический фокус: {{focus}}

{{#if additional_context}}
Дополнительный контекст: {{additional_context}}
{{/if}}

Найди 5-10 актуальных трендов, форматов или тем за последние 1-2 месяца.

На каждый:
- **Что это** — краткое описание паттерна.
- **Источник** — URL (обязательно).
- **Почему интересно для нашего блога** — конкретное соответствие
  Mission/Goals.
- **Оценка применимости** — высокая / средняя / низкая.

Не включай тренды, которые не подкреплены конкретными URL.
`,
  "free-research.md": `---
self_review_default: false
clarification_default: true
---
## System

{{mission}}
{{role}}
{{goals}}
{{memory}}
{{skills}}

Ты — аналитик-разведчик команды. Выполняешь свободное исследование
по заданию Влада. Используй доступные инструменты (Web Search, NotebookLM,
доступные базы команды).

## User

{{user_input}}
`,
};

async function main() {
  let count = 0;
  for (const [filename, content] of Object.entries(TEMPLATES)) {
    const path = `${FOLDER}/${filename}`;
    await uploadFile(BUCKET, path, content, "text/markdown; charset=utf-8");
    console.log(`+ ${path} (${content.length} символов)`);
    count++;
  }
  console.log(`\nГотово. Загружено: ${count}.`);
}

main().catch((err) => {
  console.error("Ошибка:", err);
  process.exit(1);
});
