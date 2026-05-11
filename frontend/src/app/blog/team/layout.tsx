import TeamAlertBanner from "@/components/blog/team/TeamAlertBanner";
import DevModeBanner from "@/components/blog/team/DevModeBanner";

// Общий layout для /blog/team/* — рендерит алерт-баннеры поверх любой
// внутренней страницы. Сам по себе layout — не страница, поэтому здесь
// нет TeamPageHeader: это компонент конкретных подстраниц.
//
// DevModeBanner — красный «🔓 DEV MODE» при активном тестовом режиме без
// авторизации. Виден на каждой странице раздела, чтобы Влад не забыл
// выключить руками раньше автоотключения.
export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <DevModeBanner />
      <TeamAlertBanner />
      {children}
    </div>
  );
}
