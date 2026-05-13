"use client";

// Сессия 43: уникальная ссылка на задачу. Полноэкранный режим = открытие
// существующего TaskViewerModal на отдельной странице. URL вида
// /blog/team/tasks/<id> можно копировать, отправлять в Telegram, в Inbox,
// в чат — она всегда ведёт сюда.
//
// Архитектурно проще именно так, чем тянуть всю логику модалки в отдельный
// «expanded» layout: модалка живёт `fixed inset-0`, на пустой странице
// выглядит как полноэкранная карточка. onClose → router.push('/dashboard').

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { TeamTask } from "@/lib/team/types";
import { fetchTaskById } from "@/lib/team/teamBackendClient";
import TaskViewerModal from "@/components/blog/team/TaskViewerModal";

export default function TaskFullscreenPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = (params?.id ?? "").trim();

  const [task, setTask] = useState<TeamTask | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!id) {
      setLoading(false);
      setError("Не указан id задачи.");
      return;
    }
    (async () => {
      try {
        const t = await fetchTaskById(id);
        if (cancelled) return;
        if (!t) {
          setError("Задача не найдена.");
        } else {
          setTask(t);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.toLowerCase().includes("404") || msg.toLowerCase().includes("not found")) {
          setError("Задача не найдена.");
        } else {
          setError(`Не удалось загрузить задачу: ${msg}`);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleClose = () => {
    // По UX-договору страницы: после закрытия модалки уходим назад в лог
    // дашборда. router.back() рисковано (если страница открыта по ссылке —
    // history пустой), поэтому жёстко на /dashboard.
    router.push("/blog/team/dashboard");
  };

  const handleTaskUpdated = (updated: TeamTask) => {
    setTask(updated);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-ink-muted">
        <Loader2 size={18} className="mr-2 animate-spin" />
        Загружаем задачу…
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
        <h1 className="font-display text-xl font-semibold tracking-tight">
          {error ?? "Задача не найдена"}
        </h1>
        <p className="mt-3 text-sm text-ink-muted">
          Проверьте ссылку или вернитесь к списку задач.
        </p>
        <button
          type="button"
          onClick={() => router.push("/blog/team/dashboard")}
          className="focus-ring mt-5 inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-accent-strong"
        >
          ← Назад к дашборду
        </button>
      </div>
    );
  }

  return (
    <TaskViewerModal task={task} onClose={handleClose} onTaskUpdated={handleTaskUpdated} />
  );
}
