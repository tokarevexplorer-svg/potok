"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/auth/signin" })}
      className="w-full inline-flex items-center justify-center rounded-2xl border border-line bg-elevated px-5 py-3 text-sm font-medium text-ink shadow-card hover:bg-canvas transition"
    >
      Выйти
    </button>
  );
}
