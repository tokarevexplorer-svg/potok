import TeamPageHeader from "@/components/blog/team/TeamPageHeader";
import StaffWorkspace from "@/components/blog/team/StaffWorkspace";

export const metadata = {
  title: "Сотрудники — Поток",
};

export default function TeamStaffPage() {
  return (
    <div className="min-w-0">
      <TeamPageHeader
        title="Сотрудники"
        description="Карточки агентов команды. Здесь — простой список; мастер создания и подробная карточка появятся в следующем обновлении."
        showBackLink
      />
      <StaffWorkspace />
    </div>
  );
}
