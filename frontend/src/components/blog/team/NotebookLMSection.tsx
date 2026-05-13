"use client";

// Сессия 50: блок мониторинга локального NotebookLM-воркера.
// Показывает 🟢/🟡/🔴 на основе давности последнего heartbeat и даёт
// кнопку «Прогнать тест» для проверки, что воркер реально отвечает.

import { useEffect, useRef, useState } from "react";
import { Activity, Loader2, PlayCircle } from "lucide-react";
import {
  fetchNotebookLMStatus,
  fetchNotebookLMTestResult,
  queueNotebookLMTest,
  type NotebookLMStatus,
} from "@/lib/team/teamBackendClient";

const STATUS_META: Record<
  NotebookLMStatus["status"],
  { dot: string; label: string; bg: string }
> = {
  green: {
    dot: "bg-emerald-500",
    label: "🟢 Онлайн",
    bg: "bg-emerald-50 text-emerald-800",
  },
  yellow: {
    dot: "bg-amber-500",
    label: "🟡 Возможно занят",
    bg: "bg-amber-50 text-amber-800",
  },
  red: {
    dot: "bg-rose-500",
    label: "🔴 Офлайн",
    bg: "bg-rose-50 text-rose-800",
  },
  unknown: {
    dot: "bg-ink-faint",
    label: "⊘ Нет данных",
    bg: "bg-canvas text-ink-muted",
  },
};

function describeAge(ms: number | undefined): string {
  if (!Number.isFinite(ms) || ms === undefined || ms === null) return "—";
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec} сек назад`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const hr = Math.floor(min / 60);
  return `${hr} ч ${min % 60} мин назад`;
}

export default function NotebookLMSection() {
  const [status, setStatus] = useState<NotebookLMStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [testBusy, setTestBusy] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadStatus() {
    try {
      const s = await fetchNotebookLMStatus();
      setStatus(s);
    } catch (err) {
      setStatus({
        status: "unknown",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadStatus();
    const id = setInterval(() => void loadStatus(), 30_000);
    return () => clearInterval(id);
  }, []);

  async function handleTest() {
    if (testBusy) return;
    setTestBusy(true);
    setTestMessage("⏳ Ставим задачу в очередь…");
    try {
      const { taskId } = await queueNotebookLMTest();
      if (!taskId) {
        setTestMessage("✗ Бэкенд не вернул taskId");
        setTestBusy(false);
        return;
      }
      // Поллим раз в 3 сек, макс 30 секунд.
      let attempts = 0;
      const maxAttempts = 10;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        attempts += 1;
        try {
          const result = await fetchNotebookLMTestResult(taskId);
          if (result.completed) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setTestBusy(false);
            if (result.status === "done") {
              setTestMessage("✓ Тест пройден — воркер ответил.");
            } else {
              setTestMessage(`✗ Ошибка: ${result.error ?? "воркер вернул ошибку"}`);
            }
          } else if (attempts >= maxAttempts) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            setTestBusy(false);
            setTestMessage(`⏳ Таймаут — воркер не ответил за 30 сек. Текущий статус: ${result.status ?? "?"}.`);
          } else {
            setTestMessage(`⏳ Жду воркера… (${attempts * 3} сек, статус: ${result.status ?? "?"})`);
          }
        } catch (err) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setTestBusy(false);
          setTestMessage(`✗ ${err instanceof Error ? err.message : String(err)}`);
        }
      }, 3_000);
    } catch (err) {
      setTestBusy(false);
      setTestMessage(`✗ ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const meta = STATUS_META[status?.status ?? "unknown"];

  return (
    <section>
      <div className="mb-3">
        <h2 className="font-display text-xl font-semibold tracking-tight">NotebookLM</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Локальный воркер на машине Влада. Шлёт heartbeat каждые ~30 сек.
          Используется для задач глубокого ресёрча по NotebookLM-блокнотам
          (см. этап 5, пункт 17).
        </p>
      </div>

      {loading ? (
        <div className="inline-flex items-center gap-2 text-sm text-ink-muted">
          <Loader2 size={14} className="animate-spin" /> Загружаем статус…
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-elevated p-5 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={
                  "inline-flex h-10 w-10 items-center justify-center rounded-xl bg-canvas"
                }
              >
                <Activity size={18} className="text-ink-muted" />
                <span
                  className={`-ml-2 h-3 w-3 rounded-full ${meta.dot}`}
                  aria-hidden
                />
              </span>
              <div>
                <p className="font-display text-base font-semibold text-ink">{meta.label}</p>
                {status?.lastSeen && (
                  <p className="text-xs text-ink-muted">
                    Последний отклик: {describeAge(status.age_ms)}
                    {status.version ? ` · версия ${status.version}` : ""}
                  </p>
                )}
                {status?.message && !status.lastSeen && (
                  <p className="text-xs text-ink-muted">{status.message}</p>
                )}
                {status?.lastTask && (
                  <p className="text-xs text-ink-faint">
                    Последняя задача: «{status.lastTask.name}»
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void handleTest()}
              disabled={testBusy}
              className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:border-line-strong disabled:opacity-50"
            >
              {testBusy ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <PlayCircle size={14} />
              )}
              Прогнать тест
            </button>
          </div>

          {testMessage && (
            <p className={`mt-3 rounded-lg px-3 py-2 text-sm ${meta.bg}`}>{testMessage}</p>
          )}
        </div>
      )}
    </section>
  );
}
