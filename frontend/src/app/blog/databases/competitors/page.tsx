import CompetitorsWorkspace from "@/components/blog/team/CompetitorsWorkspace";

// Сессия 33: рабочая страница базы конкурентов. Парсинг через Apify
// + AI-саммари по каждому посту.

export const metadata = {
  title: "Конкуренты — Базы — Поток",
};

export const dynamic = "force-dynamic";

export default function CompetitorsDatabasePage() {
  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-2 border-b border-line pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Блог · Базы · Конкуренты
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Конкуренты
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Instagram-блогеры, чьи приёмы и темы интересны команде. Парсинг через
          Apify, по каждому посту — AI-саммари (тип, тема, хук, краткое содержание).
        </p>
      </div>
      <CompetitorsWorkspace />
    </div>
  );
}
