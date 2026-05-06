import { Settings } from "lucide-react";
import TeamComingSoon from "@/components/blog/team/TeamComingSoon";
import TeamPageHeader from "@/components/blog/team/TeamPageHeader";

export const metadata = {
  title: "Админка команды — Поток",
};

export const dynamic = "force-dynamic";

export default function TeamAdminPage() {
  return (
    <div className="min-w-0">
      <TeamPageHeader
        title="Админка"
        description="Ключи моделей, пресеты, расходы по провайдерам и моделям, алерт по бюджету."
        showBackLink
      />

      <TeamComingSoon
        icon={Settings}
        title="Управление командой"
        plannedIn="Сессии 7"
        items={[
          "Ключи Anthropic / OpenAI / Google: статус, добавление, удаление",
          "Расходы: total, по провайдерам, по моделям, помесячно",
          "Порог алерта: уведомление, когда суммарные расходы превысили лимит",
          "Пресеты выбора модели (fast / balanced / best) — редактирование",
        ]}
      />
    </div>
  );
}
