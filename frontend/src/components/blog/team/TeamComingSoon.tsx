import type { LucideIcon } from "lucide-react";

interface TeamComingSoonProps {
  icon: LucideIcon;
  title: string;
  // Перечисление того, что появится в этом разделе. Чтобы Влад видел план.
  items: string[];
  // Какая сессия в roadmap-е этапа 1 раздела «Команда» добавит функционал.
  // Например: «Сессия 6» / «Сессия 7».
  plannedIn: string;
}

// Заглушка для внутренних разделов Команды на этапе каркаса (Сессия 28).
// В Сессиях 6–7 этапа 1 каждый раздел получит свой полноценный UI и заглушка
// будет заменена на реальный workspace.
export default function TeamComingSoon({
  icon: Icon,
  title,
  items,
  plannedIn,
}: TeamComingSoonProps) {
  return (
    <div className="mx-auto mt-10 flex max-w-xl flex-col items-center rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center shadow-card">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <Icon size={28} />
      </span>
      <h2 className="mt-5 font-display text-2xl font-semibold tracking-tight">
        {title}
      </h2>
      <p className="mt-2 text-sm text-ink-muted">
        Этот раздел в работе — каркас уже готов, наполнение появится в{" "}
        <span className="font-medium text-ink">{plannedIn}</span>.
      </p>

      <div className="mt-6 w-full rounded-xl bg-canvas p-4 text-left">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-faint">
          Что здесь будет
        </p>
        <ul className="mt-3 space-y-2 text-sm text-ink">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-accent" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
