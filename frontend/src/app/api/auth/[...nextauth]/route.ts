// NextAuth route handler — Auth.js v5 паттерн. Все OAuth-эндпоинты
// (/api/auth/signin, /callback/google, /signout и т.д.) обслуживаются
// одним catch-all маршрутом.

import { handlers } from "@/auth";

export const { GET, POST } = handlers;
