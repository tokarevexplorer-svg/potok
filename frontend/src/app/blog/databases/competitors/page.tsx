export const metadata = {
  title: "Конкуренты — Базы — Поток",
};

// Placeholder для будущей базы каналов конкурентов (этап 5).
// Стиль аналогичен «Постпродакшн» в Команде: opacity-60, без интерактива.
export default function CompetitorsDatabasePage() {
  return (
    <div className="min-w-0 opacity-60">
      <div className="flex flex-col gap-2 border-b border-line pb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">
          Блог · Базы · Конкуренты
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Конкуренты
        </h1>
      </div>

      <div className="mt-8 max-w-2xl rounded-2xl border border-dashed border-line bg-elevated/40 p-6 text-base leading-relaxed text-ink-muted">
        База каналов конкурентов появится в этапе 5. Разведчик будет анализировать
        форматы, хуки и темы конкурентов через Apify-парсинг Instagram-аккаунтов.
      </div>
    </div>
  );
}
