import { Folder } from "lucide-react";
import TeamComingSoon from "@/components/blog/team/TeamComingSoon";
import TeamPageHeader from "@/components/blog/team/TeamPageHeader";

export const metadata = {
  title: "База команды — Поток",
};

export const dynamic = "force-dynamic";

export default function TeamDatabasePage() {
  return (
    <div className="min-w-0">
      <TeamPageHeader
        title="База"
        description="Артефакты команды: исследования, тексты по точкам экскурсий, идеи, источники, контекст блога."
        showBackLink
      />

      <TeamComingSoon
        icon={Folder}
        title="Файлы артефактов"
        plannedIn="Сессии 7"
        items={[
          "Папки: research/, texts/<точка>/, ideas/, sources/, uploads/",
          "Корневые файлы: context.md, concept.md — общий контекст блога",
          "Просмотр и редактирование markdown-артефактов прямо в браузере",
          "Загрузка PDF/файлов как источников для будущих задач",
        ]}
      />
    </div>
  );
}
