// Цветная пилюля для категории/тега. Без интерактива — её оборачивают
// внешние компоненты (поповер, фильтр и т.п.).

import clsx from "clsx";
import { ENTITY_COLORS, type EntityColor } from "@/lib/tagColors";

type Size = "sm" | "md";

interface EntityChipProps {
  name: string;
  color: EntityColor;
  size?: Size;
  className?: string;
}

const sizeClasses: Record<Size, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-xs",
};

export default function EntityChip({
  name,
  color,
  size = "md",
  className,
}: EntityChipProps) {
  const c = ENTITY_COLORS[color];
  return (
    <span
      className={clsx(
        "inline-flex max-w-full items-center rounded-full border font-medium",
        c.chip,
        sizeClasses[size],
        className,
      )}
    >
      <span className="truncate">{name}</span>
    </span>
  );
}
