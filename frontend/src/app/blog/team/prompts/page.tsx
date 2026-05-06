import { BookOpen } from "lucide-react";
import TeamComingSoon from "@/components/blog/team/TeamComingSoon";
import TeamPageHeader from "@/components/blog/team/TeamPageHeader";

export const metadata = {
  title: "Промпты команды — Поток",
};

export const dynamic = "force-dynamic";

export default function TeamPromptsPage() {
  return (
    <div className="min-w-0">
      <TeamPageHeader
        title="Промпты"
        description="Библиотека шаблонов промптов команды: 5 типов задач, переменные, разделение system/user, кешируемые блоки."
        showBackLink
      />

      <TeamComingSoon
        icon={BookOpen}
        title="Библиотека шаблонов"
        plannedIn="Сессии 6"
        items={[
          "Список шаблонов: ideas-free, ideas-questions, research-direct, write-text, edit-text-fragments",
          "Markdown-редактор с подсветкой плейсхолдеров {{variable}}",
          "Превью собранного промпта с подставленными переменными",
          "Создание нового шаблона + загрузка из файла",
        ]}
      />
    </div>
  );
}
