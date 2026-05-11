import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import TeamPageHeader from "@/components/blog/team/TeamPageHeader";

// Сессия 10 этапа 2: заглушка карточки сотрудника. Появилась, чтобы клик
// по карточке агента из списка вёл на осмысленный URL, а не на 404.
// Реальную карточку (вкладки Memory, История, inline-редактирование Role и
// статуса) делает Сессия 11.

interface PageProps {
  params: Promise<{ id: string }>;
}

export const metadata = {
  title: "Карточка сотрудника — Поток",
};

export default async function StaffAgentPage({ params }: PageProps) {
  const { id: rawId } = await params;
  const id = decodeURIComponent(rawId);
  return (
    <div className="min-w-0">
      <TeamPageHeader
        title="Карточка сотрудника"
        description={`Агент «${id}». Подробная карточка появится в следующем обновлении.`}
        showBackLink
      />
      <div className="mt-8 max-w-2xl rounded-2xl border border-line bg-elevated p-6 shadow-card">
        <p className="text-sm text-ink-muted">
          Здесь появятся все органы агента: Identity, Mind (правила и
          эпизоды), Hands (доступы и инструменты), Voice (тон), Clock
          (автономность), Wallet (модель и бюджет), Awareness (карта
          команды). А также история изменений и управление статусом.
        </p>
        <p className="mt-3 text-sm text-ink-muted">
          Пока что — это заглушка. Сейчас агента можно создать через
          мастер и проверить, что он появился в общем списке.
        </p>
        <Link
          href="/blog/team/staff"
          className="focus-ring mt-6 inline-flex items-center gap-1 rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-ink-muted transition hover:border-line-strong hover:text-ink"
        >
          <ChevronLeft size={14} />К списку сотрудников
        </Link>
      </div>
    </div>
  );
}
