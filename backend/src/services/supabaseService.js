import { createClient } from "@supabase/supabase-js";
import { env } from "../config/env.js";

// Service-role клиент минует RLS — ни в коем случае не отдавать в браузер.
// Используется только из бэкенда для обновления строк в таблице videos.
const client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

// Все строки, которые ещё не обработаны или застряли в processing
// (например, после рестарта контейнера). Используется при старте бэкенда
// для восстановления очереди.
export async function getUnfinishedVideoIds() {
  const { data, error } = await client
    .from("videos")
    .select("id")
    .in("processing_status", ["pending", "processing"])
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Supabase select unfinished failed: ${error.message}`);
  }
  return (data ?? []).map((row) => row.id);
}

export async function getVideoById(id) {
  const { data, error } = await client
    .from("videos")
    .select("id, url, processing_status")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(`Supabase select failed: ${error.message}`);
  }
  return data;
}

export async function markVideoProcessing(id) {
  const { error } = await client
    .from("videos")
    .update({
      processing_status: "processing",
      processing_error: null,
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Supabase update (processing) failed: ${error.message}`);
  }
}

export async function saveVideoSuccess(id, fields) {
  const { error } = await client
    .from("videos")
    .update({
      ...fields,
      processing_status: "done",
      processing_error: null,
      processed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Supabase update (done) failed: ${error.message}`);
  }
}

export async function saveVideoError(id, message) {
  const { error } = await client
    .from("videos")
    .update({
      processing_status: "error",
      processing_error: message.slice(0, 1000),
      processed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    // Если даже запись ошибки упала — логируем, но не бросаем дальше.
    console.error("Supabase update (error) failed:", error.message);
  }
}

// --- Транскрипция (Whisper) -----------------------------------------------

export async function markTranscriptProcessing(id) {
  const { error } = await client
    .from("videos")
    .update({
      transcript_status: "processing",
      transcript_error: null,
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Supabase update (transcript processing) failed: ${error.message}`);
  }
}

export async function saveTranscriptSuccess(id, text) {
  const { error } = await client
    .from("videos")
    .update({
      transcript: text,
      transcript_status: "done",
      transcript_error: null,
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Supabase update (transcript done) failed: ${error.message}`);
  }
}

export async function saveTranscriptNoSpeech(id) {
  const { error } = await client
    .from("videos")
    .update({
      transcript: null,
      transcript_status: "no_speech",
      transcript_error: null,
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Supabase update (transcript no_speech) failed: ${error.message}`);
  }
}

export async function saveTranscriptError(id, message) {
  const { error } = await client
    .from("videos")
    .update({
      transcript_status: "error",
      transcript_error: message.slice(0, 1000),
    })
    .eq("id", id);

  if (error) {
    console.error("Supabase update (transcript error) failed:", error.message);
  }
}

// --- AI-анализ (саммари + категория) --------------------------------------

export async function markAiProcessing(id) {
  const { error } = await client
    .from("videos")
    .update({
      ai_status: "processing",
      ai_error: null,
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Supabase update (ai processing) failed: ${error.message}`);
  }
}

export async function saveAiSuccess(id, { summary, category, categorySuggestion }) {
  const { error } = await client
    .from("videos")
    .update({
      ai_summary: summary,
      ai_category: category,
      ai_category_suggestion: categorySuggestion,
      ai_status: "done",
      ai_error: null,
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Supabase update (ai done) failed: ${error.message}`);
  }
}

export async function saveAiSkipped(id) {
  const { error } = await client
    .from("videos")
    .update({
      ai_status: "skipped",
      ai_error: null,
    })
    .eq("id", id);

  if (error) {
    throw new Error(`Supabase update (ai skipped) failed: ${error.message}`);
  }
}

export async function saveAiError(id, message) {
  const { error } = await client
    .from("videos")
    .update({
      ai_status: "error",
      ai_error: message.slice(0, 1000),
    })
    .eq("id", id);

  if (error) {
    console.error("Supabase update (ai error) failed:", error.message);
  }
}
