import TeamPageHeader from "@/components/blog/team/TeamPageHeader";
import CandidatesWorkspace from "@/components/blog/team/CandidatesWorkspace";

// Сессия 15: экран «Кандидаты в правила». Сжатие эпизодов
// (npm run compress:episodes -- --agent <id>) создаёт записи в
// team_agent_memory со статусом 'candidate'; здесь они отображаются с
// тремя действиями: «Принять», «Принять с правкой», «Отклонить».
//
// Сам экран — клиентский (нужна интерактивность для inline-редактирования
// и оптимистичных обновлений), серверный wrapper только задаёт metadata.

export const metadata = {
  title: "Кандидаты в правила — Поток",
};

export const dynamic = "force-dynamic";

export default function CandidatesPage() {
  return (
    <div className="min-w-0">
      <TeamPageHeader
        title="Кандидаты в правила"
        description="Паттерны, извлечённые из эпизодов обратной связи. Одобренные кандидаты становятся правилами Memory агента и идут в промпт."
        showBackLink
      />
      <CandidatesWorkspace />
    </div>
  );
}
