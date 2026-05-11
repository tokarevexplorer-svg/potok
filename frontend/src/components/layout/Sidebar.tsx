"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  BookmarkCheck,
  Boxes,
  Pin,
  PinOff,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { navSections, type NavLeaf, type NavSection } from "@/lib/nav";
import SidebarSection from "./SidebarSection";

interface SidebarProps {
  mobileOpen: boolean;
  desktopOpen: boolean;
  pinned: boolean;
  onClose: () => void;
  onDesktopLeave: () => void;
  onTogglePin: () => void;
}

// Минимальный shape записи реестра баз — берём только то, что нужно для
// рендера пункта в sidebar. Полный shape — в backend/customDatabaseService.js.
interface DatabaseRecord {
  id: string;
  name: string;
  db_type: "referensy" | "competitor" | "custom";
}

// Преобразует запись реестра в пункт меню.
//
// Фиксированные базы (referensy / competitor) ведут на отдельные страницы
// с захардкоженными слагами — их слаг определяется типом, а не именем.
// Кастомные — на динамический роут /blog/databases/<encodeURIComponent(name)>.
function databaseToNavLeaf(db: DatabaseRecord): NavLeaf {
  if (db.db_type === "referensy") {
    return {
      label: db.name,
      href: "/blog/databases/references",
      icon: BookmarkCheck,
    };
  }
  if (db.db_type === "competitor") {
    return {
      label: db.name,
      href: "/blog/databases/competitors",
      icon: Users,
      // Приглушённый стиль и tooltip про этап 5. SidebarItem уже умеет
      // рендерить disabled-пункты с opacity, так что отдельной логики не нужно.
      disabled: true,
    };
  }
  return {
    label: db.name,
    href: `/blog/databases/${encodeURIComponent(db.name)}`,
    icon: Boxes as LucideIcon,
  };
}

export default function Sidebar({
  mobileOpen,
  desktopOpen,
  pinned,
  onClose,
  onDesktopLeave,
  onTogglePin,
}: SidebarProps) {
  // Динамические подпункты раздела «Базы». Подгружаются один раз при монтировании
  // sidebar — таким образом новые кастомные базы появляются после refresh.
  // На старте показываем фиксированный fallback (Референсы + Конкуренты), чтобы
  // меню не «прыгало», если запрос медленный или бэкенд недоступен.
  const [databasesItems, setDatabasesItems] = useState<NavLeaf[]>(FALLBACK_DATABASES);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/team-proxy/databases", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { databases?: DatabaseRecord[] };
        if (cancelled) return;
        const items = (json.databases ?? []).map(databaseToNavLeaf);
        // Если бэкенд по какой-то причине вернул пустой реестр — оставляем
        // fallback. Это редкий случай, но лучше показать заглушки, чем пустоту.
        if (items.length > 0) setDatabasesItems(items);
      })
      .catch((err) => {
        // Молча падаем на fallback. Логи в консоль на случай отладки.
        console.warn("[sidebar] не удалось загрузить базы:", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Расширяем navSections на лету: вставляем динамические items в группу
  // databases. Сами navSections не мутируем — оставляем чистым модулем.
  const sections: NavSection[] = navSections.map((section) => ({
    ...section,
    groups: section.groups.map((group) =>
      group.id === "databases" ? { ...group, items: databasesItems } : group,
    ),
  }));

  return (
    <aside
      onMouseLeave={pinned ? undefined : onDesktopLeave}
      className={clsx(
        "fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-elevated shadow-pop transition-transform duration-200 ease-ease",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        desktopOpen ? "lg:translate-x-0" : "lg:-translate-x-full"
      )}
    >
      <div className="flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2.5">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-surface font-display text-base font-bold">
            П
          </span>
          <span className="font-display text-lg font-semibold tracking-tight">
            Поток
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onTogglePin}
            className={clsx(
              "focus-ring hidden h-9 w-9 items-center justify-center rounded-lg transition lg:inline-flex",
              pinned
                ? "bg-accent-soft text-accent"
                : "text-ink-muted hover:bg-canvas hover:text-ink"
            )}
            aria-label={pinned ? "Открепить меню" : "Закрепить меню"}
            aria-pressed={pinned}
            title={pinned ? "Открепить меню" : "Закрепить меню"}
          >
            {pinned ? <PinOff size={18} /> : <Pin size={18} />}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="focus-ring -mr-2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted transition hover:bg-canvas hover:text-ink lg:hidden"
            aria-label="Закрыть меню"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        <ul className="flex flex-col gap-6">
          {sections.map((section) => (
            <li key={section.id}>
              <SidebarSection section={section} onNavigate={onClose} />
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-line px-6 py-5 text-xs text-ink-faint">
        v0.1 · сессия 11
      </div>
    </aside>
  );
}

// Стартовый набор пунктов на случай, если запрос за реестром ещё не прошёл
// или вернулся с ошибкой. Совпадает с двумя seed-записями миграции
// 0015_team_custom_databases.sql, так что меню остаётся консистентным.
const FALLBACK_DATABASES: NavLeaf[] = [
  {
    label: "Референсы",
    href: "/blog/databases/references",
    icon: BookmarkCheck,
  },
  {
    label: "Конкуренты",
    href: "/blog/databases/competitors",
    icon: Users,
    disabled: true,
  },
];
