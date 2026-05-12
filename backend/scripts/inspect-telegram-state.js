// Сессия 39+: разовая проверка состояния Telegram — какие агенты есть, что
// в team_settings, есть ли уже привязки в team_telegram_bots.
//
// Запуск: cd backend && node scripts/inspect-telegram-state.js

import "dotenv/config";
import { getServiceRoleClient } from "../src/services/team/teamSupabase.js";

async function main() {
  const sb = getServiceRoleClient();

  console.log("\n=== team_settings (telegram_*) ===");
  const { data: settings } = await sb
    .from("team_settings")
    .select("key, value")
    .like("key", "telegram_%");
  for (const row of settings ?? []) console.log(`  ${row.key} = ${JSON.stringify(row.value)}`);

  console.log("\n=== team_agents (id, display_name, role_title, status) ===");
  const { data: agents } = await sb
    .from("team_agents")
    .select("id, display_name, role_title, status")
    .order("created_at", { ascending: true });
  for (const a of agents ?? [])
    console.log(`  [${a.status}] ${a.id.padEnd(24)} | ${a.display_name} (${a.role_title ?? "-"})`);

  console.log("\n=== team_telegram_bots ===");
  const { data: bots } = await sb.from("team_telegram_bots").select("*");
  for (const b of bots ?? [])
    console.log(
      `  ${b.agent_id} -> @${b.bot_username ?? "?"} (bot_id=${b.telegram_bot_id ?? "?"}, ${b.status})`,
    );
  if (!bots?.length) console.log("  (пусто)");

  console.log("\n=== ENV ===");
  console.log(`  TELEGRAM_SYSTEM_BOT_TOKEN: ${process.env.TELEGRAM_SYSTEM_BOT_TOKEN ? "✓" : "✗"}`);
  console.log(`  TELEGRAM_WEBHOOK_SECRET:   ${process.env.TELEGRAM_WEBHOOK_SECRET ? "✓" : "✗"}`);
  console.log(`  BACKEND_PUBLIC_URL:        ${process.env.BACKEND_PUBLIC_URL ?? "(не задан)"}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
