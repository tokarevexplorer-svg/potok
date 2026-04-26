"use client";

import clsx from "clsx";
import { X } from "lucide-react";
import { navSections } from "@/lib/nav";
import SidebarSection from "./SidebarSection";

interface SidebarProps {
  mobileOpen: boolean;
  desktopOpen: boolean;
  onClose: () => void;
  onDesktopLeave: () => void;
}

export default function Sidebar({
  mobileOpen,
  desktopOpen,
  onClose,
  onDesktopLeave,
}: SidebarProps) {
  return (
    <aside
      onMouseLeave={onDesktopLeave}
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

        <button
          type="button"
          onClick={onClose}
          className="focus-ring -mr-2 inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted transition hover:bg-canvas hover:text-ink lg:hidden"
          aria-label="Закрыть меню"
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-6">
        <ul className="flex flex-col gap-6">
          {navSections.map((section) => (
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
