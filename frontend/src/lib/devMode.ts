// Server-only хелпер: читает статус «тестового режима без авторизации» из
// team_settings напрямую (минуя backend). Используется тремя местами:
//   1. middleware.ts — пропускает запросы без сессии при active=true.
//   2. /api/team-proxy/[...path] — синтезирует JWT при active=true.
//   3. layout/header команды — показывает красный баннер.
//
// Семантика «активно»: dev_mode_until не null И > now(). Auto-disable
// декларативно — никакого крона не нужно.
//
// Кеш модульного уровня 5 секунд. middleware Edge переиспользует инстанс
// между запросами, так что один cold start = до 5 сек устаревших данных.
// Допустимо: даже если режим отключён в БД, через 5 сек middleware увидит
// это и снова начнёт редиректить на /auth/signin.

import "server-only";
import { createClient } from "@supabase/supabase-js";

const KEY = "dev_mode";
const CACHE_TTL_MS = 5_000;

export interface DevModeStatus {
  active: boolean;
  until: string | null;
  auto_disable_hours: number;
}

let cache: { value: DevModeStatus | null; fetchedAt: number } = {
  value: null,
  fetchedAt: 0,
};

let cachedClient: ReturnType<typeof createClient> | null = null;

function getClient() {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // anon-ключ ОК: на team_settings RLS открыта (см. миграцию 0012).
  // service-role предпочтительнее, но не везде доступен в Edge runtime.
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

function normalize(row: {
  dev_mode_until: string | null;
  dev_mode_auto_disable_hours: number | null;
} | null): DevModeStatus {
  const auto =
    row && Number.isInteger(row.dev_mode_auto_disable_hours)
      ? Number(row.dev_mode_auto_disable_hours)
      : 12;
  const untilStr = row?.dev_mode_until ?? null;
  if (!untilStr) return { active: false, until: null, auto_disable_hours: auto };
  const untilMs = Date.parse(untilStr);
  if (!Number.isFinite(untilMs))
    return { active: false, until: null, auto_disable_hours: auto };
  return { active: untilMs > Date.now(), until: untilStr, auto_disable_hours: auto };
}

export async function getDevModeStatus(): Promise<DevModeStatus> {
  const now = Date.now();
  if (cache.value && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.value;
  }
  let result: DevModeStatus = { active: false, until: null, auto_disable_hours: 12 };
  const client = getClient();
  if (client) {
    try {
      const { data, error } = await client
        .from("team_settings")
        .select("dev_mode_until, dev_mode_auto_disable_hours")
        .eq("key", KEY)
        .maybeSingle<{
          dev_mode_until: string | null;
          dev_mode_auto_disable_hours: number | null;
        }>();
      if (!error) {
        result = normalize(data);
      } else {
        console.warn("[devMode] не удалось прочитать team_settings:", error.message);
      }
    } catch (err) {
      console.warn("[devMode] исключение при чтении team_settings:", err);
    }
  }
  cache = { value: result, fetchedAt: now };
  return result;
}

export function clearDevModeCache() {
  cache = { value: null, fetchedAt: 0 };
}
