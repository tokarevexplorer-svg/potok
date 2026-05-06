"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { fetchSpendingSafe } from "@/lib/team/teamBackendClient";
import { formatUsd } from "@/lib/team/format";

// Глобальный баннер для всех страниц «Команды»: если суммарные расходы
// превысили порог, заданный в Админке, висит сверху на всех подразделах.
// Дёргается раз в 60 секунд, без поллинга — порог редко переключается.
export default function TeamAlertBanner() {
  const [info, setInfo] = useState<{
    triggered: boolean;
    total: number;
    threshold: number | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const sp = await fetchSpendingSafe();
      if (cancelled) return;
      setInfo(
        sp
          ? {
              triggered: sp.alert_triggered,
              total: sp.total_usd,
              threshold: sp.alert_threshold_usd,
            }
          : null,
      );
    }
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  if (!info?.triggered || info.threshold === null) return null;
  return (
    <div className="mb-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
      <AlertTriangle size={18} className="mt-0.5 flex-shrink-0" />
      <div className="flex-1">
        <p className="font-semibold">Расходы превысили заданный порог</p>
        <p className="mt-0.5 text-rose-800/80">
          Потрачено {formatUsd(info.total)} из {formatUsd(info.threshold)}. Запуски новых
          задач не блокируются автоматически — реши, что делать дальше.
        </p>
      </div>
      <Link
        href="/blog/team/admin"
        className="focus-ring whitespace-nowrap rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
      >
        К Админке
      </Link>
    </div>
  );
}
