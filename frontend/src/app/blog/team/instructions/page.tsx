import TeamPageHeader from "@/components/blog/team/TeamPageHeader";
import PromptsWorkspace from "@/components/blog/team/PromptsWorkspace";
import { createSupabaseServerClient } from "@/lib/supabaseClient";
import type { PromptTemplateEntry } from "@/lib/team/teamPromptsService";

export const metadata = {
  title: "Промпты команды — Поток",
};

export const dynamic = "force-dynamic";

async function loadPromptTemplates(): Promise<PromptTemplateEntry[]> {
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.storage.from("team-prompts").list("", {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      console.warn("[team] prompts list failed:", error.message);
      return [];
    }
    return (data ?? [])
      .filter((row) => row.name && row.name.endsWith(".md") && row.id !== null)
      .map((row) => {
        const md = (row.metadata ?? null) as { size?: number } | null;
        return {
          name: row.name,
          updatedAt: row.updated_at ?? null,
          size: md?.size ?? null,
        };
      });
  } catch (err) {
    console.warn("[team] prompts list error:", err);
    return [];
  }
}

export default async function TeamPromptsPage() {
  const templates = await loadPromptTemplates();
  return (
    <div className="min-w-0">
      <TeamPageHeader
        title="Промпты"
        description="Шаблоны промптов для пяти типов задач команды. Слева — список, справа — markdown-редактор. {{плейсхолдеры}} заменяются на значения из формы запуска и из Базы (context, concept)."
        showBackLink
      />

      <div className="mt-8">
        <PromptsWorkspace initialTemplates={templates} />
      </div>
    </div>
  );
}
