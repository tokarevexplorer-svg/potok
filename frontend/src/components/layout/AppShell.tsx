"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Sidebar from "./Sidebar";
import MobileTopbar from "./MobileTopbar";
import NotificationsBell from "./NotificationsBell";

const PIN_STORAGE_KEY = "potok:sidebar-pinned";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  // Auto-hide на десктопе: меню скрыто по умолчанию, появляется при наведении
  // на левую кромку экрана и прячется, когда мышь покидает sidebar.
  const [desktopOpen, setDesktopOpen] = useState(false);
  // Пин — пользовательское предпочтение, живёт в localStorage. Когда включён,
  // sidebar постоянно раскрыт на десктопе независимо от hover.
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(PIN_STORAGE_KEY);
      if (stored === "true") setPinned(true);
    } catch {
      // localStorage недоступен (например, приватный режим) — игнорируем,
      // sidebar просто будет работать в auto-hide.
    }
  }, []);

  const togglePin = () => {
    setPinned((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(PIN_STORAGE_KEY, next ? "true" : "false");
      } catch {
        // см. выше — без localStorage пин действует только до перезагрузки.
      }
      return next;
    });
  };

  // На /auth/* страницах (signin, error) sidebar и контейнер не нужны —
  // эти страницы сами центрируют контент во всё окно. Возвращаем
  // children без обёртки.
  if (pathname?.startsWith("/auth/")) {
    return <>{children}</>;
  }

  // Эффективное состояние десктопного sidebar: пин принудительно держит его
  // открытым, иначе работает обычная hover-логика.
  const desktopVisible = pinned || desktopOpen;

  return (
    <div className="flex min-h-screen w-full">
      <MobileTopbar onOpen={() => setMobileOpen(true)} />

      {/* Тонкая полоска-индикатор у левого края — намёк, что меню есть.
          Когда меню закреплено, индикатор не нужен. */}
      {!pinned && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-y-0 left-0 z-30 hidden w-[3px] bg-accent/30 lg:block"
        />
      )}

      {/* Hover-зона у левого края (~20px), открывает меню при наведении.
          При закреплённом sidebar зона не нужна — меню и так открыто. */}
      {!pinned && (
        <div
          aria-hidden
          onMouseEnter={() => setDesktopOpen(true)}
          className="fixed inset-y-0 left-0 z-40 hidden w-5 lg:block"
        />
      )}

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
        desktopOpen={desktopVisible}
        pinned={pinned}
        onClose={() => setMobileOpen(false)}
        onDesktopLeave={() => setDesktopOpen(false)}
        onTogglePin={togglePin}
      />

      <main
        className={`flex-1 min-w-0 overflow-x-hidden pt-16 lg:pt-0 ${
          pinned ? "lg:pl-72" : ""
        }`}
      >
        <div className="mx-auto w-full min-w-0 max-w-6xl px-4 py-8 sm:px-6 sm:py-10 lg:px-12 lg:py-14">
          {children}
        </div>
      </main>

      {/* Сессия 18: сквозной колокольчик с Inbox. Виден из любой страницы
          раздела (на /auth/* AppShell вообще не оборачивает). */}
      <NotificationsBell />
    </div>
  );
}
