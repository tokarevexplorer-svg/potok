import type { LucideIcon } from "lucide-react";
import { BookmarkCheck, Newspaper, Users, Wrench } from "lucide-react";

export interface NavLeaf {
  label: string;
  // Если href нет — пункт-плейсхолдер (например, «Скоро»), не кликабельный.
  href?: string;
  icon?: LucideIcon;
  comingSoon?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavLeaf[];
}

export interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  groups: NavGroup[];
}

// Навигация расширяема: новый раздел — новый элемент массива.
// Новая иерархия: секция (Блог) → группы (Инструменты, Команда) → пункты.
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
        items: [{ label: "Скоро", comingSoon: true }],
      },
    ],
  },
];
