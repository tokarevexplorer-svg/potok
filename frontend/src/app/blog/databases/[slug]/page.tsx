import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { fetchBackendJsonSafe } from "@/lib/apiClient";
import CustomDbRecordEditor from "@/components/blog/databases/CustomDbRecordEditor";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

interface ColumnDef {
  key: string;
  label: string;
  type?:
    | "text"
    | "long_text"
    | "boolean"
    | "date"
    | "number"
    | "url"
    | "select"
    | "multi_select";
  options?: string[];
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
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ offset?: string }>;
};

// Динамический роут для кастомных баз. slug — закодированное имя записи в
// реестре team_custom_databases. Для referensy/competitor есть отдельные
// фиксированные страницы; сюда попадают только db_type='custom'.
export default async function CustomDatabasePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { offset: offsetParam } = await searchParams;
  const offset = Math.max(0, parseInt(offsetParam ?? "0", 10) || 0);

  const decodedName = (() => {
    try {
      return decodeURIComponent(slug);
    } catch {
      return slug;
    }
  })();

  const list = await fetchBackendJsonSafe<{ databases?: DatabaseRecord[] }>(
    "/api/team/databases",
  );
  const db = (list?.databases ?? []).find((d) => d.name === decodedName) ?? null;

  if (!db) {
    return (
      <div className="min-w-0">
        <div className="flex flex-col gap-2 border-b border-line pb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">
            Блог · Базы
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            База не найдена
          </h1>
        </div>
        <div className="mt-8 rounded-2xl border border-dashed border-line bg-elevated/40 px-4 py-12 text-center text-sm text-ink-muted">
          В реестре нет базы с именем «{decodedName}».{" "}
          <Link href="/blog/databases" className="text-accent underline-offset-2 hover:underline">
            Вернуться к списку баз
          </Link>
          .
        </div>
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
      <div className="flex flex-col gap-2 border-b border-line pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Блог · Базы · {db.name}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {db.name}
        </h1>
        {db.description && (
          <p className="mt-3 max-w-2xl text-base text-ink-muted">{db.description}</p>
        )}
      </div>

      {/* Сессия 45: для кастомных баз — клиентский редактор CRUD над таблицей.
          Для referensy/competitor читаем only. */}
      {db.db_type === "custom" && columns.length > 0 && (
        <CustomDbRecordEditor
          databaseId={db.id}
          columns={columns}
          records={records}
        />
      )}

      {records.length === 0 || columns.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-line bg-elevated/40 px-4 py-12 text-center text-sm text-ink-muted">
          {columns.length === 0
            ? "У базы не описаны колонки в schema_definition."
            : "База пуста. Записи появятся по мере работы команды."}
        </div>
      ) : (
        <>
          <p className="mt-8 text-sm text-ink-muted">
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

          <div className="mt-4 overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
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
        </>
      )}
    </div>
  );
}
