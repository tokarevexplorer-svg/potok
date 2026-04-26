// Типы для addVideoBatchAction. Файлы с "use server" могут экспортировать
// только async-функции, поэтому интерфейсы вынесены отдельно.

export interface AddVideoBatchState {
  status: "idle" | "success" | "error";
  /** Сколько строк было распарсено всего. */
  totalLines?: number;
  /** Сколько уникальных валидных URL вышло из парсинга. */
  parsed?: number;
  /** Сколько действительно вставлено (без уже существующих в БД). */
  inserted?: number;
  /** Сколько было отброшено как дубли (внутри пачки + уже в БД). */
  duplicates?: number;
  /** Невалидные строки — образец до 10 штук. */
  invalid?: string[];
  /** Текст ошибки при общем фейле. */
  error?: string;
}

export const addVideoBatchInitialState: AddVideoBatchState = { status: "idle" };
