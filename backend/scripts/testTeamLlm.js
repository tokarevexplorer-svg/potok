// Тестовый скрипт для проверки сервисов команды (Сессия 2).
//
// Запуск (PowerShell, из backend/):
//   & "C:\Program Files\nodejs\node.exe" scripts/testTeamLlm.js
//
// Что делает:
//   1. Берёт ключ Anthropic из team_api_keys (через keysService).
//   2. Вызывает llmClient.call с тестовым промптом.
//   3. Печатает ответ модели и токены.
//   4. Считает стоимость через costTracker.calculateCost.
//   5. Записывает вызов в team_api_calls через costTracker.recordCall.
//
// До запуска:
//   - Применена миграция 0008_team_tables.sql (Сессия 1)
//   - В team_api_keys есть строка provider='anthropic' с валидным ключом
//   - В team-config bucket'е лежит pricing.json (для расчёта стоимости —
//     если нет, скрипт всё равно отработает, но cost будет 0)
//
// Ничего не трогает в продовой БД, кроме записи в team_api_calls — это
// журнал, и одна тестовая строка ему не повредит.

import { call as llmCall, LLMError } from "../src/services/team/llmClient.js";
import { calculateCost, recordCall } from "../src/services/team/costTracker.js";
import { getAllKeysStatus } from "../src/services/team/keysService.js";

// Можно переопределить через CLI: node scripts/testTeamLlm.js <provider> <model>
const provider = process.argv[2] ?? "anthropic";
const model = process.argv[3] ?? "claude-sonnet-4-5";

const PROMPT = "Скажи коротко (одно предложение): какой сегодня лучший способ начать день?";

async function main() {
  console.log(`[test] провайдер=${provider}, модель=${model}`);

  // Сначала проверим, что ключ вообще задан — выведем статус всех провайдеров,
  // чтобы Влад сразу видел, чего не хватает.
  const status = await getAllKeysStatus();
  console.log("[test] статус ключей:", status);
  if (!status[provider]) {
    console.error(
      `[test] ключ "${provider}" не задан в team_api_keys. ` +
        `Добавь его через Supabase Dashboard → Table Editor → team_api_keys.`,
    );
    process.exit(1);
  }

  console.log(`[test] делаю вызов LLM...`);
  let result;
  try {
    result = await llmCall({
      provider,
      model,
      systemPrompt: "Ты — помощник, отвечаешь по-русски, лаконично.",
      userPrompt: PROMPT,
      maxTokens: 256,
    });
  } catch (err) {
    if (err instanceof LLMError) {
      console.error(`[test] LLM ошибка: ${err.message}`);
    } else {
      console.error(`[test] неизвестная ошибка:`, err);
    }
    process.exit(1);
  }

  console.log("\n=== Ответ модели ===");
  console.log(result.text || "(пусто)");
  console.log("\n=== Токены ===");
  console.log(`input:  ${result.inputTokens}`);
  console.log(`output: ${result.outputTokens}`);
  console.log(`cached: ${result.cachedTokens}`);

  const cost = await calculateCost({
    provider,
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    cachedTokens: result.cachedTokens,
  });
  console.log(`\n=== Стоимость ===`);
  console.log(`$${cost.toFixed(6)} (если 0 — pricing.json для модели "${model}" не найден)`);

  // Запишем вызов в team_api_calls. taskId = null, потому что это разовый
  // тестовый вызов, не привязанный к задаче.
  const written = await recordCall({
    provider,
    model,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
    cachedTokens: result.cachedTokens,
    success: true,
  });
  if (written) {
    console.log(`\n[test] запись в team_api_calls создана (id=${written.id}).`);
  } else {
    console.warn(`\n[test] не удалось записать в team_api_calls (см. лог выше).`);
  }
}

main().catch((err) => {
  console.error("[test] неожиданная ошибка:", err);
  process.exit(1);
});
