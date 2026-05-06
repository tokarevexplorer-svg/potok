import Link from "next/link";
import { ChevronLeft } from "lucide-react";

interface TeamPageHeaderProps {
  title: string;
  description: string;
  // Когда нужна ссылка «← Команда» в шапке внутренних страниц.
  showBackLink?: boolean;
  // Действия справа в шапке (например, кнопка «Создать задачу»). Опционально.
  actions?: React.ReactNode;
}

// Унифицированная шапка страниц раздела Команда. Совпадает по сетке и
// отступам с шапкой /blog/references — чтобы Команда и База референсов
// смотрелись как один продукт.
export default function TeamPageHeader({
  title,
  description,
  showBackLink,
  actions,
}: TeamPageHeaderProps) {
  return (
    <div className="flex flex-col gap-6 border-b border-line pb-8 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">
          {showBackLink ? (
            <Link
              href="/blog/team"
              className="focus-ring inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-ink-muted transition hover:text-ink"
            >
              <ChevronLeft size={12} />
              Команда
            </Link>
          ) : (
            <span>Блог · Команда</span>
          )}
        </p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="mt-3 max-w-2xl text-base text-ink-muted">{description}</p>
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
