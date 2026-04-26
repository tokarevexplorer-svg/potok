"use client";

import { Menu } from "lucide-react";

interface MobileTopbarProps {
  onOpen: () => void;
}

export default function MobileTopbar({ onOpen }: MobileTopbarProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-30 flex h-16 items-center justify-between border-b border-line bg-elevated/90 px-4 backdrop-blur lg:hidden">
      <button
        type="button"
        onClick={onOpen}
        className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-xl text-ink-muted transition hover:bg-canvas hover:text-ink"
        aria-label="Открыть меню"
      >
        <Menu size={22} />
      </button>

      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-surface font-display text-base font-bold">
          П
        </span>
        <span className="font-display text-base font-semibold tracking-tight">
          Поток
        </span>
      </div>

      <div className="w-11" />
    </header>
  );
}
