// Сессия 39+: пробинг ботов из telegram.txt — проверяем что токены валидны
// и заодно узнаём username/bot_id. Также читаем getWebhookInfo — вдруг
// какой-то webhook уже стоит и подскажет URL бэкенда.
//
// Запуск: node scripts/probe-telegram-bots.js

import "dotenv/config";

const TOKENS = [
  { kind: "system", label: "Поток Система", token: "8751224892:AAH_G7KdsmMvQz2g79FaZsK_rf_sHOwkyS8" },
  { kind: "agent", label: "Аналитик-разведчик", token: "8477393497:AAGwv80ZjsexxvNu5Jfx4tYWZXZQEuWMxW4" },
  { kind: "agent", label: "Шеф-редактор", token: "8601241060:AAFpM9QMVQaHGXB8cHyo9gX-Jrmjkikx_YE" },
  { kind: "agent", label: "Исследователь", token: "8621250848:AAHb2r5GLXvJJnUPnCTOZG8HGlQhaOjOqZc" },
  { kind: "agent", label: "Сценарист", token: "8622964602:AAEyOFOVVa5vyiGY_lUb4XRUWLvU16A43d4" },
];

async function call(token, method) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const resp = await fetch(url);
  const json = await resp.json().catch(() => ({}));
  return json;
}

for (const t of TOKENS) {
  const me = await call(t.token, "getMe");
  const wh = await call(t.token, "getWebhookInfo");
  if (!me.ok) {
    console.log(`[FAIL] ${t.label}: ${me.description}`);
    continue;
  }
  console.log(`\n${t.label} (${t.kind})`);
  console.log(`  id=${me.result.id}  @${me.result.username}  ${me.result.first_name}`);
  if (wh.ok) {
    console.log(`  webhook: ${wh.result.url || "(пусто)"}`);
    if (wh.result.last_error_message)
      console.log(`  last_error: ${wh.result.last_error_message}`);
  }
}
