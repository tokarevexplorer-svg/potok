// Описание столбцов таблицы видео.
// Группы соответствуют блокам из CLAUDE.md (справочная, статистика, AI, ручные поля).

export type ColumnGroup = "ref" | "stats" | "ai" | "manual";

export interface VideoColumn {
  key: string;
  label: string;
  group: ColumnGroup;
  // Ширина по умолчанию в px. Текстовые колонки — узкие, ExpandableText
  // обрезает превью; пользователь раскроет полный текст в модалке либо
  // расширит столбец сам через ручку resize.
  defaultWidth: number;
  align?: "left" | "right";
  // true для текстовых столбцов с длинным контентом — у них стоит line-clamp,
  // и они особенно выигрывают от узкой ширины по умолчанию.
  isText?: boolean;
}

export const columnGroupLabels: Record<ColumnGroup, string> = {
  ref: "Справка",
  stats: "Статистика",
  ai: "AI-содержание",
  manual: "Мои пометки",
};

export const DEFAULT_GROUP_ORDER: ColumnGroup[] = ["ref", "stats", "ai", "manual"];

// Минимальная ширина при ручном resize — чтобы столбец нельзя было сжать в ноль.
export const MIN_COLUMN_WIDTH = 64;

// Ширина свёрнутого столбца группы — узкая, помещает только название + chevron.
export const COLLAPSED_GROUP_WIDTH = 48;

// Ширина служебной колонки слева (чекбокс).
export const CHECKBOX_COLUMN_WIDTH = 40;

export const videoColumns: VideoColumn[] = [
  { key: "thumbnail", label: "Превью", group: "ref", defaultWidth: 120 },
  { key: "publishedAt", label: "Дата", group: "ref", defaultWidth: 112 },
  { key: "duration", label: "Хронометраж", group: "ref", defaultWidth: 120 },
  { key: "author", label: "Автор", group: "ref", defaultWidth: 160 },
  { key: "caption", label: "Описание", group: "ref", defaultWidth: 200, isText: true },

  { key: "views", label: "Просмотры", group: "stats", defaultWidth: 96, align: "right" },
  { key: "likes", label: "Лайки", group: "stats", defaultWidth: 84, align: "right" },
  { key: "comments", label: "Коммент.", group: "stats", defaultWidth: 92, align: "right" },
  // «Шеры» убраны: Instagram не отдаёт этот показатель публично с 2023 г.
  { key: "virality", label: "Вирусность", group: "stats", defaultWidth: 108, align: "right" },
  { key: "viralityLevel", label: "Уровень", group: "stats", defaultWidth: 140 },

  { key: "aiSummary", label: "Саммари", group: "ai", defaultWidth: 220, isText: true },
  { key: "transcript", label: "Транскрипция", group: "ai", defaultWidth: 200, isText: true },
  { key: "aiCategory", label: "Категория AI", group: "ai", defaultWidth: 160 },
  { key: "isReference", label: "Референс", group: "ai", defaultWidth: 120 },

  { key: "myCategory", label: "Категория Я", group: "manual", defaultWidth: 160 },
  { key: "tags", label: "Теги", group: "manual", defaultWidth: 180 },
  { key: "note", label: "Заметка", group: "manual", defaultWidth: 200, isText: true },
];

// Возвращает столбцы группы в исходном порядке.
export function columnsInGroup(group: ColumnGroup): VideoColumn[] {
  return videoColumns.filter((c) => c.group === group);
}
