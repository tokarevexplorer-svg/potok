import Link from "next/link";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { fetchBackendJsonSafe } from "@/lib/apiClient";

export const metadata = {
  title: "Референсы — Базы — Поток",
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface ColumnDef {
  key: string;
  label: string;
  type?: "text" | "boolean" | "date" | "number";
}

interface DatabaseRecord {
  id: string;
  name: string;
  description: string | null;
  table_name: string;
  db_type: "referensy" | "competitor" | "custom";
  schema_definition: { columns?: ColumnDef[] } | null;
}

interface RecordsResponse {
  database: DatabaseRecord;
  records: Record<string, unknown>[];
  total: number;
  isPlaceholder?: boolean;
  limit: number;
  offset: number;
}

// Форматирует значение ячейки в зависимости от типа колонки. Дату — в локальный
// формат, boolean — «Да/Нет», остальное — как строку. null/undefined → «—».
function formatCell(value: unknown, type: ColumnDef["type"]): string {
  if (value === null || value === undefined || value === "") return "—";
  if (type === "boolean") return value ? "Да" : "Нет";
  if (type === "date") {
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString("ru-RU");
  }
  if (type === "number") return String(value);
  return String(value);
}

type Props = {
  searchParams: Promise<{ offset?: string }>;
};

// Read-only просмотрщик базы Референсов. Колонки берёт из schema_definition,
// данные — из public.videos. Полный CRUD — на /blog/references (отдельный
// инструмент с фильтрами, тегами, мультиселектом).
export default async function ReferencesDatabasePage({ searchParams }: Props) {
  const { offset: offsetParam } = await searchParams;
  const offset = Math.max(0, parseInt(offsetParam ?? "0", 10) || 0);

  // Сначала получаем реестр, находим запись референсов — нужен её id для
  // /records и schema_definition для рендера колонок.
  const list = await fetchBackendJsonSafe<{ databases?: DatabaseRecord[] }>(
    "/api/team/databases",
  );
  const db = (list?.databases ?? []).find((d) => d.db_type === "referensy") ?? null;

  if (!db) {
    return (
      <div className="min-w-0">
        <Header />
        <p className="mt-8 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent">
          Не нашёл базу типа «referensy» в реестре. Накати миграцию
          0015_team_custom_databases.sql или проверь, что бэкенд доступен.
        </p>
      </div>
    );
  }

  const data = await fetchBackendJsonSafe<RecordsResponse>(
    `/api/team/databases/${db.id}/records?limit=${PAGE_SIZE}&offset=${offset}`,
  );
  const columns: ColumnDef[] = db.schema_definition?.columns ?? [];
  const records = data?.records ?? [];
  const total = data?.total ?? 0;

  const hasPrev = offset > 0;
  const hasNext = offset + PAGE_SIZE < total;
  const prevOffset = Math.max(0, offset - PAGE_SIZE);
  const nextOffset = offset + PAGE_SIZE;

  return (
    <div className="min-w-0">
      <Header />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-ink-muted">
          Записей всего: <span className="font-semibold text-ink">{total}</span>
          {records.length > 0 && (
            <>
              {" "}
              · показаны{" "}
              <span className="font-semibold text-ink">
                {offset + 1}–{Math.min(offset + records.length, total)}
              </span>
            </>
          )}
        </p>
        <Link
          href="/blog/references"
          className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-line-strong hover:shadow-card"
        >
          Открыть полную базу <ExternalLink size={14} />
        </Link>
      </div>

      {records.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line bg-elevated/40 px-4 py-12 text-center text-sm text-ink-muted">
          Пока нет записей.
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-line bg-elevated/40 text-xs font-semibold uppercase tracking-[0.06em] text-ink-faint">
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className="px-4 py-3">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((row, idx) => (
                <tr
                  key={String(row.id ?? idx)}
                  className="border-b border-line last:border-b-0 hover:bg-elevated/30"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className="max-w-[420px] truncate px-4 py-3 align-top text-ink"
                      title={String(row[col.key] ?? "")}
                    >
                      {formatCell(row[col.key], col.type)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(hasPrev || hasNext) && (
        <div className="mt-4 flex items-center justify-between gap-3">
          {hasPrev ? (
            <Link
              href={`?offset=${prevOffset}`}
              className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-line-strong"
            >
              <ArrowLeft size={14} /> Назад
            </Link>
          ) : (
            <span />
          )}
          {hasNext && (
            <Link
              href={`?offset=${nextOffset}`}
              className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:border-line-strong"
            >
              Вперёд <ArrowRight size={14} />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

function Header() {
  return (
    <div className="flex flex-col gap-2 border-b border-line pb-8">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">
        Блог · Базы · Референсы
      </p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        Референсы
      </h1>
      <p className="mt-3 max-w-2xl text-base text-ink-muted">
        Видеореференсы для блога — Instagram Reels с транскрипцией и AI-анализом.
      </p>
    </div>
  );
}
