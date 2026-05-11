import TeamPageHeader from "@/components/blog/team/TeamPageHeader";

export const metadata = {
  title: "Сотрудники — Поток",
};

export default function TeamStaffPage() {
  return (
    <div className="min-w-0">
      <TeamPageHeader
        title="Сотрудники"
        description="Здесь будут карточки агентов команды."
        showBackLink
      />

      <div className="mt-8 max-w-2xl rounded-2xl border border-line bg-elevated p-6 shadow-card">
        <p className="text-sm text-ink-muted">
          Раздел появится на этапе 2. Здесь будут карточки агентов команды — кнопка
          добавления нового сотрудника, список действующих, переход в персональную
          карточку. Пока инфраструктура агентов в разработке.
        </p>
      </div>
    </div>
  );
}
