import TeamPageHeader from "@/components/blog/team/TeamPageHeader";
import TeamWorkspace from "@/components/blog/team/TeamWorkspace";
import { fetchTeamTasks } from "@/lib/team/teamTasksService";
import type { TeamTask } from "@/lib/team/types";

export const metadata = {
  title: "Инструменты команды — Поток",
};

export const dynamic = "force-dynamic";

export default async function TeamToolsPage() {
  // Грузим начальное состояние одним запросом — клиентский TeamWorkspace
  // дальше сам поллит апдейты через getSupabaseBrowserClient.
  let initialTasks: TeamTask[] = [];
  let loadError: string | null = null;
  try {
    initialTasks = await fetchTeamTasks();
  } catch (err) {
    loadError = err instanceof Error ? err.message : String(err);
  }

  return (
    <div className="min-w-0">
      <TeamPageHeader
        title="Инструменты"
        description="Запускай задачи (идеи, исследования, написание текстов) и следи за выполнением. Каждая задача — отдельный LLM-вызов с историей и стоимостью."
        showBackLink
      />

      {loadError && (
        <p className="mt-6 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">
          Не удалось загрузить задачи: {loadError}. UI запустится с пустым списком —
          перезагрузи страницу позже.
        </p>
      )}

      <div className="mt-8">
        <TeamWorkspace initialTasks={initialTasks} />
      </div>
    </div>
  );
}
