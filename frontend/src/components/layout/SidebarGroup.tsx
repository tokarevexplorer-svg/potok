"use client";

import type { NavGroup } from "@/lib/nav";
import SidebarItem from "./SidebarItem";

interface SidebarGroupProps {
  group: NavGroup;
  onNavigate: () => void;
}

// Внутренняя группа раздела (например, «Инструменты», «Команда»).
export default function SidebarGroup({ group, onNavigate }: SidebarGroupProps) {
  const GroupIcon = group.icon;

  return (
    <div>
      <div className="flex items-center gap-2 px-3 pb-1.5 text-[11px] font-medium uppercase tracking-[0.06em] text-ink-faint/80">
        <GroupIcon size={13} />
        <span>{group.label}</span>
      </div>
      <ul className="flex flex-col gap-0.5">
        {group.items.map((item, idx) => (
          <li key={item.href ?? `${group.id}-${idx}`}>
            <SidebarItem item={item} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </div>
  );
}
