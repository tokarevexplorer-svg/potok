// Сессия 28: подсчёт токенов на клиенте через js-tiktoken (cl100k_base).
// Используется для визуального индикатора объёма промпта в редакторах
// инструктивных файлов и в карточке агента.
//
// Счёт приближённый (±10%) — энкодинг cl100k_base ближе всего к реальным
// токенайзерам Claude и GPT-4, но не идентичен им. Этого достаточно для
// визуального сигнала «промпт толстеет».

import { Tiktoken, getEncodingNameForModel } from "js-tiktoken/lite";
import cl100k from "js-tiktoken/ranks/cl100k_base";

let encoder: Tiktoken | null = null;

function getEncoder(): Tiktoken {
  if (!encoder) {
    encoder = new Tiktoken(cl100k);
  }
  return encoder;
}

export function countTokens(text: string | null | undefined): number {
  if (!text) return 0;
  try {
    return getEncoder().encode(text).length;
  } catch {
    // На случай нестандартных символов — грубая оценка через символы.
    return Math.ceil(text.length / 4);
  }
}

export function getTokenBadgeColor(count: number): string {
  if (count < 15_000) return "#22c55e";
  if (count < 25_000) return "#eab308";
  if (count < 40_000) return "#f97316";
  return "#ef4444";
}

export function getTokenBadgeZone(count: number): "green" | "yellow" | "orange" | "red" {
  if (count < 15_000) return "green";
  if (count < 25_000) return "yellow";
  if (count < 40_000) return "orange";
  return "red";
}

export function formatTokenCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return String(count);
}

// Для предотвращения утечек памяти при HMR в dev-режиме.
export function disposeEncoder(): void {
  encoder = null;
}
