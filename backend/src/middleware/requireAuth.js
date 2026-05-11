// Express middleware: проверяет JWT в заголовке Authorization и сверяет
// email с whitelist. Используется на всех `/api/team/*` маршрутах.
//
// Что за JWT: подписан фронтендом (Vercel /api/team-proxy/* или server-side
// fetchBackend) теми же `NEXTAUTH_SECRET` + алгоритм HS256. Это НЕ нативный
// JWT NextAuth (Auth.js v5 по умолчанию использует JWE — расшифровать его
// на бэкенде сложнее, нужен derived key через HKDF). Вместо этого фронт
// подписывает простой HS256-токен с email в payload. NEXTAUTH_SECRET общий
// (он лежит и на Vercel, и на Railway).
//
// Любой запрос без валидного токена → 401. Email не в whitelist → 403.
// Все сообщения — на русском, в стиле остального кода Потока.

import jwt from "jsonwebtoken";
import { isWhitelisted } from "../services/team/whitelistService.js";

const TOKEN_TTL_SEC = 5 * 60; // ровно столько, сколько подписывает фронт (с запасом)

export function requireAuth(req, res, next) {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    console.error(
      "[requireAuth] не задан NEXTAUTH_SECRET — авторизация не работает.",
    );
    return res.status(500).json({
      error:
        "Сервер не настроен: отсутствует NEXTAUTH_SECRET (нужна одинаковая переменная на Vercel и Railway).",
    });
  }

  const header = req.headers.authorization ?? req.headers.Authorization;
  if (!header || typeof header !== "string" || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Не авторизован" });
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    return res.status(401).json({ error: "Не авторизован" });
  }

  let payload;
  try {
    payload = jwt.verify(token, secret, {
      algorithms: ["HS256"],
      // jsonwebtoken сам проверяет exp если он есть в payload.
      // maxAge добавочно ограничивает «срок жизни» относительно iat,
      // даже если фронт забыл выставить exp.
      maxAge: TOKEN_TTL_SEC,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "неизвестно";
    return res.status(401).json({ error: `Неверный токен: ${reason}` });
  }

  const email =
    payload && typeof payload === "object" && typeof payload.email === "string"
      ? payload.email.trim().toLowerCase()
      : null;
  if (!email) {
    return res.status(401).json({ error: "В токене нет email" });
  }

  // Финальный гейт: даже если NEXTAUTH_SECRET утёк и кто-то подписал валидный
  // токен на чужой email — мы блокируем тут.
  isWhitelisted(email)
    .then((ok) => {
      if (!ok) {
        return res.status(403).json({ error: "Доступ закрыт" });
      }
      req.user = { email };
      next();
    })
    .catch((err) => {
      console.error("[requireAuth] ошибка проверки whitelist:", err);
      res.status(500).json({ error: "Не удалось проверить whitelist" });
    });
}
