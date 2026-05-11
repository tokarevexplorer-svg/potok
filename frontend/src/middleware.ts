// Middleware: пускает только аутентифицированных пользователей. Если сессии
// нет — редиректит на /auth/signin с callbackUrl, чтобы после логина
// вернулись на исходный путь.
//
// Whitelist проверять отдельно НЕ нужно: NextAuth не выдаст сессию
// неwhitelisted пользователю (см. callbacks.signIn в auth.ts). То есть
// если сессия есть — email уже прошёл проверку.

import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
  if (req.auth?.user?.email) {
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
