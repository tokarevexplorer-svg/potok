import TeamPageHeader from "@/components/blog/team/TeamPageHeader";

export const metadata = {
  title: "Постпродакшн — Поток",
};

// Раздел отложен до второй волны команды — страница приглушённая,
// чтобы визуально передать состояние «ещё не запущено».
export default function TeamPostProductionPage() {
  return (
    <div className="min-w-0 opacity-70">
      <TeamPageHeader
        title="Постпродакшн"
        description="Появится позже."
        showBackLink
      />

      <div className="mt-8 max-w-2xl rounded-2xl border border-line bg-elevated p-6 shadow-card">
        <p className="text-sm text-ink-muted">
          Постпродакшн раскатывается во второй волне команды, когда наберётся
          первый опыт работы с предпродакшном и появятся реальные материалы для
          съёмок.
        </p>
      </div>
    </div>
  );
}
