"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import type { NavLeaf } from "@/lib/nav";

interface SidebarItemProps {
  item: NavLeaf;
  onNavigate: () => void;
}

export default function SidebarItem({ item, onNavigate }: SidebarItemProps) {
  const pathname = usePathname();
  const Icon = item.icon;

  // Плейсхолдер «Скоро»: без href, не кликабельный, с серой плашкой.
  if (!item.href) {
    return (
      <div
        aria-disabled="true"
        className="flex min-h-[40px] items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-faint"
      >
        {Icon && <Icon size={16} className="shrink-0" />}
        <span>{item.label}</span>
        {item.comingSoon && (
          <span className="ml-auto rounded-full bg-line px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-ink-faint">
            скоро
          </span>
        )}
      </div>
    );
  }

  const active =
    !item.disabled &&
    (pathname === item.href || pathname.startsWith(`${item.href}/`));

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={clsx(
        "focus-ring group flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
        active
          ? "bg-surface text-ink shadow-card"
          : "text-ink-muted hover:bg-surface/60 hover:text-ink",
        item.disabled && "opacity-50 hover:opacity-60"
      )}
    >
      {Icon && (
        <Icon
          size={18}
          className={clsx(
            "shrink-0 transition",
            active ? "text-accent" : "text-ink-faint group-hover:text-ink"
          )}
        />
      )}
      <span>{item.label}</span>
    </Link>
  );
}
