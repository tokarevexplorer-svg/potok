import {
  AlertTriangle,
  BookOpen,
  Coins,
  Folder,
  ListTodo,
  Loader2,
  Settings,
} from "lucide-react";
import TeamPageHeader from "@/components/blog/team/TeamPageHeader";
import TeamSectionCard from "@/components/blog/team/TeamSectionCard";
import TeamStatTile from "@/components/blog/team/TeamStatTile";
import { formatUsd, pluralize } from "@/lib/team/format";
import { fetchBackendJsonSafe } from "@/lib/apiClient";
import type { ApiKeysStatus } from "@/lib/team/types";
import { fetchTeamOverview } from "@/lib/team/teamOverviewService";

export const metadata = {
  title: "Команда — Поток",
};

// Главная Команды — живой дашборд: число задач, расходы, статус ключей.
// Не кешируем, на каждый запрос пересчитываем.
export const dynamic = "force-dynamic";

export default async function TeamPage() {
  // Аггрегаты — из Supabase напрямую (RLS открыта). Статус ключей — best-effort
  // через бэкенд: если Railway недоступен, страница всё равно отрендерится.
  const [overview, keysStatus] = await Promise.all([
    fetchTeamOverview(),
    fetchBackendJsonSafe<ApiKeysStatus>("/api/team/admin/keys-status"),
  ]);

  const allKeysOk =
    keysStatus !== null &&
    keysStatus.anthropic &&
    keysStatus.openai &&
    keysStatus.google;

  const tasksHint = `всего ${overview.totalTasksCount} ${pluralize(
    overview.totalTasksCount,
    ["задача", "задачи", "задач"],
  )}`;

  return (
    <div className="min-w-0">
      <TeamPageHeader
        title="Команда"
        description="Инструмент для подготовки контента блога. Здесь живут задачи к LLM, шаблоны промптов, артефакты исследований и админка с ключами и расходами. Полная функциональность раскрывается в разделах ниже."
      />

      <section className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TeamStatTile
          icon={Loader2}
          label="В работе"
          value={String(overview.activeTasksCount)}
          hint={tasksHint}
        />
        <TeamStatTile
          icon={Coins}
          label="Расходы"
          value={formatUsd(overview.spendingLast30Days)}
          hint="за последние 30 дней"
        />
        <TeamStatTile
          icon={allKeysOk ? Settings : AlertTriangle}
          label="Ключи"
          value={
            keysStatus === null
              ? "—"
              : allKeysOk
                ? "Все на месте"
                : "Не хватает"
          }
          hint={
            keysStatus === null
              ? "бэкенд недоступен"
              : allKeysOk
                ? "Anthropic · OpenAI · Google"
                : "проверь Админку"
          }
        />
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
          Разделы
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          Четыре рабочих пространства команды. Каждое — самостоятельный
          инструмент со своим UI.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TeamSectionCard
            href="/blog/team/tasks"
            icon={ListTodo}
            label="Задачи"
            description="Канбан LLM-задач: идеи, исследования, написание текстов. Запуск, ревью, архив."
            badge={
              overview.activeTasksCount > 0
                ? `${overview.activeTasksCount} ${pluralize(overview.activeTasksCount, ["в работе", "в работе", "в работе"])}`
                : undefined
            }
          />
          <TeamSectionCard
            href="/blog/team/instructions"
            icon={BookOpen}
            label="Промпты"
            description="Библиотека шаблонов: 5 типов задач, переменные, разделение system/user, версии."
          />
          <TeamSectionCard
            href="/blog/team/artifacts"
            icon={Folder}
            label="База"
            description="Артефакты команды: исследования, тексты по точкам, идеи, источники, контекст блога."
          />
          <TeamSectionCard
            href="/blog/team/admin"
            icon={Settings}
            label="Админка"
            description="Ключи моделей, пресеты, расходы, алерт по бюджету. Тут же — управление настройками."
            highlight={!allKeysOk}
            badge={!allKeysOk && keysStatus !== null ? "Нужно настроить ключи" : undefined}
          />
        </div>
      </section>
    </div>
  );
}
