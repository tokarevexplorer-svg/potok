import TeamAlertBanner from "@/components/blog/team/TeamAlertBanner";

// Общий layout для /blog/team/* — рендерит алерт-баннер расходов поверх любой
// внутренней страницы. Сам по себе layout — не страница, поэтому здесь
// нет TeamPageHeader: это компонент конкретных подстраниц.
export default function TeamLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <TeamAlertBanner />
      {children}
    </div>
  );
}
