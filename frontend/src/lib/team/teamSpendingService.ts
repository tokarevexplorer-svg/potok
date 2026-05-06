// Чтение журнала вызовов LLM (team_api_calls) из Supabase для аггрегации
// расходов. Используется на главной /blog/team и в Админке.
//
// Бэкенд в admin.js даёт уже посчитанные сводки (/api/team/admin/spending),
// но на главной нам нужно лишь «сколько за 30 дней» — для этого тяжело
// дёргать бэкенд из server-component, проще посчитать локально.

import { createSupabaseServerClient } from "@/lib/supabaseClient";
import type { TeamApiCall } from "./types";

interface TeamApiCallRow {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  input_tokens: number | null;
  output_tokens: number | null;
  cached_tokens: number | null;
  cost_usd: number | string | null;
  task_id: string | null;
  success: boolean | null;
  error: string | null;
  audio_minutes: number | string | null;
}

function toNumber(value: number | string | null | undefined, fallback = 0): number {
  if (value === null || value === undefined) return fallback;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mapCall(row: TeamApiCallRow): TeamApiCall {
  return {
    id: row.id,
    timestamp: row.timestamp,
    provider: row.provider,
    model: row.model,
    inputTokens: toNumber(row.input_tokens),
    outputTokens: toNumber(row.output_tokens),
    cachedTokens: toNumber(row.cached_tokens),
    costUsd: toNumber(row.cost_usd),
    taskId: row.task_id,
    success: row.success ?? true,
    error: row.error,
    audioMinutes: row.audio_minutes === null ? null : toNumber(row.audio_minutes, 0),
  };
}

// Сумма cost_usd за последние N дней (по умолчанию 30). Считается на сервере.
// Возвращает 0, если вызовов не было — это валидное значение для пустой команды.
export async function fetchSpendingLastNDays(days = 30): Promise<number> {
  const supabase = createSupabaseServerClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("team_api_calls")
    .select("cost_usd")
    .gte("timestamp", since);

  if (error) {
    throw new Error(`Не удалось посчитать расходы команды: ${error.message}`);
  }

  let total = 0;
  for (const row of data ?? []) {
    total += toNumber((row as { cost_usd: number | string | null }).cost_usd);
  }
  return total;
}

// Полный список вызовов за период — для Админки в Сессии 7.
export async function fetchApiCallsLastNDays(days = 30): Promise<TeamApiCall[]> {
  const supabase = createSupabaseServerClient();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("team_api_calls")
    .select(
      "id, timestamp, provider, model, input_tokens, output_tokens, cached_tokens, cost_usd, task_id, success, error, audio_minutes",
    )
    .gte("timestamp", since)
    .order("timestamp", { ascending: false });

  if (error) {
    throw new Error(`Не удалось загрузить вызовы команды: ${error.message}`);
  }
  return (data ?? []).map((r) => mapCall(r as TeamApiCallRow));
}
