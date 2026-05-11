// Auth.js v5 (next-auth@beta) — Google OAuth + whitelist на единственный email.
//
// Сессия 1 этапа 2 (Claude_team_stage2.md, пункт 21). Сайт по умолчанию
// открыт всему интернету — закрываем OAuth-логином и проверкой email на
// whitelist. Whitelist хранится в team_settings.whitelisted_email (запись
// key='security') с fallback на ENV WHITELISTED_EMAIL.
//
// strategy: "jwt" — никаких таблиц adapter не нужно, сессия живёт в
// HttpOnly-куке. NEXTAUTH_SECRET общий с бэкендом (Railway): backend проверяет
// собственный JWT, который подписывает proxy `/api/team-proxy/*` тем же
// секретом, не сам NextAuth-токен (см. apiClient.ts).

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { isWhitelisted } from "@/lib/whitelist";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/auth/signin",
    error: "/auth/error",
  },
  callbacks: {
    // signIn: блокируем чужие email на самом раннем этапе — NextAuth
    // перенаправит на pages.error со страницей «Доступ закрыт».
    async signIn({ user }) {
      const email = user?.email;
      if (!email) return false;
      const ok = await isWhitelisted(email);
      return ok;
    },
    // JWT: при первом логине пишем email в токен. На последующих вызовах
    // токен уже содержит email из предыдущего callback'а.
    async jwt({ token, user }) {
      if (user?.email) {
        token.email = user.email.toLowerCase();
      }
      return token;
    },
    // Session: пробрасываем email в session.user для UI.
    async session({ session, token }) {
      if (session.user && typeof token.email === "string") {
        session.user.email = token.email;
      }
      return session;
    },
  },
});
