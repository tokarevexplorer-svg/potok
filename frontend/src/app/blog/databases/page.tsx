import Link from "next/link";
import { ArrowUpRight, BookmarkCheck, Boxes, Users } from "lucide-react";
import { fetchBackendJsonSafe } from "@/lib/apiClient";
import CreateDatabaseButton from "@/components/blog/databases/CreateDatabaseButton";

export const metadata = {
  title: "Базы — Поток",
};

export const dynamic = "force-dynamic";

// Запись реестра баз. Тот же shape, что в backend/customDatabaseService.js +
// frontend/Sidebar.tsx. Здесь добавляем description, который рисуется на карточке.
interface DatabaseRecord {
  id: string;
  name: string;
  description: string | null;
  db_type: "referensy" | "competitor" | "custom";
  table_name: string;
}

// Серверный fetch реестра. На любой ошибке (нет сессии, бэкенд лежит, 500) —
// возвращаем пустой массив: страница покажет пустое состояние, не упадёт.
async function loadDatabases(): Promise<DatabaseRecord[]> {
  const data = await fetchBackendJsonSafe<{ databases?: DatabaseRecord[] }>(
    "/api/team/databases",
  );
  return data?.databases ?? [];
}

// Привязка типа базы к иконке/цели. Для referensy и competitor — захардкоженные
// маршруты (см. /blog/databases/references и /blog/databases/competitors).
// Для custom — динамический slug.
function getCardConfig(db: DatabaseRecord) {
  if (db.db_type === "referensy") {
    return {
      Icon: BookmarkCheck,
      href: "/blog/databases/references",
      muted: false,
      badge: null as string | null,
    };
  }
  if (db.db_type === "competitor") {
    return {
      Icon: Users,
      href: null,
      muted: true,
      badge: "этап 5",
    };
  }
  return {
    Icon: Boxes,
    href: `/blog/databases/${encodeURIComponent(db.name)}`,
    muted: false,
    badge: null,
  };
}

// Индекс-страница раздела «Базы». Карточки рендерятся динамически по реестру
// team_custom_databases — добавление новой базы (через Dashboard или будущий
// мастер) автоматически появляется здесь.
export default async function DatabasesPage() {
  const databases = await loadDatabases();

  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-2 border-b border-line pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Блог · Базы
        </p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Базы
          </h1>
          <CreateDatabaseButton />
        </div>
        <p className="mt-3 max-w-2xl text-base text-ink-muted">
          Структурированное переиспользуемое знание команды.
        </p>
      </div>

      {databases.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line bg-elevated/40 px-4 py-12 text-center text-sm text-ink-muted">
          Реестр баз пока пуст или бэкенд недоступен.
        </div>
      ) : (
        <section className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {databases.map((db) => {
            const cfg = getCardConfig(db);
            return cfg.href ? (
              <Link
                key={db.id}
                href={cfg.href}
                className="focus-ring group relative flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-card transition hover:-translate-y-[1px] hover:border-line-strong hover:shadow-pop sm:p-6"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent transition group-hover:bg-accent group-hover:text-surface">
                    <cfg.Icon size={22} />
                  </span>
                  <ArrowUpRight
                    size={18}
                    className="text-ink-faint transition group-hover:text-ink"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                    {db.name}
                  </h3>
                  {db.description && (
                    <p className="text-sm leading-snug text-ink-muted">
                      {db.description}
                    </p>
                  )}
                </div>
              </Link>
            ) : (
              <div
                key={db.id}
                aria-disabled="true"
                className="relative flex cursor-not-allowed flex-col gap-3 rounded-2xl border border-line bg-surface p-5 opacity-60 shadow-card sm:p-6"
                title="Появится в этапе 5"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <cfg.Icon size={22} />
                  </span>
                  {cfg.badge && (
                    <span className="rounded-full bg-line px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
                      {cfg.badge}
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-1.5">
                  <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                    {db.name}
                  </h3>
                  {db.description && (
                    <p className="text-sm leading-snug text-ink-muted">
                      {db.description}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
