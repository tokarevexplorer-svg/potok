"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { Video } from "@/lib/types";

interface BatchProgressBarProps {
  videos: Video[];
}

const POLL_INTERVAL_MS = 5000;

// Прогресс по обработке: пока в БД есть незавершённые видео (pending или processing),
// раз в 5 сек дёргаем router.refresh() — Next перетянет данные из Supabase, и
// в таблицу подтянутся свежие статусы. Когда всё done/error — поллинг останавливается.
//
// Считаем «текущей пачкой» все видео с processing_status pending/processing —
// плюс сколько у них «соседей» в одной волне (то же значение processed_at = null
// и недавнее created_at). По CLAUDE.md решено не плодить таблицу batches:
// Влад редко добавляет несколько пачек подряд, поэтому глобальный счётчик
// полностью отражает то, что он сейчас ждёт.
export default function BatchProgressBar({ videos }: BatchProgressBarProps) {
  const router = useRouter();

  const stats = useMemo(() => {
    let pending = 0;
    let processing = 0;
    let done = 0;
    let error = 0;
    // «Активная волна» — это все строки, у которых ещё нет processed_at,
    // плюс те, что уже завершились (processed_at не null), но при этом
    // у нас осталась хоть одна незавершённая. Так показатель не «обнуляется
    // в ноль» и пользователь видит, как растёт счётчик готовых.
    let waveTotal = 0;
    let waveDone = 0;

    for (const v of videos) {
      const status = v.processingStatus;
      if (status === "pending") pending += 1;
      else if (status === "processing") processing += 1;
      else if (status === "done") done += 1;
      else if (status === "error") error += 1;
    }

    const inFlight = pending + processing;

    // Если активного нет — прогресс-бар скрыт (waveTotal=0).
    if (inFlight === 0) {
      return { inFlight: 0, waveTotal: 0, waveDone: 0, pending, processing, done, error };
    }

    // Берём пачкой все созданные в последние 24 часа: для оценки знаменателя
    // «сколько всего в этой волне». Достаточно близко к ощущению пользователя
    // и устойчиво к старым ошибкам, висящим в БД.
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const v of videos) {
      const created = new Date(v.createdAt).getTime();
      if (created < cutoff) continue;
      waveTotal += 1;
      if (v.processingStatus === "done" || v.processingStatus === "error") {
        waveDone += 1;
      }
    }

    return { inFlight, waveTotal, waveDone, pending, processing, done, error };
  }, [videos]);

  // Поллинг: только пока есть незавершённые. setInterval сам останавливается
  // через cleanup, как только inFlight = 0.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (stats.inFlight === 0) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    if (intervalRef.current) return; // уже идёт
    intervalRef.current = setInterval(() => {
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [stats.inFlight, router]);

  if (stats.inFlight === 0) return null;

  const total = Math.max(stats.waveTotal, 1);
  const completed = stats.waveDone;
  const percent = Math.min(100, Math.round((completed / total) * 100));

  return (
    <div
      className="rounded-xl border border-line bg-surface px-4 py-3 shadow-card"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3">
        <Loader2 size={18} className="shrink-0 animate-spin text-accent" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <div className="text-sm font-medium text-ink">
              Обработка видео: {completed} из {total}
            </div>
            <div className="text-xs text-ink-muted">
              В очереди: {stats.pending} · в работе: {stats.processing}
              {stats.error > 0 ? ` · с ошибкой: ${stats.error}` : ""}
            </div>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-elevated">
            <div
              className="h-full bg-accent transition-[width] duration-500 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-ink-faint">
            Можно закрыть браузер — обработка идёт на сервере. Статусы обновляются автоматически.
          </div>
        </div>
      </div>
    </div>
  );
}
