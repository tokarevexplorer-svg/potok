// Сессия 24 этапа 2 (пункт 15). Автоматизация цикла размышления автономных
// агентов через node-cron.
//
// Расписание:
//   • каждые 6 часов — pollEventTriggers (события: low_score,
//     new_competitor_entry, goals_changed).
//   • раз в 24 часа (10:00 UTC) — runWeeklyReflectionForAll (еженедельное
//     окно «оглянись на свою зону»). Cooldown 7 дней внутри
//     proposalService.getLastReflection гарантирует, что один и тот же
//     агент не будет дёргаться чаще раза в неделю.
//   • раз в 24 часа (03:00 UTC, поздняя ночь МСК) — expireOldProposals(14):
//     pending старше 14 дней переезжают в status='expired'.
//
// Все джобы дёргаются ТОЛЬКО при autonomy_enabled_globally=true.
// Внутри pollEventTriggers / runReflectionCycle есть свой ранний exit на
// этот же флаг; дублируем здесь для дешёвого «скипа в cron'е, не
// тратя CPU на загрузку агентов».
//
// node-cron в process Railway: один процесс backend, один cron-планировщик.
// При рестарте процесса cron перезапускается; теряем максимум один тик.

import cron from "node-cron";
import {
  checkAutonomyEnabled,
  pollEventTriggers,
  runWeeklyReflectionForAll,
} from "../services/team/triggerService.js";
import { expireOldProposals } from "../services/team/proposalService.js";

const TZ = "Etc/UTC";

let started = false;

export function startAutonomyCron() {
  if (started) return;
  started = true;

  // Каждые 6 часов: 0 */6 * * *
  cron.schedule(
    "0 */6 * * *",
    async () => {
      try {
        const enabled = await checkAutonomyEnabled();
        if (!enabled) {
          console.log("[autonomy-cron] poll: autonomy disabled — skip");
          return;
        }
        const report = await pollEventTriggers();
        const triggered = report.agents.reduce(
          (acc, a) =>
            acc +
            (a.results.low_score?.triggered ? 1 : 0) +
            (a.results.new_competitor_entry?.triggered ? 1 : 0) +
            (a.results.goals_changed?.triggered ? 1 : 0),
          0,
        );
        console.log(
          `[autonomy-cron] poll: checked ${report.agents.length} agents, triggered ${triggered}`,
        );
      } catch (err) {
        console.error("[autonomy-cron] poll failed:", err);
      }
    },
    { timezone: TZ },
  );

  // Раз в сутки в 10:00 UTC: weekly window.
  cron.schedule(
    "0 10 * * *",
    async () => {
      try {
        const enabled = await checkAutonomyEnabled();
        if (!enabled) {
          console.log("[autonomy-cron] weekly: autonomy disabled — skip");
          return;
        }
        const results = await runWeeklyReflectionForAll();
        const proposals = results.filter(
          (r) => r.result.phase === "proposal_created",
        ).length;
        console.log(
          `[autonomy-cron] weekly: ${results.length} agents, created ${proposals} proposals`,
        );
      } catch (err) {
        console.error("[autonomy-cron] weekly failed:", err);
      }
    },
    { timezone: TZ },
  );

  // Раз в сутки в 03:00 UTC: expire старых pending.
  cron.schedule(
    "0 3 * * *",
    async () => {
      try {
        const expired = await expireOldProposals(14);
        if (expired > 0) {
          console.log(`[autonomy-cron] expire: moved ${expired} pending → expired`);
        }
      } catch (err) {
        console.error("[autonomy-cron] expire failed:", err);
      }
    },
    { timezone: TZ },
  );

  console.log("[autonomy-cron] schedules registered: poll every 6h, weekly at 10:00 UTC, expire at 03:00 UTC");
}
