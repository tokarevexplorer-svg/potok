import TeamPageHeader from "@/components/blog/team/TeamPageHeader";
import SkillCandidatesWorkspace from "@/components/blog/team/SkillCandidatesWorkspace";

// Сессия 27: экран «Кандидаты в навыки». Список pending-кандидатов,
// сгруппированных по агенту; принять / принять с правкой / отклонить.

export const metadata = {
  title: "Кандидаты в навыки — Поток",
};

export const dynamic = "force-dynamic";

export default function SkillCandidatesPage() {
  return (
    <div className="min-w-0">
      <TeamPageHeader
        title="Кандидаты в навыки"
        description="Паттерны, извлечённые из задач с высокой оценкой. Одобренные становятся файлами в team-prompts/agent-skills/<agent_id>/ и попадают в слой Skills промпта."
        showBackLink
      />
      <SkillCandidatesWorkspace />
    </div>
  );
}
