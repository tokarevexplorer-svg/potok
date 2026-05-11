import TeamPageHeader from "@/components/blog/team/TeamPageHeader";
import CreateAgentWizard from "@/components/blog/team/CreateAgentWizard";

export const metadata = {
  title: "Добавить сотрудника — Поток",
};

export default function CreateAgentPage() {
  return (
    <div className="min-w-0">
      <TeamPageHeader
        title="Добавить сотрудника"
        description="Три шага: кто это → должностная инструкция → настройки и проверка. Когда всё проверено, агент сохраняется в команду."
        showBackLink
      />
      <CreateAgentWizard />
    </div>
  );
}
