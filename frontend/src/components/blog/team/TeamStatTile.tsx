import type { LucideIcon } from "lucide-react";

interface TeamStatTileProps {
  icon: LucideIcon;
  label: string;
  value: string;
  // Подпись под значением (например, «за 30 дней»). Опциональная.
  hint?: string;
}

// Маленькая статистическая плашка: иконка + значение + подпись.
// Используется в шапке /blog/team в ряду из трёх метрик (активные, всего, расходы).
export default function TeamStatTile({
  icon: Icon,
  label,
  value,
  hint,
}: TeamStatTileProps) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4 shadow-card">
      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
        <Icon size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink-faint">
          {label}
        </p>
        <p className="mt-1 truncate font-display text-2xl font-semibold tracking-tight text-ink">
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
      </div>
    </div>
  );
}
