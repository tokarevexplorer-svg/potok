"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import MobileTopbar from "./MobileTopbar";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Auto-hide на десктопе: меню скрыто по умолчанию, появляется при наведении
  // на левую кромку экрана и прячется, когда мышь покидает sidebar.
  const [desktopOpen, setDesktopOpen] = useState(false);

  // На /auth/* страницах (signin, error) sidebar и контейнер не нужны —
  // эти страницы сами центрируют контент во всё окно. Возвращаем
  // children без обёртки.
  if (pathname?.startsWith("/auth/")) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen w-full">
      <MobileTopbar onOpen={() => setMobileOpen(true)} />

      {/* Тонкая полоска-индикатор у левого края — намёк, что меню есть */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-y-0 left-0 z-30 hidden w-[3px] bg-accent/30 lg:block"
      />

      {/* Hover-зона у левого края (~20px), открывает меню при наведении */}
      <div
        aria-hidden
        onMouseEnter={() => setDesktopOpen(true)}
        className="fixed inset-y-0 left-0 z-40 hidden w-5 lg:block"
      />

      {/* Мобильный оверлей */}
      {mobileOpen && (
        <div
          role="presentation"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-40 bg-ink/30 backdrop-blur-[2px] lg:hidden"
        />
      )}

      <Sidebar
        mobileOpen={mobileOpen}
        desktopOpen={desktopOpen}
        onClose={() => setMobileOpen(false)}
        onDesktopLeave={() => setDesktopOpen(false)}
      />

      <main className="flex-1 min-w-0 overflow-x-hidden pt-16 lg:pt-0">
        <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-12 lg:py-14">
          {children}
        </div>
      </main>
    </div>
  );
}
