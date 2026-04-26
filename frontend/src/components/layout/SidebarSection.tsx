"use client";

import type { NavSection } from "@/lib/nav";
import SidebarGroup from "./SidebarGroup";

interface SidebarSectionProps {
  section: NavSection;
  onNavigate: () => void;
}

// Верхний уровень навигации — раздел суперапа (например, «Блог»).
// Внутри раздела — группы (Инструменты, Команда), внутри групп — пункты.
export default function SidebarSection({
  section,
  onNavigate,
}: SidebarSectionProps) {
  const SectionIcon = section.icon;

  return (
    <div>
      <div className="flex items-center gap-2 px-3 pb-3 text-xs font-semibold uppercase tracking-[0.1em] text-ink-faint">
        <SectionIcon size={14} />
        <span>{section.label}</span>
      </div>
      <ul className="flex flex-col gap-4">
        {section.groups.map((group) => (
          <li key={group.id}>
            <SidebarGroup group={group} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
    </div>
  );
}
