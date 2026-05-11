import TeamPageHeader from "@/components/blog/team/TeamPageHeader";
import InstructionsWorkspace, {
  type InstructionsTree,
} from "@/components/blog/team/InstructionsWorkspace";
import { createSupabaseServerClient } from "@/lib/supabaseClient";

export const metadata = {
  title: "Инструкции команды — Поток",
};

export const dynamic = "force-dynamic";

// Возвращает список .md-файлов в подпапке bucket'а team-prompts без
// расширения. Если папки нет — пустой массив. Сортируется по имени.
async function listFolder(folder: string): Promise<string[]> {
  try {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.storage
      .from("team-prompts")
      .list(folder, {
        limit: 1000,
        sortBy: { column: "name", order: "asc" },
      });
    if (error) {
      console.warn(`[team/instructions] list ${folder} failed:`, error.message);
      return [];
    }
    return (data ?? [])
      .filter((row) => row.name && row.name.endsWith(".md") && row.id !== null)
      .map((row) => row.name.replace(/\.md$/i, ""));
  } catch (err) {
    console.warn(`[team/instructions] list ${folder} error:`, err);
    return [];
  }
}

// Стратегия — фиксированный обязательный набор: Миссия + Цели на период.
// Эти два файла показываем всегда, даже если их ещё нет в Storage (первое
// сохранение создаст файл). Любые дополнительные файлы в `strategy/`
// (например, author-profile.md из этапа 2, пункт 9) подмешиваем сверху.
const STRATEGY_REQUIRED = ["mission", "goals"];

async function loadInstructionsTree(): Promise<InstructionsTree> {
  const [strategyFound, roles, templates, tools] = await Promise.all([
    listFolder("strategy"),
    listFolder("roles"),
    listFolder("task-templates"),
    listFolder("tools"),
  ]);
  const extra = strategyFound
    .filter((slug) => !STRATEGY_REQUIRED.includes(slug))
    .sort();
  const strategy = [...STRATEGY_REQUIRED, ...extra];
  return { strategy, roles, templates, tools };
}

export default async function TeamInstructionsPage() {
  const tree = await loadInstructionsTree();
  return (
    <div className="min-w-0">
      <TeamPageHeader
        title="Инструкции"
        description="Что команда знает о проекте: миссия, цели на период, должностные инструкции (появятся в этапе 2) и шаблоны задач. Клик по файлу открывает markdown-редактор."
        showBackLink
      />

      <div className="mt-8">
        <InstructionsWorkspace initialTree={tree} />
      </div>
    </div>
  );
}
