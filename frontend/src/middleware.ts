// Middleware: пускает только аутентифицированных пользователей. Если сессии
// нет — редиректит на /auth/signin с callbackUrl, чтобы после логина
// вернулись на исходный путь.
//
// Whitelist проверять отдельно НЕ нужно: NextAuth не выдаст сессию
// неwhitelisted пользователю (см. callbacks.signIn в auth.ts). То есть
// если сессия есть — email уже прошёл проверку.
//
// Исключение: если в Админке включён «тестовый режим без авторизации»
// (team_settings.dev_mode_until > now()) — пропускаем неавторизованных
// пользователей. Режим автоматически становится невалидным по таймауту,
// никакой крон не нужен. См. lib/devMode.ts и блок в AdminWorkspace.

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDevModeStatus } from "@/lib/devMode";

export default auth(async (req) => {
  if (req.auth?.user?.email) {
    return NextResponse.next();
  }

  // Dev mode: проверяем флаг ДО редиректа. Если активен — пропускаем как
  // если бы сессия была. Внутри 5-секундного кеша (см. lib/devMode).
  const devMode = await getDevModeStatus();
  if (devMode.active) {
    return NextResponse.next();
  }

  // Сохраняем исходный путь, чтобы после логина вернуться сюда.
  const url = new URL("/auth/signin", req.nextUrl.origin);
  const target = req.nextUrl.pathname + req.nextUrl.search;
  // /auth/* пути НЕ должны попадать в callbackUrl — иначе после
  // успешного логина юзера снова кинет на /auth/signin.
  if (!target.startsWith("/auth/") && target !== "/") {
    url.searchParams.set("callbackUrl", target);
  }
  return NextResponse.redirect(url);
});

// Стандартный matcher из доков NextAuth.js v5: пропускаем всё, кроме
// статики Next.js, картинок и /auth/* (страницы логина/ошибки и эндпоинты
// /api/auth/*). Маршрут /api/team-proxy/* ОСТАЁТСЯ под защитой —
// неавторизованный браузер на него не попадёт. Сам прокси, на случай если
// middleware будет обойдено, дополнительно перепроверит сессию.
export const config = {
  matcher: [
    "/((?!api/auth|auth/signin|auth/error|_next/static|_next/image|favicon\\.ico|icon\\.svg|apple-icon\\.svg|robots\\.txt|sitemap\\.xml).*)",
  ],
};
