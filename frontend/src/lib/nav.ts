import type { LucideIcon } from "lucide-react";
import {
  BookmarkCheck,
  BookOpen,
  Database,
  Folder,
  LayoutDashboard,
  Newspaper,
  Settings,
  ShieldCheck,
  Users,
  Wrench,
} from "lucide-react";

export interface NavLeaf {
  label: string;
  // Если href нет — пункт-плейсхолдер (например, «Скоро»), не кликабельный.
  href?: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
  // Приглушённый стиль и без active-подсветки — для пунктов «ещё не сейчас».
  disabled?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  // Если href задан — заголовок группы кликабелен и ведёт на этот маршрут.
  href?: string;
  items: NavLeaf[];
}

export interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  groups: NavGroup[];
}

// Навигация расширяема: новый раздел — новый элемент массива.
// Иерархия: секция (Блог) → группы (Инструменты, Команда, Базы) → пункты.
export const navSections: NavSection[] = [
  {
    id: "blog",
    label: "Блог",
    icon: Newspaper,
    groups: [
      {
        id: "tools",
        label: "Инструменты",
        icon: Wrench,
        items: [
          {
            label: "База референсов",
            href: "/blog/references",
            icon: BookmarkCheck,
          },
        ],
      },
      {
        id: "team",
        label: "Команда",
        icon: Users,
        items: [
          {
            label: "Дашборд",
            href: "/blog/team/dashboard",
            icon: LayoutDashboard,
          },
          {
            label: "Сотрудники",
            href: "/blog/team/staff",
            icon: Users,
          },
          {
            label: "Инструкции",
            href: "/blog/team/instructions",
            icon: BookOpen,
          },
          {
            label: "Артефакты",
            href: "/blog/team/artifacts",
            icon: Folder,
          },
          {
            label: "Админка",
            href: "/blog/team/admin",
            icon: Settings,
          },
          {
            label: "Постпродакшн",
            href: "/blog/team/postproduction",
            icon: ShieldCheck,
            disabled: true,
          },
        ],
      },
      {
        id: "databases",
        label: "Базы",
        icon: Database,
        href: "/blog/databases",
        items: [],
      },
    ],
  },
];
