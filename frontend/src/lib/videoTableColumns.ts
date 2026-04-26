// Описание столбцов таблицы видео.
// Группы соответствуют блокам из CLAUDE.md (справочная, статистика, AI, ручные поля).

export type ColumnGroup = "ref" | "stats" | "ai" | "manual";

export interface VideoColumn {
  key: string;
  label: string;
  group: ColumnGroup;
  minWidth: string; // tailwind-класс min-w-*
  align?: "left" | "right";
}

export const columnGroupLabels: Record<ColumnGroup, string> = {
  ref: "Справка",
  stats: "Статистика",
  ai: "AI-содержание",
  manual: "Мои пометки",
};

export const videoColumns: VideoColumn[] = [
  { key: "thumbnail", label: "Превью", group: "ref", minWidth: "min-w-[84px]" },
  { key: "publishedAt", label: "Дата", group: "ref", minWidth: "min-w-[112px]" },
  { key: "author", label: "Автор", group: "ref", minWidth: "min-w-[160px]" },
  { key: "caption", label: "Описание", group: "ref", minWidth: "min-w-[280px]" },

  { key: "views", label: "Просмотры", group: "stats", minWidth: "min-w-[96px]", align: "right" },
  { key: "likes", label: "Лайки", group: "stats", minWidth: "min-w-[84px]", align: "right" },
  { key: "comments", label: "Коммент.", group: "stats", minWidth: "min-w-[92px]", align: "right" },
  // «Шеры» убраны: Instagram не отдаёт этот показатель публично с 2023 г.
  { key: "virality", label: "Вирусность", group: "stats", minWidth: "min-w-[108px]", align: "right" },
  { key: "viralityLevel", label: "Уровень", group: "stats", minWidth: "min-w-[140px]" },

  { key: "aiSummary", label: "Саммари", group: "ai", minWidth: "min-w-[280px]" },
  { key: "transcript", label: "Транскрипция", group: "ai", minWidth: "min-w-[200px]" },
  { key: "aiCategory", label: "Категория AI", group: "ai", minWidth: "min-w-[160px]" },

  { key: "myCategory", label: "Категория Я", group: "manual", minWidth: "min-w-[160px]" },
  { key: "tags", label: "Теги", group: "manual", minWidth: "min-w-[180px]" },
  { key: "note", label: "Заметка", group: "manual", minWidth: "min-w-[220px]" },
];

// Соседний столбец той же группы — для отрисовки сплошной шапки группы.
export function getGroupSpan(group: ColumnGroup): number {
  return videoColumns.filter((c) => c.group === group).length;
}
