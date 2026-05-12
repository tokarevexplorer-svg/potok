// Сессия 39+: разовая настройка Telegram из telegram.txt.
//
// Делает:
//   1. Чистит trailing space в team_settings.telegram_chat_id.
//   2. Создаёт недостающих агентов первой волны (Шеф-редактор, Исследователь,
//      Сценарист) если их ещё нет в БД. Игоря-разведчика оставляет.
//   3. Привязывает 4 агентских бота к соответствующим агентам через
//      telegramService.bindAgentBot (внутри он сам дёрнет getMe).
//
// Идемпотентный: повторный запуск ничего не ломает.
//
// Запуск: cd backend && node scripts/setup-telegram.js

import "dotenv/config";
import { getServiceRoleClient } from "../src/services/team/teamSupabase.js";
import { createAgent, getAgent } from "../src/services/team/agentService.js";
import {
  bindAgentBot,
  clearTelegramSettingsCache,
  getAgentBot,
  updateTelegramSettings,
} from "../src/services/team/telegramService.js";

const AGENTS_TO_ENSURE = [
  {
    id: "igor",
    display_name: "Игорь",
    role_title: "Аналитик-разведчик",
    department: "analytics",
    biography:
      "Мониторит конкурентов, ищет тренды, разведывает приёмы и форматы. Сухой и точный, не оценивает — фиксирует.",
    purpose:
      "Регулярно сканировать инфополе: новые блогеры, форматы, темы. Никто другой в команде эту работу не делает.",
    success_criteria:
      "Через 2 недели — 2-3 содержательных отчёта о конкурентах и/или подборки трендов, которые попадают в наши рубрики.",
    autonomy_level: 1,
  },
  {
    id: "chief-editor",
    display_name: "Шеф-редактор",
    role_title: "Шеф-редактор",
    department: "preproduction",
    biography:
      "Генерирует идеи видео, оркеструет работу команды, ревьюит артефакты. Самая дорогая модель — на нём решения.",
    purpose:
      "Точка верхнего уровня: декомпозиция плана, ревью артефактов, генерация идей. Не дублирует исследователя, сценариста и фактчекера — он над ними.",
    success_criteria:
      "Через 2 недели — 2-3 утверждённые идеи видео из проработки, плюс ревью артефактов предпродакшна с конкретными замечаниями.",
  },
  {
    id: "researcher",
    display_name: "Исследователь",
    role_title: "Исследователь",
    department: "preproduction",
    biography:
      "Глубоко копает источники через NotebookLM и Web Search. Структурированные ответы с цитатами и URL.",
    purpose:
      "Никто другой не работает с источниками так глубоко. Конкретные вопросы → конкретные ответы с привязкой к источнику.",
    success_criteria:
      "Через 2 недели — 3-5 артефактов исследования, каждый с цитатами/URL, который Влад использовал для сценария.",
  },
  {
    id: "scriptwriter",
    display_name: "Сценарист",
    role_title: "Сценарист",
    department: "preproduction",
    biography:
      "Превращает исследование в план и драфт текста под видео. Полуфабрикат, не финальный авторский текст.",
    purpose:
      "Превратить факты в структуру: хук → точки → концовка. Финальный голос остаётся за Владом.",
    success_criteria:
      "Через 2 недели — 2-3 драфта сценариев, которые Влад использовал как основу для авторского переписывания.",
  },
];

// Привязка bot_token → agent_id.
const BOT_BINDINGS = [
  { agent_id: "igor", token: "8477393497:AAGwv80ZjsexxvNu5Jfx4tYWZXZQEuWMxW4" },
  { agent_id: "chief-editor", token: "8601241060:AAFpM9QMVQaHGXB8cHyo9gX-Jrmjkikx_YE" },
  { agent_id: "researcher", token: "8621250848:AAHb2r5GLXvJJnUPnCTOZG8HGlQhaOjOqZc" },
  { agent_id: "scriptwriter", token: "8622964602:AAEyOFOVVa5vyiGY_lUb4XRUWLvU16A43d4" },
];

const CHAT_ID = "-5239522702";

async function main() {
  const sb = getServiceRoleClient();

  // 1. telegram_chat_id — убираем trailing space.
  console.log("\n[1/3] Обновляю telegram_chat_id и telegram_enabled");
  await updateTelegramSettings({ chatId: CHAT_ID, enabled: true });
  clearTelegramSettingsCache();
  console.log(`  chat_id = ${JSON.stringify(CHAT_ID)} (пробелы убраны)`);

  // 2. Создаём недостающих агентов.
  console.log("\n[2/3] Создаю/проверяю агентов");
  for (const spec of AGENTS_TO_ENSURE) {
    const existing = await getAgent(spec.id).catch(() => null);
    if (existing) {
      console.log(`  - ${spec.id} (${existing.display_name}) — уже есть, пропускаю`);
      continue;
    }
    try {
      await createAgent(spec);
      console.log(`  + ${spec.id} (${spec.display_name}) — создан`);
    } catch (err) {
      console.error(`  ! ${spec.id} — ошибка создания: ${err.message}`);
    }
  }

  // 3. Привязываем ботов.
  console.log("\n[3/3] Привязываю Telegram-ботов");
  for (const b of BOT_BINDINGS) {
    const existing = await getAgentBot(b.agent_id);
    if (existing && existing.bot_token === b.token) {
      console.log(`  = ${b.agent_id} — бот уже привязан (@${existing.bot_username ?? "?"})`);
      continue;
    }
    try {
      const bot = await bindAgentBot(b.agent_id, b.token);
      console.log(`  ✓ ${b.agent_id} -> @${bot.bot_username} (bot_id=${bot.telegram_bot_id})`);
    } catch (err) {
      console.error(`  ! ${b.agent_id} — ошибка привязки: ${err.message}`);
    }
  }

  console.log("\nГотово.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
