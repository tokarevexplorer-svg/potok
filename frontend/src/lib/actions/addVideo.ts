"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabaseClient";
import { triggerVideoProcessing } from "@/lib/backendClient";
import type { AddVideoState } from "./addVideo.types";

// Принимаем /reel/, /reels/ и /p/. Instagram отдаёт Reels по всем трём путям:
// /reel/ и /reels/ — разные написания одного и того же, /p/ — общий путь поста,
// под которым может быть и видео-Reels (особенно в шеринге из приложения).
const INSTAGRAM_REELS_REGEX =
  /^https?:\/\/(www\.)?instagram\.com\/(reel|reels|p)\/[A-Za-z0-9_-]+\/?(\?.*)?$/i;

export async function addVideoAction(
  _prev: AddVideoState,
  formData: FormData,
): Promise<AddVideoState> {
  const raw = formData.get("url");
  const url = typeof raw === "string" ? raw.trim() : "";

  if (!url) {
    return { status: "error", error: "Вставь ссылку на Reels." };
  }

  if (!INSTAGRAM_REELS_REGEX.test(url)) {
    return {
      status: "error",
      error:
        "Это не похоже на ссылку Instagram. Пример: https://www.instagram.com/reel/ABC123/ или https://www.instagram.com/p/ABC123/",
    };
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("videos")
    .insert({ url, processing_status: "pending" })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { status: "error", error: "Это видео уже в таблице." };
    }
    return {
      status: "error",
      error: `Не удалось сохранить: ${error.message}`,
    };
  }

  // Запускаем обработку на бэкенде и не ждём ответа — Apify может работать до минуты.
  // Если бэкенд недоступен (например, ещё не развёрнут) — оставляем строку в pending,
  // пользователю показываем успех, а Влад увидит статус в таблице.
  if (data?.id) {
    await triggerVideoProcessing(data.id);
  }

  revalidatePath("/blog/references");
  return { status: "success" };
}
