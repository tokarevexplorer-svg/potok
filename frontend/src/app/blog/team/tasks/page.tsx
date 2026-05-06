import { ListTodo } from "lucide-react";
import TeamComingSoon from "@/components/blog/team/TeamComingSoon";
import TeamPageHeader from "@/components/blog/team/TeamPageHeader";

export const metadata = {
  title: "Задачи команды — Поток",
};

export const dynamic = "force-dynamic";

export default function TeamTasksPage() {
  return (
    <div className="min-w-0">
      <TeamPageHeader
        title="Задачи"
        description="Канбан LLM-задач команды: идеи, исследования, написание текстов и AI-правки. Запускай, дорабатывай, архивируй."
        showBackLink
      />

      <TeamComingSoon
        icon={ListTodo}
        title="Канбан задач команды"
        plannedIn="Сессии 6"
        items={[
          "Колонки: «В работе», «Готово к ревью», «Готово», «Архив»",
          "Запуск любой из 5 типов задач с превью промпта и выбором модели",
          "Карточка задачи: артефакт, токены, стоимость, мини-меню действий",
          "AI-правки фрагментов и доп.вопросы — биллинг к родителю",
        ]}
      />
    </div>
  );
}
