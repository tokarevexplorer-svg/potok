// apiClient — единая точка обращения к Railway-бэкенду с JWT-аутентификацией.
//
// Архитектурный контекст: BACKEND_URL — серверная переменная (без NEXT_PUBLIC_),
// в браузер не уезжает. Поэтому есть два пути:
//
//   1. Server-side (server components, route handlers, server actions):
//      `fetchBackend()` сам подписывает HS256-JWT с email из сессии Auth.js v5
//      и идёт напрямую на BACKEND_URL.
//
//   2. Browser:
//      Клиентские компоненты НЕ могут подписать JWT — у них нет доступа к
//      `auth()` и к NEXTAUTH_SECRET. Они должны идти через прокси
//      `/api/team-proxy/[...path]/route.ts`, который сам вытягивает email
//      через `auth()` и подписывает токен серверной стороной.
//
// Токен короткоживущий (5 минут). Логика проверки токена — в
// backend/src/middleware/requireAuth.js: HS256, `algorithms: ["HS256"]`,
// тот же NEXTAUTH_SECRET, что и здесь.
//
// Шифровать NextAuth JWT (JWE по умолчанию) и расшифровывать на бэкенде —
// тяжелее: пришлось бы тянуть `jose` + HKDF-производный ключ. Подписанный
// HS256 эквивалентен по гарантиям (тот же общий секрет), проще и понятнее.

import "server-only";
import jwt from "jsonwebtoken";
import { auth } from "@/auth";

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.RAILWAY_BACKEND_URL ?? null;

const TOKEN_TTL_SEC = 5 * 60;

export class BackendAuthRequiredError extends Error {
  constructor(message = "Не авторизован") {
    super(message);
    this.name = "BackendAuthRequiredError";
  }
}

// Подписывает короткоживущий JWT для общения с бэкендом. Используется и в
// apiClient (server-side), и в прокси `/api/team-proxy/*`.
export function signBackendToken(email: string): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Не задана переменная NEXTAUTH_SECRET — токен подписать нечем (нужна одна и та же переменная на Vercel и Railway).",
    );
  }
  if (!email || typeof email !== "string") {
    throw new Error("signBackendToken: email обязателен.");
  }
  return jwt.sign({ email: email.trim().toLowerCase() }, secret, {
    algorithm: "HS256",
    expiresIn: TOKEN_TTL_SEC,
  });
}

// Достаёт email текущей сессии Auth.js v5. Возвращает null если сессии нет
// (вызывающий пусть решает — кидать 401 или редиректить).
export async function getCurrentEmail(): Promise<string | null> {
  const session = await auth();
  return session?.user?.email ?? null;
}

// Server-only: ходит напрямую в BACKEND_URL, подкладывая Authorization Bearer.
// Возвращает «сырое» Response — caller сам разбирает JSON/обрабатывает статусы.
//
// Для клиентских компонентов используйте `teamBackendClient.ts` — он идёт
// через прокси `/api/team-proxy/*`, который сам подкладывает auth.
export async function fetchBackend(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  if (!BACKEND_URL) {
    throw new Error(
      "Бэкенд не настроен (нет BACKEND_URL в переменных окружения Vercel).",
    );
  }

  const email = await getCurrentEmail();
  if (!email) {
    throw new BackendAuthRequiredError();
  }

  const token = signBackendToken(email);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${BACKEND_URL}${normalizedPath}`;

  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);

  const { timeoutMs = 30_000, ...rest } = init;

  return fetch(url, {
    ...rest,
    headers,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
}

// Удобный server-side хелпер: GET + JSON-парсинг + try/catch.
// Возвращает null на любой ошибке (нет сессии, бэкенд не отвечает, не-OK
// статус). Подходит для дашбордов, где «не получилось» = «показать —».
export async function fetchBackendJsonSafe<T>(path: string): Promise<T | null> {
  try {
    const res = await fetchBackend(path, { method: "GET" });
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text) as T;
  } catch (err) {
    console.warn(`[apiClient] fetchBackendJsonSafe(${path}) failed:`, err);
    return null;
  }
}
