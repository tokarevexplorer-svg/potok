"use client";

import { SessionProvider } from "next-auth/react";

// Обёртка SessionProvider для root layout. Нужна, чтобы клиентские
// компоненты могли вызывать useSession() / signIn() / signOut() из
// next-auth/react. Сам SessionProvider — client component, поэтому
// обёртка тоже клиентская, root layout остаётся server-component.

export default function AuthSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}
