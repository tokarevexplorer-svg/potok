"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import type { NavGroup } from "@/lib/nav";
import SidebarItem from "./SidebarItem";

interface SidebarGroupProps {
  group: NavGroup;
  onNavigate: () => void;
}

// Внутренняя группа раздела (например, «Инструменты», «Команда», «Базы»).
// Если у группы задан href — заголовок становится кликабельным; это нужно для
// групп без подпунктов, которые сами ведут на индекс-страницу раздела.
export default function SidebarGroup({ group, onNavigate }: SidebarGroupProps) {
  const GroupIcon = group.icon;
  const pathname = usePathname();

  let header: React.ReactNode;
  if (group.href) {
    const active =
      pathname === group.href || pathname.startsWith(`${group.href}/`);
    header = (
      <Link
        href={group.href}
        onClick={onNavigate}
        className={clsx(
          "focus-ring -mx-1 flex items-center gap-2 rounded-md px-4 pb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] transition",
          active ? "text-ink" : "text-ink-faint/80 hover:text-ink"
        )}
      >
        <GroupIcon size={13} />
        <span>{group.label}</span>
      </Link>
    );
  } else {
    header = (
      <div className="flex items-center gap-2 px-3 pb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint/80">
        <GroupIcon size={13} />
        <span>{group.label}</span>
      </div>
    );
  }

  return (
    <div>
      {header}
      {group.items.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {group.items.map((item, idx) => (
            <li key={item.href ?? `${group.id}-${idx}`}>
              <SidebarItem item={item} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
