import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";

interface TeamSectionCardProps {
  href: string;
  icon: LucideIcon;
  label: string;
  description: string;
  // Опциональный «бейдж» снизу: количество или статус. Если не передан —
  // карточка остаётся компактной.
  badge?: string;
  // Если true — рисуем рамку акцентным цветом и иконку поярче. Используется,
  // когда в разделе нужны действия пользователя (например, не хватает ключа
  // в Админке).
  highlight?: boolean;
}

// Карточка-ссылка на внутренний раздел Команды. Notion/Linear-стиль:
// аккуратный hover, тонкая рамка, акцентная иконка.
export default function TeamSectionCard({
  href,
  icon: Icon,
  label,
  description,
  badge,
  highlight,
}: TeamSectionCardProps) {
  return (
    <Link
      href={href}
      className={`focus-ring group relative flex flex-col gap-3 rounded-2xl border bg-surface p-5 shadow-card transition hover:-translate-y-[1px] hover:border-line-strong hover:shadow-pop sm:p-6 ${
        highlight ? "border-accent/50" : "border-line"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <span
          className={`inline-flex h-11 w-11 items-center justify-center rounded-xl transition ${
            highlight
              ? "bg-accent text-surface"
              : "bg-accent-soft text-accent group-hover:bg-accent group-hover:text-surface"
          }`}
        >
          <Icon size={22} />
        </span>
        <ArrowUpRight
          size={18}
          className="text-ink-faint transition group-hover:text-ink"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
          {label}
        </h3>
        <p className="text-sm leading-snug text-ink-muted">{description}</p>
      </div>

      {badge && (
        <div className="mt-1 inline-flex w-fit items-center rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-ink-muted">
          {badge}
        </div>
      )}
    </Link>
  );
}
