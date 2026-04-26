// Парсер списка ссылок на Instagram Reels.
//
// Влад вставляет текст из заметок Инстаграма / экспорта / своего файла —
// формат разный: по одной на строку, через запятую, с пустыми строками,
// с дублями, с trailing-параметрами (?igsh=...). Нужно вытащить нормализованный
// список Reels-URL и отделить мусор, чтобы показать его пользователю.

// Принимаем /reel/, /reels/ и /p/ — последний используется для общих постов
// Instagram, под которыми тоже бывают видео-Reels (особенно при шеринге из приложения).
const INSTAGRAM_REELS_REGEX =
  /^https?:\/\/(www\.)?instagram\.com\/(reel|reels|p)\/[A-Za-z0-9_-]+\/?(\?.*)?$/i;

export interface ParsedReelsList {
  /** Нормализованные уникальные URL (готовы к insert). */
  urls: string[];
  /** Всего непустых строк в исходнике (для подсчёта дублей и невалидных). */
  totalLines: number;
  /** Сколько повторов отброшено в рамках этой пачки. */
  duplicates: number;
  /** Невалидные строки — не похоже на Reels. Показываем пользователю до 10 штук. */
  invalid: string[];
}

// Нормализация: режем query/hash, чтобы две ссылки на одно видео с разными
// utm/igsh-хвостами считались дублем.
function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (!INSTAGRAM_REELS_REGEX.test(trimmed)) return null;

  // Отрезаем всё после знака вопроса. Для Reels query никогда не несёт смысла.
  const noQuery = trimmed.split("?")[0];
  // Принудительно www. — Instagram всё равно редиректит, нам важна стабильная форма для unique-индекса.
  return noQuery.replace(/^https?:\/\/(www\.)?instagram\.com/i, "https://www.instagram.com");
}

export function parseReelsList(text: string): ParsedReelsList {
  const lines = text
    // запятая и точка с запятой тоже используются как разделители — людям так удобнее
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const seen = new Set<string>();
  const urls: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;

  for (const line of lines) {
    const normalized = normalizeUrl(line);
    if (!normalized) {
      if (invalid.length < 10) invalid.push(line.slice(0, 200));
      continue;
    }
    if (seen.has(normalized)) {
      duplicates += 1;
      continue;
    }
    seen.add(normalized);
    urls.push(normalized);
  }

  return { urls, totalLines: lines.length, duplicates, invalid };
}

// Лимиты выставлены на UI:
// - предупреждение начинаем показывать с 500 (стоит денег за Apify+OpenAI)
// - hard-stop на 2000, выше Supabase insert уже неудобный
export const MAX_BATCH_SIZE = 2000;
export const WARN_BATCH_SIZE = 500;

// Грубая оценка стоимости и времени для UI. Намеренно с диапазоном —
// зависит от тарифа Apify, длины видео для Whisper и т.п.
export interface BatchEstimate {
  costMin: number;
  costMax: number;
  hoursMin: number;
  hoursMax: number;
}

export function estimateBatch(count: number, concurrency = 2): BatchEstimate {
  // Apify ~ $0.001–0.003 за результат, Whisper $0.006/мин (видео 0.3–1.5 мин),
  // GPT-4o-mini копейки. Берём $0.003–$0.008 на видео сверху.
  const costMin = +(count * 0.003).toFixed(2);
  const costMax = +(count * 0.008).toFixed(2);
  // Среднее время на одно видео: 60–120 сек (Apify + Whisper + AI).
  // С учётом конкурентности — делим на N воркеров.
  const hoursMin = +((count * 60) / concurrency / 3600).toFixed(1);
  const hoursMax = +((count * 120) / concurrency / 3600).toFixed(1);
  return { costMin, costMax, hoursMin, hoursMax };
}
