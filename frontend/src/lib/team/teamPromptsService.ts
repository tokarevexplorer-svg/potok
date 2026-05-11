// Чтение шаблонов промптов из bucket team-prompts. Запись — через
// teamBackendClient.savePromptTemplate (service-role на бэкенде).

import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

const BUCKET = "team-prompts";

export interface PromptTemplateEntry {
  name: string;
  updatedAt: string | null;
  size: number | null;
}

// Список шаблонов задач (после Сессии 4 — лежат в подпапке `task-templates/`,
// имена на латинице со слэшем и дефисом — Supabase Storage не принимает
// кириллицу и пробелы). Имена возвращаются с префиксом папки, чтобы их
// можно было сразу передать в readPromptTemplate без догадок.
export async function listPromptTemplates(): Promise<PromptTemplateEntry[]> {
  const supabase = getSupabaseBrowserClient();
  const folder = "task-templates";
  const { data, error } = await supabase.storage.from(BUCKET).list(folder, {
    limit: 1000,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) {
    throw new Error(`Не удалось получить список шаблонов: ${error.message}`);
  }
  return (data ?? [])
    .filter((row) => row.name && row.name.endsWith(".md") && row.id !== null)
    .map((row) => {
      const md = (row.metadata ?? null) as { size?: number } | null;
      return {
        name: `${folder}/${row.name}`,
        updatedAt: row.updated_at ?? null,
        size: md?.size ?? null,
      };
    });
}

// Принимает либо имя файла, либо полный путь внутри bucket'а
// (`strategy/mission.md`). Пути строго на латинице — Storage отбивает
// кириллицу и пробелы (`Invalid key`).
export async function readPromptTemplate(name: string): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const filename = name.endsWith(".md") ? name : `${name}.md`;
  const { data, error } = await supabase.storage.from(BUCKET).download(filename);
  if (error) throw new Error(`Не удалось скачать шаблон ${filename}: ${error.message}`);
  if (!data) throw new Error(`Шаблон ${filename} пуст`);
  return await data.text();
}
