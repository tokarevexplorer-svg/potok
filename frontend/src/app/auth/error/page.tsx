import SignOutButton from "./SignOutButton";

// NextAuth редиректит сюда при отказе в `signIn` callback'е (не-whitelisted
// email) или при любой OAuth-ошибке. Сообщение специально нейтральное —
// без объяснения причины (это раздел личного инструмента, не публичный
// продукт с поддержкой).

export const metadata = {
  title: "Доступ закрыт — Поток",
};

export default function AuthErrorPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-canvas text-ink">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-semibold">Доступ закрыт</h1>
          <p className="text-sm text-muted">
            Этот Google-аккаунт не имеет доступа к Потоку.
          </p>
        </div>
        <SignOutButton />
      </div>
    </main>
  );
}
