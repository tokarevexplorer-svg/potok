import StaffAgentCard from "@/components/blog/team/StaffAgentCard";

// Сессия 11 этапа 2: детальная карточка сотрудника.
// Серверный wrapper только распаковывает params и передаёт id в клиентский
// компонент. Дальше всё — на клиенте, потому что нужна интерактивность
// (inline-edit, табы, история, управление статусом).

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "Карточка сотрудника — Поток",
};

export default async function StaffAgentPage({ params }: PageProps) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  return <StaffAgentCard agentId={id} />;
}
