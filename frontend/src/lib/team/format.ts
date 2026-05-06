// Форматирование для UI команды.

// Деньги в долларах. До 1 цента — показываем 4 знака («$0.0023»), от 1 цента —
// 2 знака («$0.42»). Используем точку как разделитель — деньги в USD читаются
// привычнее с точкой, даже на русской раскладке.
export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  if (value === 0) return "$0.00";
  if (value < 0.01) return `$${value.toFixed(4)}`;
  if (value < 1000) return `$${value.toFixed(2)}`;
  return `$${value.toLocaleString("ru-RU", { maximumFractionDigits: 0 })}`;
}

// Русское склонение количества для одного существительного.
// pluralize(1, ["задача", "задачи", "задач"]) → «задача».
// pluralize(5, ["задача", "задачи", "задач"]) → «задач».
export function pluralize(
  count: number,
  forms: [one: string, few: string, many: string],
): string {
  const abs = Math.abs(count);
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}
