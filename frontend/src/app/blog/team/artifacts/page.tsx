import TeamPageHeader from "@/components/blog/team/TeamPageHeader";
import DatabaseWorkspace from "@/components/blog/team/DatabaseWorkspace";

export const metadata = {
  title: "Артефакты команды — Поток",
};

export const dynamic = "force-dynamic";

// После Сессии 4 этапа 2 со страницы «Артефакты» убраны вкладки Контекст /
// Концепция: эти два файла переехали в раздел «Инструкции» под именами
// Миссия и Цели на период (bucket team-prompts/strategy/).
// Здесь остаются исходные артефакты задач: исследования, тексты, идеи,
// источники.
export default async function TeamArtifactsPage() {
  return (
    <div className="min-w-0">
      <TeamPageHeader
        title="Артефакты"
        description="Результаты работы команды: исследования, тексты, идеи и источники. Артефакты задач появляются здесь по мере выполнения работы команды."
        showBackLink
      />

      <div className="mt-8">
        <DatabaseWorkspace />
      </div>
    </div>
  );
}
