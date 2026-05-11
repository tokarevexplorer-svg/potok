// Чтение whitelisted email из team_settings (запись key='security') с
// fallback на ENV WHITELISTED_EMAIL.
//
// Используется backend/src/middleware/requireAuth.js для финальной сверки
// email из JWT с тем, что считается «разрешённым» в данный момент. Поэтому
// эта функция дёргается на каждом запросе к /api/team/* — кешируем в
// памяти на короткий TTL, чтобы не давить на БД и не платить latency на
// каждом запросе.

import { getServiceRoleClient } from "./teamSupabase.js";

const SECURITY_KEY = "security";
const CACHE_TTL_MS = 30_000;

let cache = { value: null, fetchedAt: 0 };

export function clearWhitelistCache() {
  cache = { value: null, fetchedAt: 0 };
}

export async function getWhitelistedEmail() {
  const now = Date.now();
  if (now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.value;
  }

  let dbEmail = null;
  try {
    const client = getServiceRoleClient();
    const { data, error } = await client
      .from("team_settings")
      .select("whitelisted_email")
      .eq("key", SECURITY_KEY)
      .maybeSingle();
    if (!error && data && typeof data.whitelisted_email === "string") {
      const value = data.whitelisted_email.trim().toLowerCase();
      if (value) dbEmail = value;
    }
  } catch (err) {
    console.warn("[whitelistService] не удалось прочитать team_settings:", err);
  }

  const envEmail = process.env.WHITELISTED_EMAIL
    ? process.env.WHITELISTED_EMAIL.trim().toLowerCase()
    : null;

  const effective = dbEmail ?? envEmail;
  cache = { value: effective, fetchedAt: now };
  return effective;
}

export async function getWhitelistedEmailSources() {
  // Версия с источниками для UI «Безопасность доступа» (Сессия 2).
  let dbEmail = null;
  try {
    const client = getServiceRoleClient();
    const { data, error } = await client
      .from("team_settings")
      .select("whitelisted_email")
      .eq("key", SECURITY_KEY)
      .maybeSingle();
    if (!error && data && typeof data.whitelisted_email === "string") {
      const value = data.whitelisted_email.trim().toLowerCase();
      if (value) dbEmail = value;
    }
  } catch (err) {
    console.warn("[whitelistService] не удалось прочитать team_settings:", err);
  }
  const envEmail = process.env.WHITELISTED_EMAIL
    ? process.env.WHITELISTED_EMAIL.trim().toLowerCase()
    : null;
  return {
    db_email: dbEmail,
    env_email: envEmail,
    effective_email: dbEmail ?? envEmail,
  };
}

export async function isWhitelisted(email) {
  if (!email || typeof email !== "string") return false;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return false;
  const allowed = await getWhitelistedEmail();
  return allowed !== null && allowed === normalized;
}
