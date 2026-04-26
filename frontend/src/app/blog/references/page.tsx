import AddVideoButton from "@/components/blog/analyst/AddVideoButton";
import AnalystWorkspace from "@/components/blog/analyst/AnalystWorkspace";
import {
  fetchMyCategories,
  fetchTags,
  fetchVideos,
} from "@/lib/videosService";

export const metadata = {
  title: "База референсов — Поток",
};

// Страница всегда динамическая — данные тянутся из Supabase на каждый запрос.
export const dynamic = "force-dynamic";

export default async function ReferencesPage() {
  // Тянем три набора параллельно — они независимы.
  const [videos, myCategories, tags] = await Promise.all([
    fetchVideos(),
    fetchMyCategories(),
    fetchTags(),
  ]);

  return (
    <div className="min-w-0">
      <div className="flex flex-col gap-6 border-b border-line pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-ink-faint">
            Блог · Инструменты
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            База референсов
          </h1>
          <p className="mt-3 max-w-2xl text-base text-ink-muted">
            Разбор сохранённых Reels: статистика, транскрипция, AI-саммари и
            категории. Вставляй ссылки — таблица заполняется автоматически.
          </p>
        </div>

        <AddVideoButton />
      </div>

      <div className="mt-8">
        <AnalystWorkspace
          initialVideos={videos}
          initialMyCategories={myCategories}
          initialTags={tags}
        />
      </div>
    </div>
  );
}
