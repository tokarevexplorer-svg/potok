// Сессия 41: интеграционные тесты дублирования Inbox → Telegram +
// обработки callback_query.
//
// Запуск: node scripts/test-session-41.js

import "dotenv/config";
import { getServiceRoleClient } from "../src/services/team/teamSupabase.js";
import { createNotification } from "../src/services/team/notificationsService.js";
import { addRule, updateMemory } from "../src/services/team/memoryService.js";
import {
  processIncomingCallback,
  dispatchNotificationToTelegram,
  getAgentBotByBotId,
} from "../src/services/team/telegramService.js";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function cleanup(sb, ids) {
  if (ids.notifications.length) {
    await sb.from("team_notifications").delete().in("id", ids.notifications);
  }
  if (ids.memory.length) {
    await sb.from("team_agent_memory").delete().in("id", ids.memory);
  }
  if (ids.queue.length) {
    await sb.from("team_telegram_queue").delete().in("id", ids.queue);
  }
}

async function main() {
  const sb = getServiceRoleClient();
  const agentId = "igor";
  const ids = { notifications: [], memory: [], queue: [] };

  // === Тест 1: task_awaiting_review → Telegram-дубль ===
  console.log("\n[1] createNotification(task_awaiting_review) → Telegram");
  const n1 = await createNotification({
    type: "task_awaiting_review",
    title: "Задача «Smoke-test Сессии 41» ждёт оценки",
    agent_id: agentId,
    related_entity_id: "tsk_smoke_41",
    related_entity_type: "task",
    link: "/blog/team/dashboard",
  });
  ids.notifications.push(n1.id);
  await sleep(1500); // setImmediate отрабатывает, fetch к Telegram занимает ~500ms
  console.log(`  notification id=${n1.id} created, проверь чат @analyst_scout_bot`);

  // === Тест 2: rule_candidate → Telegram с inline-кнопками ===
  console.log("\n[2] createNotification(rule_candidate) → Telegram с Accept/Reject");
  // Создаём кандидата в правило.
  const cand = await addRule({
    agentId,
    content: "Smoke test (Сессия 41): этот кандидат для проверки inline-кнопок",
    source: "feedback",
  });
  // addRule создаёт active по умолчанию, нам нужно candidate.
  await updateMemory(cand.id, { status: "candidate" });
  ids.memory.push(cand.id);

  const n2 = await createNotification({
    type: "rule_candidate",
    title: `Кандидат в правило от Игоря`,
    description: cand.content.slice(0, 200),
    agent_id: agentId,
    related_entity_id: cand.id,
    related_entity_type: "memory",
    link: "/blog/team/staff/candidates",
  });
  ids.notifications.push(n2.id);
  await sleep(1500);
  console.log(`  notification id=${n2.id}, candidate memory id=${cand.id}`);

  // === Тест 3: processIncomingCallback(accept_rule) — эмулируем нажатие ===
  console.log("\n[3] processIncomingCallback(accept_rule)");
  // Эмулируем payload Telegram'а: agentBot.callback_query
  const agentBot = await getAgentBotByBotId(8477393497); // analyst_scout_bot
  if (!agentBot) {
    console.error("  ! analyst_scout_bot не найден в team_telegram_bots");
    await cleanup(sb, ids);
    process.exit(1);
  }
  const fakeCallback = {
    id: "fake_callback_query_id_session41",
    data: `accept_rule:${cand.id}`,
    message: {
      message_id: 999999, // некоторое сообщение, которое мы не отправляли — editMessageReplyMarkup упадёт мягко
      chat: { id: "-5239522702" },
      from: { id: 8477393497, is_bot: true },
    },
    from: { id: 1, first_name: "Test" },
  };
  const callbackResult = await processIncomingCallback(fakeCallback);
  console.log(`  result: ${JSON.stringify(callbackResult)}`);

  // Проверяем, что правило стало active.
  const { data: ruleAfter } = await sb
    .from("team_agent_memory")
    .select("status, reviewed_at")
    .eq("id", cand.id)
    .maybeSingle();
  console.log(`  rule.status after accept: ${ruleAfter?.status} (reviewed_at=${ruleAfter?.reviewed_at})`);
  if (ruleAfter?.status !== "active") {
    console.error("  ! ОЖИДАЕТСЯ status=active");
  }

  // Проверяем, что нотификация помечена прочитанной.
  const { data: notifAfter } = await sb
    .from("team_notifications")
    .select("is_read")
    .eq("id", n2.id)
    .maybeSingle();
  console.log(`  notification.is_read after accept: ${notifAfter?.is_read}`);

  // === Тест 4: dispatchNotificationToTelegram() с urgent proposal ===
  console.log("\n[4] urgent proposal — должен пойти мимо тихого часа");
  const n3 = await createNotification({
    type: "proposal",
    title: "Игорь предлагает срочную задачу (smoke test)",
    description: "urgent: проверка приоритета",
    agent_id: agentId,
    related_entity_type: "proposal",
    link: "/blog/team/dashboard",
  });
  ids.notifications.push(n3.id);
  await sleep(1500);
  console.log(`  notification id=${n3.id} (urgent), проверь чат`);

  // === Cleanup ===
  console.log("\n[cleanup] Удаляю тестовые записи");
  await cleanup(sb, ids);
  console.log("Готово.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
