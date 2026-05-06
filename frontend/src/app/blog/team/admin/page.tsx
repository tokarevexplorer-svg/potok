import TeamPageHeader from "@/components/blog/team/TeamPageHeader";
import AdminWorkspace from "@/components/blog/team/AdminWorkspace";

export const metadata = {
  title: "Админка команды — Поток",
};

export const dynamic = "force-dynamic";

export default function TeamAdminPage() {
  return (
    <div className="min-w-0">
      <TeamPageHeader
        title="Админка"
        description="Ключи моделей, общие расходы, порог алерта. Всё хранится в Supabase — смена ключа не требует передеплоя."
        showBackLink
      />

      <div className="mt-8">
        <AdminWorkspace />
      </div>
    </div>
  );
}
