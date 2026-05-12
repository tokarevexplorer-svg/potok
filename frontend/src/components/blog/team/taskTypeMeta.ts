// Маппинги «тип задачи / статус → русские подписи и цвета». Вынесено в отдельный
// файл, чтобы и канбан, и просмотр, и модалка запуска тянули один источник.

import type { TeamTaskStatus, TeamTaskType } from "@/lib/team/types";

export const TASK_TYPE_LABELS: Record<string, string> = {
  ideas_free: "Идеи (свободные)",
  ideas_questions_for_research: "Идеи (под исследование)",
  research_direct: "Исследование",
  write_text: "Текст",
  edit_text_fragments: "Правка через AI",
  // Сессия 35: задачи разведчика.
  analyze_competitor: "Анализ конкурента",
  search_trends: "Поиск трендов",
  free_research: "Свободный ресёрч",
  // Сессия 37: предпродакшн.
  deep_research_notebooklm: "NotebookLM ресёрч",
  web_research: "Web-ресёрч",
  free_research_with_files: "Ресёрч с файлами",
  find_cross_references: "Пересечения в базах",
  video_plan_from_research: "План видео",
  creative_takes: "Креативные подачи",
  script_draft: "Драфт текста",
  factcheck_artifact: "Фактчек артефакта",
  compare_two_versions: "Сверка версий",
  cold_factcheck: "Холодный фактчек",
  generate_ideas: "Генерация идей",
  review_artifact: "Ревью",
  daily_plan_breakdown: "Декомпозиция плана",
};

export function taskTypeLabel(type: TeamTaskType | string): string {
  return TASK_TYPE_LABELS[type] ?? type;
}

// Группы канбана. archived — спрятана из канбана, но видна в фильтре.
// running — «в процессе»; done — «готово к ревью»; marked_done + revision —
// «на проверке/принято».
export type KanbanColumn = "running" | "done" | "marked_done";

export const KANBAN_COLUMNS: { id: KanbanColumn; label: string; hint: string }[] = [
  { id: "running", label: "В работе", hint: "идёт LLM-вызов" },
  { id: "done", label: "Готово к ревью", hint: "результат ждёт проверки" },
  { id: "marked_done", label: "Готово", hint: "пользователь подтвердил" },
];

// Цветовое кодирование статуса (бейдж + бордер карточки).
export function statusBadge(status: TeamTaskStatus | string): {
  label: string;
  className: string;
} {
  switch (status) {
    case "running":
      return { label: "Идёт", className: "bg-amber-100 text-amber-800" };
    case "done":
      return { label: "Готово", className: "bg-emerald-100 text-emerald-800" };
    case "marked_done":
      return { label: "Принято", className: "bg-blue-100 text-blue-800" };
    case "revision":
      return { label: "На доработке", className: "bg-purple-100 text-purple-800" };
    case "archived":
      return { label: "В архиве", className: "bg-zinc-100 text-zinc-600" };
    case "error":
      return { label: "Ошибка", className: "bg-rose-100 text-rose-800" };
    // Сессия 31: новые статусы.
    case "clarifying":
      return { label: "Уточнения", className: "bg-violet-100 text-violet-800" };
    case "awaiting_input":
      return { label: "Жду ответа", className: "bg-violet-100 text-violet-800" };
    case "awaiting_resource":
      return { label: "Многошаговая", className: "bg-sky-100 text-sky-800" };
    default:
      return { label: String(status), className: "bg-zinc-100 text-zinc-600" };
  }
}

// Соответствие статус → колонка. Ошибки попадают в «В работе» (там видны),
// архив — нигде в основной сетке (он отдельный список под катом). revision
// — пока в «Готово к ревью».
export function statusToColumn(status: TeamTaskStatus | string): KanbanColumn | null {
  if (
    status === "running" ||
    status === "error" ||
    // Сессия 31: clarifying / awaiting_input / awaiting_resource считаются
    // активными — всё, что ещё не завершено. Видны в первой колонке «В работе».
    status === "clarifying" ||
    status === "awaiting_input" ||
    status === "awaiting_resource"
  ) {
    return "running";
  }
  if (status === "done" || status === "revision") return "done";
  if (status === "marked_done") return "marked_done";
  if (status === "archived") return null;
  return "running";
}

// Время «N мин назад / Дата». Без зависимостей — JS Intl.RelativeTimeFormat
// справляется на ru-локали.
const rtf = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });

export function formatRelative(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffSec = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 60) return rtf.format(diffSec, "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 7 * 86_400) return rtf.format(Math.round(diffSec / 86_400), "day");
  // Старше недели — обычная дата.
  return d.toLocaleString("ru", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
