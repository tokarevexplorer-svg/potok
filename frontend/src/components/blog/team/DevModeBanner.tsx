"use client";

import { useEffect, useState } from "react";
import { fetchDevMode, type DevModeStatus } from "@/lib/team/teamBackendClient";

// Красный баннер в шапке всех страниц /blog/team/*, когда dev mode активен.
// Авто-обновление раз в 60 сек: режим может выключиться авто-таймером, и
// баннер должен сам пропасть без перезагрузки. Ошибка fetch'а — молча,
// без баннера: dev mode по дефолту OFF, ошибка == OFF.

function formatUntil(until: string | null): string {
  if (!until) return "—";
  const d = new Date(until);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" });
}

export default function DevModeBanner() {
  const [status, setStatus] = useState<DevModeStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const s = await fetchDevMode();
        if (!cancelled) setStatus(s);
      } catch {
        // Молчим: ошибка чтения == режим выключен с точки зрения UI.
        if (!cancelled) setStatus(null);
      }
    }
    void load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!status?.active) return null;

  return (
    <div className="border-b-2 border-rose-300 bg-rose-100 px-4 py-2 text-center text-sm font-semibold text-rose-900">
      🔓 DEV MODE — авторизация отключена до {formatUntil(status.until)}
    </div>
  );
}
