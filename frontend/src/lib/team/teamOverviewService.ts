// Аггрегаты для главной страницы /blog/team.
//
// Считаются на сервере через server-supabase клиент; вызывается из
// page.tsx (server component) с `dynamic = "force-dynamic"`. Никакого
// кеша — это «живой» дашборд, перерасчёт на каждый запрос дешёвый.

import { fetchSpendingLastNDays } from "./teamSpendingService";
import { fetchTeamTasks } from "./teamTasksService";
import type { TeamOverviewStats } from "./types";

export async function fetchTeamOverview(): Promise<TeamOverviewStats> {
  // Дёргаем параллельно — задачи и расходы независимы.
  const [tasks, spendingLast30Days] = await Promise.all([
    fetchTeamTasks(),
    fetchSpendingLastNDays(30),
  ]);

  let activeTasksCount = 0;
  let totalTasksCount = 0;
  for (const task of tasks) {
    if (task.status === "archived") continue;
    totalTasksCount += 1;
    if (task.status === "running") activeTasksCount += 1;
  }

  return {
    activeTasksCount,
    totalTasksCount,
    spendingLast30Days,
  };
}
