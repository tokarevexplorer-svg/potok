"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import ArtifactBrowser from "./ArtifactBrowser";

type TabId = "research" | "texts" | "ideas" | "sources";

// Сессия 4 этапа 2: вкладки Контекст / Концепция убраны — эти файлы
// (бывшие context.md / concept.md) переехали в раздел «Инструкции» под
// именами Миссия и Цели на период (bucket team-prompts/Стратегия команды/).
// Остаются артефакты задач команды: исследования, тексты, идеи, источники.
const TABS: { id: TabId; label: string; description: string }[] = [
  {
    id: "research",
    label: "Исследования",
    description:
      "Артефакты задач research_direct и собранные тобой материалы. Папки можно разбивать по темам.",
  },
  {
    id: "texts",
    label: "Тексты",
    description:
      "Версии текстов задач write_text. Каждая точка — своя подпапка, версии — внутри (v1_..., v2_...).",
  },
  {
    id: "ideas",
    label: "Идеи",
    description:
      "Артефакты задач ideas_free и ideas_questions_for_research. Сюда попадают результаты «штормов».",
  },
  {
    id: "sources",
    label: "Источники",
    description:
      "PDF, скрипты выпусков, материалы исследований. Можно загрузить файл и потом ссылаться на путь в задачах.",
  },
];

// Корень страницы /blog/team/artifacts. Четыре таба:
//   • Исследования / Тексты / Идеи / Источники — папки с файлами,
//     управляются через ArtifactBrowser.
export default function DatabaseWorkspace() {
  const [activeTab, setActiveTab] = useState<TabId>("research");
  const activeMeta = TABS.find((t) => t.id === activeTab)!;

  return (
    <div className="flex flex-col gap-6">
      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-2xl border border-line bg-canvas p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`focus-ring flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition sm:flex-none ${
              activeTab === t.id
                ? "bg-surface text-ink shadow-card"
                : "text-ink-muted hover:bg-elevated hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-ink-muted">{activeMeta.description}</p>

      {activeTab === "research" && (
        <ArtifactBrowser rootPrefix="research" supportsFolders supportsUpload={false} />
      )}
      {activeTab === "texts" && (
        <ArtifactBrowser rootPrefix="texts" supportsFolders supportsUpload={false} />
      )}
      {activeTab === "ideas" && (
        <ArtifactBrowser rootPrefix="ideas" supportsFolders supportsUpload={false} />
      )}
      {activeTab === "sources" && (
        <ArtifactBrowser rootPrefix="sources" supportsFolders supportsUpload />
      )}
    </div>
  );
}

// Скелет загрузки используется в страницах при первом рендере.
export function DatabaseLoading() {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-dashed border-line bg-elevated/40 px-4 py-12 text-sm text-ink-muted">
      <Loader2 size={16} className="animate-spin" /> Грузим артефакты…
    </div>
  );
}
