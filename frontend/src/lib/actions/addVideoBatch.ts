"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabaseClient";
import { triggerVideoProcessingBatch } from "@/lib/backendClient";
import { MAX_BATCH_SIZE, parseReelsList } from "@/lib/reelsUrlParser";
import type { AddVideoBatchState } from "./addVideoBatch.types";

// Чанки для insert: Supabase JS-клиент в принципе тянет большие массивы,
// но при тысячах строк безопаснее лить пачками — меньше шансов наткнуться на
// таймаут и понятнее, на каком куске упало.
const INSERT_CHUNK_SIZE = 250;

export async function addVideoBatchAction(
  _prev: AddVideoBatchState,
  formData: FormData,
): Promise<AddVideoBatchState> {
  const raw = formData.get("urls");
  const text = typeof raw === "string" ? raw : "";

  const parsed = parseReelsList(text);

  if (parsed.urls.length === 0) {
    return {
      status: "error",
      error:
        parsed.invalid.length > 0
          ? "Не нашли ни одной валидной ссылки. Проверь формат: https://www.instagram.com/reel/... или https://www.instagram.com/p/..."
          : "Поле пустое. Вставь ссылки на Reels — по одной на строку.",
      totalLines: parsed.totalLines,
      invalid: parsed.invalid,
    };
  }

  if (parsed.urls.length > MAX_BATCH_SIZE) {
    return {
      status: "error",
      error: `Слишком много ссылок: ${parsed.urls.length}. За один раз можно добавить максимум ${MAX_BATCH_SIZE}. Раздели на несколько пачек.`,
      totalLines: parsed.totalLines,
      parsed: parsed.urls.length,
      duplicates: parsed.duplicates,
      invalid: parsed.invalid,
    };
  }

  const supabase = createSupabaseServerClient();
  const insertedIds: string[] = [];

  // Пачками по INSERT_CHUNK_SIZE. Используем onConflict ignore через
  // .upsert({ ignoreDuplicates: true }) — так дубли с уже существующими в БД
  // не валят весь чанк, а просто не возвращаются в data.
  for (let i = 0; i < parsed.urls.length; i += INSERT_CHUNK_SIZE) {
    const chunk = parsed.urls.slice(i, i + INSERT_CHUNK_SIZE);
    const rows = chunk.map((url) => ({ url, processing_status: "pending" }));

    const { data, error } = await supabase
      .from("videos")
      .upsert(rows, { onConflict: "url", ignoreDuplicates: true })
      .select("id");

    if (error) {
      // Если упал первый чанк и мы ничего не вставили — возвращаем ошибку целиком.
      // Если упал не первый — то, что успели, уже в БД и попадёт в очередь
      // recovery'ем при следующем запуске. Сообщаем пользователю частичный успех.
      const inserted = insertedIds.length;
      return {
        status: "error",
        error:
          inserted === 0
            ? `Не удалось сохранить: ${error.message}`
            : `Сохранено ${inserted}, потом упало: ${error.message}. Попробуй ещё раз — повторы отсеются.`,
        totalLines: parsed.totalLines,
        parsed: parsed.urls.length,
        inserted,
        duplicates: parsed.duplicates,
        invalid: parsed.invalid,
      };
    }

    for (const row of data ?? []) insertedIds.push(row.id as string);
  }

  // Сколько из URL не были вставлены — это значит они уже были в БД.
  // duplicates в parsed — только внутри текущей пачки.
  const dupesInDb = parsed.urls.length - insertedIds.length;
  const totalDuplicates = parsed.duplicates + dupesInDb;

  // Дёргаем бэкенд одним запросом со всем списком id. На бэкенде они попадают
  // в общую очередь и обрабатываются по workerConcurrency штук.
  if (insertedIds.length > 0) {
    await triggerVideoProcessingBatch(insertedIds);
  }

  revalidatePath("/blog/references");

  return {
    status: "success",
    totalLines: parsed.totalLines,
    parsed: parsed.urls.length,
    inserted: insertedIds.length,
    duplicates: totalDuplicates,
    invalid: parsed.invalid,
  };
}
