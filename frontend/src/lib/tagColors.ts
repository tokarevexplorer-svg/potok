// Палитра цветов для категорий и тегов (как в Notion).
// Классы перечислены литерально — нужно для JIT Tailwind: динамически
// собранные `bg-${color}-100` он не увидит и не положит в бандл.

export type EntityColor =
  | "gray"
  | "red"
  | "orange"
  | "amber"
  | "yellow"
  | "green"
  | "teal"
  | "blue"
  | "indigo"
  | "purple"
  | "pink";

export interface ColorClasses {
  chip: string;        // фон + текст + рамка для пилюли
  swatch: string;      // круглый цветной маркер в свотчере
  hover: string;       // hover-стиль строки в выпадайке
}

export const ENTITY_COLORS: Record<EntityColor, ColorClasses> = {
  gray: {
    chip: "bg-gray-100 text-gray-700 border-gray-200",
    swatch: "bg-gray-300",
    hover: "hover:bg-gray-100",
  },
  red: {
    chip: "bg-red-100 text-red-700 border-red-200",
    swatch: "bg-red-400",
    hover: "hover:bg-red-50",
  },
  orange: {
    chip: "bg-orange-100 text-orange-700 border-orange-200",
    swatch: "bg-orange-400",
    hover: "hover:bg-orange-50",
  },
  amber: {
    chip: "bg-amber-100 text-amber-800 border-amber-200",
    swatch: "bg-amber-400",
    hover: "hover:bg-amber-50",
  },
  yellow: {
    chip: "bg-yellow-100 text-yellow-800 border-yellow-200",
    swatch: "bg-yellow-400",
    hover: "hover:bg-yellow-50",
  },
  green: {
    chip: "bg-green-100 text-green-700 border-green-200",
    swatch: "bg-green-400",
    hover: "hover:bg-green-50",
  },
  teal: {
    chip: "bg-teal-100 text-teal-700 border-teal-200",
    swatch: "bg-teal-400",
    hover: "hover:bg-teal-50",
  },
  blue: {
    chip: "bg-blue-100 text-blue-700 border-blue-200",
    swatch: "bg-blue-400",
    hover: "hover:bg-blue-50",
  },
  indigo: {
    chip: "bg-indigo-100 text-indigo-700 border-indigo-200",
    swatch: "bg-indigo-400",
    hover: "hover:bg-indigo-50",
  },
  purple: {
    chip: "bg-purple-100 text-purple-700 border-purple-200",
    swatch: "bg-purple-400",
    hover: "hover:bg-purple-50",
  },
  pink: {
    chip: "bg-pink-100 text-pink-700 border-pink-200",
    swatch: "bg-pink-400",
    hover: "hover:bg-pink-50",
  },
};

export const COLOR_LABELS: Record<EntityColor, string> = {
  gray: "Серый",
  red: "Красный",
  orange: "Оранжевый",
  amber: "Янтарный",
  yellow: "Жёлтый",
  green: "Зелёный",
  teal: "Бирюзовый",
  blue: "Синий",
  indigo: "Индиго",
  purple: "Фиолетовый",
  pink: "Розовый",
};

export const COLOR_KEYS: EntityColor[] = Object.keys(ENTITY_COLORS) as EntityColor[];

// Для новых сущностей — раздаём цвета по кругу из «нескучных» (без серого),
// чтобы соседние теги визуально различались.
const ROTATION: EntityColor[] = [
  "blue",
  "green",
  "amber",
  "purple",
  "pink",
  "teal",
  "orange",
  "indigo",
  "red",
  "yellow",
];

export function pickNextColor(usedCount: number): EntityColor {
  return ROTATION[usedCount % ROTATION.length];
}

export function safeColor(input: string | null | undefined): EntityColor {
  if (input && (input as EntityColor) in ENTITY_COLORS) {
    return input as EntityColor;
  }
  return "gray";
}
