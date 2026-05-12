#!/usr/bin/env node
// Сессия 32: seed-запись инструмента Web Search в team_tools + загрузка
// методички tools/web-search.md в Storage.
//
// Идемпотентный:
//   * Если запись в team_tools уже есть — обновляет только обязательные
//     поля (manifest_path/description), оставляя status и connection_config
//     в текущем состоянии (чтобы не сбить настройки Влада).
//   * Методичку перезаписывает — это разумно, в seed-скрипте всегда
//     каноничный текст.

import "dotenv/config";
import { getServiceRoleClient } from "../src/services/team/teamSupabase.js";
import { uploadFile } from "../src/services/team/teamStorage.js";

const TOOL_ID = "web-search";
const TOOL_NAME = "Web Search";
const TOOL_DESC =
  "Поиск в интернете с возвратом результатов и URL. Используется агентами как источник свежих фактов и цитат.";
const MANIFEST_PATH = "tools/web-search.md";
const BUCKET = "team-prompts";

const MANIFEST_CONTENT = `# Web Search — методичка инструмента

## Что это
Поиск в интернете с возвратом результатов и URL. Используется агентами
как источник свежих фактов, цитат и контекста для последующих рассуждений.

Поддерживаются три провайдера, переключается в Админке → Инструменты:
* **Anthropic** (по умолчанию) — нативный tool-use в Messages API. Цитаты
  встроены в ответ модели, отдельные результаты возвращать не надо.
* **Tavily** — внешний REST API \`POST /search\`. Возвращает массив
  \`{title, url, content}\` (до 5 результатов).
* **Perplexity** — Chat Completions API (модель \`sonar\`). Возвращает
  готовый ответ + массив \`citations\` (URL).

## Возможности
* Свежие новости, события, статистика (что НЕ покрыто training cutoff).
* Уточнить факт: дата, имя, цифра, цитата, географическая привязка.
* Найти первоисточник или официальный документ по короткому намёку.

## Ограничения
* Не «исследовательский» инструмент — для глубокого ресёрча сначала
  NotebookLM с подобранными источниками, потом Web Search для
  доочистки.
* Не источник истины: каждый факт нужно сверять с цитатой по URL.
* Релевантность падает на узкоспециальных русскоязычных темах — иногда
  лучше явно добавить ключи «архив», «реферат», «диссертация».

## Как пользоваться правильно
1. Сформулируй конкретный вопрос (что именно ищем — факт, цитата, дата).
2. Если результатов больше, чем нужно — сразу отсей по доменам:
   .gov, .edu, .ru → крупные СМИ.
3. На каждый факт в финальном ответе — кратко цитируй источник и
   приводи URL.
4. Если по теме ничего не нашлось — лучше прямо это сказать, чем
   галлюцинировать. Замечание о пустом поиске — нормальный исход.

## Самопроверка после использования
- Все ли утверждения в ответе подтверждены URL?
- Нет ли «фактов», которых не было в результатах поиска?
- Использовались ли только результаты, которые реально соответствуют
  заданному вопросу (а не первое попавшееся)?
- Если поиск пуст — указано ли это явно в ответе?
`;

async function main() {
  const client = getServiceRoleClient();

  // 1. Upsert tool record.
  const { data: existing, error: getErr } = await client
    .from("team_tools")
    .select("*")
    .eq("id", TOOL_ID)
    .maybeSingle();
  if (getErr) throw new Error(`Не удалось проверить team_tools: ${getErr.message}`);

  if (existing) {
    // Обновляем только описание и manifest_path; status и connection_config
    // не трогаем — могут быть выставлены Владом.
    const { error: updErr } = await client
      .from("team_tools")
      .update({
        name: TOOL_NAME,
        description: TOOL_DESC,
        manifest_path: MANIFEST_PATH,
        tool_type: "executor",
        updated_at: new Date().toISOString(),
      })
      .eq("id", TOOL_ID);
    if (updErr) throw new Error(`Не удалось обновить team_tools: ${updErr.message}`);
    console.log(`= ${TOOL_ID}: запись существовала, обновлены name/description/manifest_path.`);
  } else {
    const { error: insErr } = await client.from("team_tools").insert({
      id: TOOL_ID,
      name: TOOL_NAME,
      description: TOOL_DESC,
      tool_type: "executor",
      manifest_path: MANIFEST_PATH,
      connection_config: { provider: "anthropic" },
      status: "active",
    });
    if (insErr) throw new Error(`Не удалось создать team_tools: ${insErr.message}`);
    console.log(`+ ${TOOL_ID}: создана запись (provider=anthropic, status=active).`);
  }

  // 2. Upload manifest. Перезапись всегда — это канонический текст.
  await uploadFile(BUCKET, MANIFEST_PATH, MANIFEST_CONTENT, "text/markdown; charset=utf-8");
  console.log(`+ ${BUCKET}/${MANIFEST_PATH}: методичка загружена (${MANIFEST_CONTENT.length} символов).`);

  console.log("\nГотово.");
}

main().catch((err) => {
  console.error("Ошибка:", err);
  process.exit(1);
});
