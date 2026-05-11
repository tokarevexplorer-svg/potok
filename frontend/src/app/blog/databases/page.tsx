import Link from "next/link";
import { ArrowUpRight, BookmarkCheck, Boxes, Users } from "lucide-react";

export const metadata = {
  title: "Базы — Поток",
};

// Индекс-страница раздела «Базы». Здесь живёт структурированное
// переиспользуемое знание команды: видеореференсы, конкуренты, кастомные базы.
// Полноценные подменю появятся в этапе 5 (Сессия 5+), пока — три карточки.
export default function DatabasesPage() {
  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-2 border-b border-line pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Блог · Базы
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Базы
        </h1>
        <p className="mt-3 max-w-2xl text-base text-ink-muted">
          Структурированное переиспользуемое знание команды. Источник для агентов.
        </p>
      </div>

      <section className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Link
          href="/blog/references"
          className="focus-ring group relative flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-card transition hover:-translate-y-[1px] hover:border-line-strong hover:shadow-pop sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent transition group-hover:bg-accent group-hover:text-surface">
              <BookmarkCheck size={22} />
            </span>
            <ArrowUpRight
              size={18}
              className="text-ink-faint transition group-hover:text-ink"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
              Референсы
            </h3>
            <p className="text-sm leading-snug text-ink-muted">
              Видеореференсы для блога.
            </p>
          </div>
        </Link>

        <div
          aria-disabled="true"
          className="relative flex cursor-not-allowed flex-col gap-3 rounded-2xl border border-line bg-surface p-5 opacity-60 shadow-card sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Users size={22} />
            </span>
            <span className="rounded-full bg-line px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
              этап 5
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
              Конкуренты
            </h3>
            <p className="text-sm leading-snug text-ink-muted">
              Появится в этапе 5 — таблицы транскрипций по каналам конкурентов.
            </p>
          </div>
        </div>

        <div
          aria-disabled="true"
          className="relative flex cursor-not-allowed flex-col gap-3 rounded-2xl border border-line bg-surface p-5 opacity-60 shadow-card sm:p-6"
        >
          <div className="flex items-start justify-between gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <Boxes size={22} />
            </span>
            <span className="rounded-full bg-line px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
              этап 5
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
              Кастомные
            </h3>
            <p className="text-sm leading-snug text-ink-muted">
              Появятся в этапе 5 — базы, которые рождаются из артефактов задач.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
