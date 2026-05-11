import SignInButton from "./SignInButton";

// Серверный компонент — экран приглашения войти через Google. Сам процесс
// логина запускается клиентским SignInButton (signIn нельзя дёргать с
// сервера без формы action).

export const metadata = {
  title: "Войти — Поток",
};

export default function SignInPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 bg-canvas text-ink">
      <div className="w-full max-w-sm space-y-8 text-center">
        <div className="space-y-2">
          <h1 className="font-display text-4xl font-semibold">Поток</h1>
          <p className="text-sm text-muted">
            Доступ только для авторизованного пользователя.
          </p>
        </div>
        <SignInButton />
      </div>
    </main>
  );
}
