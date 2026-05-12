import TaskComparisonView from "@/components/blog/team/TaskComparisonView";

// Сессия 34: страница сравнения двух (или больше) задач — клонов с разной
// моделью. Рендер в две колонки, см. компонент TaskComparisonView.

export const metadata = {
  title: "Сравнение задач — Поток",
};

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ groupId: string }>;
}

export default async function CompareTasksPage({ params }: PageProps) {
  const { groupId } = await params;
  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-2 border-b border-line pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Команда · Задачи · Сравнение
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Сравнение задач
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-muted">
          Две (или больше) задачи одной группы — одинаковый бриф, разные модели.
          Колонки отрисованы бок о бок.
        </p>
      </div>
      <TaskComparisonView groupId={groupId} />
    </div>
  );
}
