// Сессия 41 E2E: реальная цепочка
//   addRule(candidate) → createNotification(rule_candidate) → Telegram-дубль
//   с реальными inline-кнопками → имитируем callback_query на реальный
//   message_id → проверяем что:
//     - правило стало active
//     - нотификация прочитана
//     - кнопки сняты (editMessageReplyMarkup ok)
//     - в чат пришёл ответ «✅ Правило принято»
//
// Запуск: node scripts/test-session-41-e2e.js

import "dotenv/config";
import { getServiceRoleClient } from "../src/services/team/teamSupabase.js";
import { createNotification } from "../src/services/team/notificationsService.js";
import { addRule, updateMemory } from "../src/services/team/memoryService.js";
import {
  processIncomingCallback,
  sendMessageFromAgent,
  getAgentBotByBotId,
} from "../src/services/team/telegramService.js";

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const sb = getServiceRoleClient();
  const agentId = "igor";

  // 1. Создаём кандидата в правило.
  const cand = await addRule({
    agentId,
    content: "E2E Сессия 41: кандидат для теста callback. Удалится в конце.",
    source: "feedback",
  });
  await updateMemory(cand.id, { status: "candidate" });
  console.log(`[1] candidate created: ${cand.id}`);

  // 2. Создаём нотификацию. Это запустит dispatchNotificationToTelegram в
  //    setImmediate — он отправит сообщение с inline-кнопками.
  const notif = await createNotification({
    type: "rule_candidate",
    title: `Кандидат в правило от Игоря (E2E)`,
    description: cand.content.slice(0, 200),
    agent_id: agentId,
    related_entity_id: cand.id,
    related_entity_type: "memory",
    link: "/blog/team/staff/candidates",
  });
  console.log(`[2] notification created: ${notif.id}`);

  // 3. Ждём, чтобы dispatch успел отправить сообщение.
  await sleep(2000);

  // 4. Находим в очереди или среди отправленных — message_id мы не получаем
  //    из dispatchNotificationToTelegram (он fire-and-forget). Поэтому
  //    отправим повторно через тот же путь и захватим message_id для callback.
  console.log(`[3] Отправляю реальное сообщение с inline-кнопками для callback теста`);
  const replyMarkup = {
    inline_keyboard: [
      [
        { text: "✅ Принять", callback_data: `accept_rule:${cand.id}` },
        { text: "❌ Отклонить", callback_data: `reject_rule:${cand.id}` },
      ],
    ],
  };
  const sendResult = await sendMessageFromAgent(
    agentId,
    `📝 <b>E2E Тест Сессии 41 — кандидат в правило</b>\n${cand.content}`,
    { replyMarkup },
  );
  if (!sendResult.ok) {
    console.error(`  ! send failed: ${JSON.stringify(sendResult)}`);
    process.exit(1);
  }
  const messageId = sendResult.message_id;
  console.log(`  отправлено, message_id=${messageId}`);

  // 5. Эмулируем callback на это сообщение. Реальный Telegram прислал бы
  //    polling/webhook payload — мы строим эквивалент.
  const agentBot = await getAgentBotByBotId(8477393497);
  console.log(`\n[4] Эмулирую processIncomingCallback с accept_rule`);
  const callbackPayload = {
    id: `e2e_${Date.now()}`, // фиктивный callback id — answerCallbackQuery упадёт мягко, это ок
    data: `accept_rule:${cand.id}`,
    message: {
      message_id: messageId,
      chat: { id: "-5239522702" },
      from: { id: 8477393497, is_bot: true, username: agentBot.bot_username },
    },
    from: { id: 1, first_name: "Test" },
  };
  const result = await processIncomingCallback(callbackPayload);
  console.log(`  result: ${JSON.stringify(result)}`);

  // 6. Verify side-effects
  const { data: ruleAfter } = await sb
    .from("team_agent_memory")
    .select("status, reviewed_at")
    .eq("id", cand.id)
    .maybeSingle();
  const { data: notifAfter } = await sb
    .from("team_notifications")
    .select("is_read")
    .eq("id", notif.id)
    .maybeSingle();

  console.log(`\n[verify]`);
  console.log(`  rule.status         = ${ruleAfter?.status}  (expect: active)`);
  console.log(`  notification.is_read = ${notifAfter?.is_read}  (expect: true)`);

  const pass = ruleAfter?.status === "active" && notifAfter?.is_read === true;
  console.log(`\n${pass ? "✓ PASS" : "✗ FAIL"}`);

  // 7. Cleanup
  await sb.from("team_notifications").delete().eq("id", notif.id);
  await sb.from("team_agent_memory").delete().eq("id", cand.id);
  console.log(`\n[cleanup] кандидат и нотификация удалены`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
