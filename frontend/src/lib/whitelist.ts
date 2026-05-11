// Server-only хелпер для чтения и проверки whitelisted email.
//
// Источники в порядке приоритета:
//   1. team_settings.whitelisted_email (запись с key='security') — если задано
//      через UI админки, можно менять без передеплоя.
//   2. process.env.WHITELISTED_EMAIL — fallback. Без него (и без записи в БД)
//      никто не пройдёт логин.
//
// Сравнение email — case-insensitive (Google может присылать смешанный регистр).

import "server-only";
import { createClient } from "@supabase/supabase-js";

const SECURITY_KEY = "security";

let cachedClient: ReturnType<typeof createClient> | null = null;

function getServerClient() {
  if (cachedClient) return cachedClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // service-role предпочтительнее (запрос идёт минуя RLS), но whitelist
  // строка в RLS-открытой таблице — anon тоже подойдёт, если sevice-role
  // не настроен в окружении (например, локально без секретов).
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cachedClient;
}

export async function getWhitelistedEmail(): Promise<string | null> {
  // Сначала пытаемся достать из БД (даёт возможность сменить через админку).
  const client = getServerClient();
  if (client) {
    try {
      const { data, error } = await client
        .from("team_settings")
        .select("whitelisted_email")
        .eq("key", SECURITY_KEY)
        .maybeSingle<{ whitelisted_email: string | null }>();
      if (!error && data?.whitelisted_email) {
        const value = data.whitelisted_email.trim().toLowerCase();
        if (value) return value;
      }
    } catch (err) {
      // БД недоступна — fallback на env. Логируем, чтобы было видно в Vercel.
      console.warn("[whitelist] не удалось прочитать team_settings:", err);
    }
  }
  const envEmail = process.env.WHITELISTED_EMAIL;
  return envEmail ? envEmail.trim().toLowerCase() : null;
}

export async function isWhitelisted(
  email: string | null | undefined,
): Promise<boolean> {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const whitelisted = await getWhitelistedEmail();
  return whitelisted !== null && whitelisted === normalized;
}
