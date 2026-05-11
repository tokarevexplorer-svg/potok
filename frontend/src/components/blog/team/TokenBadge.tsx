"use client";

// Сессия 28: бейдж с количеством токенов, прицепляется к редактору
// инструктивного файла. Считает на клиенте через js-tiktoken
// (encoding cl100k_base) — приближение для Claude/GPT-4 ±10%.
//
// Пересчёт через debounce 500ms после остановки ввода — не на каждый
// keystroke, чтобы не дёргать WASM-encoder в HMR-dev'е.

import { useEffect, useState } from "react";
import {
  countTokens,
  formatTokenCount,
  getTokenBadgeColor,
} from "@/lib/tokenCounter";

interface Props {
  text: string;
  /** debounce в миллисекундах. Дефолт 500 — компромисс между «живой» обновляемостью и нагрузкой. */
  debounceMs?: number;
}

export default function TokenBadge({ text, debounceMs = 500 }: Props) {
  const [count, setCount] = useState<number>(() => countTokens(text));

  useEffect(() => {
    const handle = setTimeout(() => {
      setCount(countTokens(text));
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [text, debounceMs]);

  if (!text) return null;
  const color = getTokenBadgeColor(count);

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full bg-canvas px-2 py-0.5 text-xs"
      title="Приблизительно — encoding cl100k_base, ±10% от реального счёта моделей"
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden
      />
      <span style={{ color }}>{formatTokenCount(count)} токенов</span>
    </span>
  );
}
