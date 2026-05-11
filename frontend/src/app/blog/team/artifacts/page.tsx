import TeamPageHeader from "@/components/blog/team/TeamPageHeader";
import DatabaseWorkspace from "@/components/blog/team/DatabaseWorkspace";
import { createSupabaseServerClient } from "@/lib/supabaseClient";

export const metadata = {
  title: "База команды — Поток",
};

export const dynamic = "force-dynamic";

// Читает текстовый файл из team-database через сервер-supabase. Возвращает
// null, если файла нет или прочитать не получилось — UI покажет пустой
// AutosavingTextEditor, и первое сохранение создаст файл.
async function loadDatabaseText(name: string): Promise<string | null> {
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.storage.from("team-database").download(name);
    if (error || !data) return null;
    return await data.text();
  } catch {
    return null;
  }
}

export default async function TeamDatabasePage() {
  const [context, concept] = await Promise.all([
    loadDatabaseText("context.md"),
    loadDatabaseText("concept.md"),
  ]);

  return (
    <div className="min-w-0">
      <TeamPageHeader
        title="База"
        description="Контекст и концепция блога — это то, что подмешивается во все промпты команды. Артефакты задач (исследования, тексты, идеи) лежат в соответствующих папках."
        showBackLink
      />

      <div className="mt-8">
        <DatabaseWorkspace initialContext={context} initialConcept={concept} />
      </div>
    </div>
  );
}
