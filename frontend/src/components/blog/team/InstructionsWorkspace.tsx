"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Loader2,
  Sparkles,
  Wand2,
} from "lucide-react";
import { readPromptTemplate } from "@/lib/team/teamPromptsService";
import {
  refinePromptTemplate,
  savePromptTemplate,
} from "@/lib/team/teamBackendClient";

// Сессия 4 этапа 2: главная страница раздела «Инструкции» состоит из трёх
// логических блоков, привязанных к подпапкам bucket'а team-prompts:
//   • strategy/ — Миссия и Цели на период (бывшие context.md / concept.md
//     из team-database).
//   • roles/ — заполняется в этапе 2 (пункт 12 roadmap); сейчас пустой
//     плейсхолдер.
//   • task-templates/ — пять шаблонов задач из этапа 1.
//
// Хранилище и пути — только латиница (Supabase Storage отбивает кириллицу
// и пробелы в ключах). Русские лейблы для UI живут здесь, в FILE_LABELS.
//
// Клик по любому файлу открывает существующий markdown-редактор с
// автосохранением и функцией «🪄 Уточнить промпт». «Уточнить» имеет смысл
// только для шаблонов задач — для Стратегии команды кнопку прячем (там
// не промпт с {{плейсхолдерами}}, а обычный текст).

const STRATEGY_FOLDER = "strategy";
const TEMPLATES_FOLDER = "task-templates";
// Сессия 11 этапа 2: Role-файлы агентов лежат в `roles/<agent_id>.md`.
// До Сессии 11 здесь была кириллическая папка «Должностные инструкции» —
// Storage отбивал её ключи как `Invalid key`, и Role-файлы вообще не
// сохранялись (см. agentService.rolePath).
const ROLES_FOLDER = "roles";
// Сессия 21 этапа 2: методички инструментов команды
// (tools/<tool-id>.md). Загружаются seed-скриптом seed-tool-manifests,
// редактируются здесь же.
const TOOLS_FOLDER = "tools";

// Маппинг latin-slug → человекочитаемое название для UI. В Storage файл
// называется `mission.md`, но в интерфейсе показываем «Миссия».
const FILE_LABELS: Record<string, string> = {
  mission: "Миссия",
  goals: "Цели на период",
  "ideas-free": "Свободные идеи",
  "ideas-questions": "Идеи и вопросы для исследования",
  "research-direct": "Прямое исследование",
  "write-text": "Написание текста",
  "edit-text-fragments": "Правка фрагментов",
  // Сессия 21: имена инструментов в человекочитаемом виде.
  notebooklm: "NotebookLM",
  "web-search": "Web Search",
};

function displayLabel(slug: string): string {
  return FILE_LABELS[slug] ?? slug;
}

// Те же подсказки про плейсхолдеры, что были в PromptsWorkspace до Сессии 4 —
// чтобы редактор шаблонов не потерял функционал. Ключ — slug файла без папки.
const COMMON_PLACEHOLDERS = [
  {
    name: "{{mission}}",
    description: "Миссия команды — кешируемый блок (Стратегия команды → Миссия)",
  },
  {
    name: "{{goals}}",
    description:
      "Цели на период — кешируемый блок (Стратегия команды → Цели на период)",
  },
  {
    name: "{{user_input}}",
    description: "Текст, введённый пользователем при запуске задачи",
  },
];

const TASK_SPECIFIC_PLACEHOLDERS: Record<
  string,
  { name: string; description: string }[]
> = {
  "research-direct": [
    { name: "{{source}}", description: "URL или путь к файлу источника, материал которого подгружается" },
    { name: "{{source_text}}", description: "Содержимое источника после fetch'а — рабочий текст для анализа" },
  ],
  "write-text": [
    { name: "{{point_name}}", description: "Название точки экскурсии (slug идёт в путь к артефакту)" },
    { name: "{{length_hint}}", description: "Подсказка по длине: «короткий», «средний», «длинный»" },
    { name: "{{research}}", description: "Собранные исследования из research_paths — подмешиваются автоматически" },
  ],
  "edit-text-fragments": [
    { name: "{{full_text}}", description: "Полный текст артефакта write_text задачи — текущая версия" },
    { name: "{{edits}}", description: "Список правок: фрагмент → инструкция, форматируется автоматически" },
    { name: "{{general_instruction}}", description: "Общая инструкция к правке (опц.)" },
  ],
  "ideas-free": [],
  "ideas-questions": [],
};

export interface InstructionsTree {
  strategy: string[];
  roles: string[];
  templates: string[];
  // Сессия 21: методички инструментов.
  tools: string[];
}

interface InstructionsWorkspaceProps {
  initialTree: InstructionsTree;
}

type ActiveKind = "strategy" | "template" | "role" | "tool";
interface ActiveFile {
  kind: ActiveKind;
  /** latin-slug файла без расширения .md (то же, что имя в Storage) */
  slug: string;
  /** полный путь внутри bucket'а */
  path: string;
}

export default function InstructionsWorkspace({ initialTree }: InstructionsWorkspaceProps) {
  const [tree] = useState<InstructionsTree>(initialTree);
  const [active, setActive] = useState<ActiveFile | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <SectionGrid tree={tree} active={active} onSelect={setActive} />

      {active && (
        <FileEditorPanel
          key={active.path}
          file={active}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

function SectionGrid({
  tree,
  active,
  onSelect,
}: {
  tree: InstructionsTree;
  active: ActiveFile | null;
  onSelect: (file: ActiveFile) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <SectionBlock
        title="Стратегия команды"
        description="Миссия и Цели на период — подмешиваются во все промпты как кешируемые блоки."
      >
        {tree.strategy.length === 0 ? (
          <EmptyHint text="Файлов пока нет. Они появятся после миграции." />
        ) : (
          <FileList
            items={tree.strategy.map((slug) => ({
              slug,
              path: `${STRATEGY_FOLDER}/${slug}.md`,
              kind: "strategy" as ActiveKind,
            }))}
            activePath={active?.path ?? null}
            onSelect={onSelect}
          />
        )}
      </SectionBlock>

      <SectionBlock
        title="Должностные инструкции"
        description="Role-файлы агентов. Создаются мастером «+ Добавить сотрудника» и редактируются здесь или в карточке агента."
      >
        {tree.roles.length === 0 ? (
          <EmptyHint
            text="Файлов пока нет. Создайте первого сотрудника на странице «Сотрудники»."
            subtle
          />
        ) : (
          <FileList
            items={tree.roles.map((slug) => ({
              slug,
              path: `${ROLES_FOLDER}/${slug}.md`,
              kind: "role" as ActiveKind,
            }))}
            activePath={active?.path ?? null}
            onSelect={onSelect}
          />
        )}
      </SectionBlock>

      <SectionBlock
        title="Шаблоны задач"
        description="Пять шаблонов промптов для типов задач команды. {{плейсхолдеры}} подставляются при запуске."
      >
        {tree.templates.length === 0 ? (
          <EmptyHint text="Шаблонов пока нет. Возможно, миграция Сессии 4 ещё не прогнана." />
        ) : (
          <FileList
            items={tree.templates.map((slug) => ({
              slug,
              path: `${TEMPLATES_FOLDER}/${slug}.md`,
              kind: "template" as ActiveKind,
            }))}
            activePath={active?.path ?? null}
            onSelect={onSelect}
          />
        )}
      </SectionBlock>

      {/* Сессия 21: методички инструментов. Содержимое каждого файла идёт
          в третью секцию Awareness промпта тех агентов, которым этот
          инструмент привязан. Активируется в Админке → Инструменты команды. */}
      <SectionBlock
        title="Инструменты"
        description="Методички исполняемых инструментов агентов. Подмешиваются в Awareness промпта."
      >
        {tree.tools.length === 0 ? (
          <EmptyHint text="Методички ещё не загружены. Запусти `npm run seed:tools` в backend." />
        ) : (
          <FileList
            items={tree.tools.map((slug) => ({
              slug,
              path: `${TOOLS_FOLDER}/${slug}.md`,
              kind: "tool" as ActiveKind,
            }))}
            activePath={active?.path ?? null}
            onSelect={onSelect}
          />
        )}
      </SectionBlock>
    </div>
  );
}

function SectionBlock({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3 rounded-2xl border border-line bg-elevated/40 p-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <p className="mt-0.5 text-xs text-ink-faint">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

function EmptyHint({ text, subtle = false }: { text: string; subtle?: boolean }) {
  return (
    <p
      className={
        "rounded-xl border border-dashed border-line px-3 py-4 text-xs " +
        (subtle ? "text-ink-faint" : "text-ink-muted")
      }
    >
      {text}
    </p>
  );
}

function FileList({
  items,
  activePath,
  onSelect,
}: {
  items: { slug: string; path: string; kind: ActiveKind }[];
  activePath: string | null;
  onSelect: (file: ActiveFile) => void;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const isActive = item.path === activePath;
        return (
          <li key={item.path}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className={`focus-ring w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                isActive
                  ? "border-line-strong bg-surface text-ink"
                  : "border-transparent text-ink-muted hover:bg-elevated hover:text-ink"
              }`}
            >
              {displayLabel(item.slug)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function FileEditorPanel({
  file,
  onClose,
}: {
  file: ActiveFile;
  onClose: () => void;
}) {
  const [content, setContent] = useState<string>("");
  const [originalContent, setOriginalContent] = useState<string>("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState<string | null>(null);

  const [refineOpen, setRefineOpen] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [refineBusy, setRefineBusy] = useState(false);
  const [refineError, setRefineError] = useState<string | null>(null);
  const [refineLast, setRefineLast] = useState<{ provider: string; model: string } | null>(null);

  // Загружаем содержимое выбранного файла.
  useEffect(() => {
    let cancelled = false;
    setLoadingContent(true);
    setLoadError(null);
    setSavedHint(null);
    setSaveError(null);
    setRefineOpen(false);
    setRefineInstruction("");
    readPromptTemplate(file.path)
      .then((text) => {
        if (cancelled) return;
        setContent(text);
        setOriginalContent(text);
      })
      .catch((err) => {
        if (cancelled) return;
        // Если файла нет — начинаем с пустого; первое сохранение создаст его.
        // Это штатный сценарий для обязательных файлов стратегии (Миссия,
        // Цели на период), которые ещё не заполнены — баннер ошибки не
        // показываем, чтобы не пугать.
        const msg = err instanceof Error ? err.message : String(err);
        const isMissing = /not found|404/i.test(msg);
        setContent("");
        setOriginalContent("");
        setLoadError(isMissing ? null : msg);
      })
      .finally(() => {
        if (!cancelled) setLoadingContent(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file.path]);

  const isDirty = content !== originalContent;

  async function handleSave() {
    setSaveBusy(true);
    setSaveError(null);
    setSavedHint(null);
    try {
      await savePromptTemplate(file.path, content);
      setOriginalContent(content);
      setSavedHint("Сохранено");
      setTimeout(() => setSavedHint(null), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleRefine() {
    const instruction = refineInstruction.trim();
    if (!instruction) {
      setRefineError("Опиши, что улучшить");
      return;
    }
    setRefineBusy(true);
    setRefineError(null);
    try {
      const result = await refinePromptTemplate(content, instruction);
      setContent(result.content);
      setRefineLast({ provider: result.provider, model: result.model });
      setRefineInstruction("");
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefineBusy(false);
    }
  }

  const showRefine = file.kind === "template";
  const placeholders = useMemo(() => {
    if (file.kind !== "template") return [];
    const taskSpecific = TASK_SPECIFIC_PLACEHOLDERS[file.slug] ?? [];
    return [...COMMON_PLACEHOLDERS, ...taskSpecific];
  }, [file.kind, file.slug]);

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-ink-faint">
            {file.kind === "template"
              ? "Шаблон задачи"
              : file.kind === "role"
                ? "Должностная инструкция"
                : file.kind === "tool"
                  ? "Методичка инструмента"
                  : "Стратегия команды"}
          </p>
          <h3 className="truncate text-base font-semibold text-ink">{displayLabel(file.slug)}</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="focus-ring inline-flex h-9 items-center rounded-lg border border-line bg-canvas px-3 text-sm text-ink-muted transition hover:border-line-strong hover:text-ink"
        >
          ← Назад
        </button>
      </div>

      {loadError && (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {loadError}
        </p>
      )}

      {placeholders.length > 0 && <PlaceholderHelp items={placeholders} />}

      <div className="relative">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={loadingContent ? "Грузим…" : "Markdown-содержимое файла"}
          disabled={loadingContent}
          spellCheck={false}
          className="focus-ring h-[60vh] w-full resize-y rounded-2xl border border-line bg-canvas p-4 font-mono text-sm leading-relaxed text-ink placeholder:text-ink-faint disabled:opacity-50"
        />
        {loadingContent && (
          <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-surface/60">
            <Loader2 size={20} className="animate-spin text-accent" />
          </div>
        )}
      </div>

      {saveError && (
        <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent">{saveError}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs text-ink-muted">
          {savedHint && (
            <span className="inline-flex items-center gap-1.5 text-emerald-700">
              <Check size={12} /> {savedHint}
            </span>
          )}
          {isDirty && !saveBusy && !savedHint && (
            <span className="inline-flex items-center gap-1.5 text-ink-muted">
              <span className="inline-flex h-2 w-2 rounded-full bg-accent" />
              Есть несохранённые изменения
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {showRefine && (
            <button
              type="button"
              onClick={() => setRefineOpen((v) => !v)}
              className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink-muted transition hover:border-line-strong hover:text-ink"
            >
              <Wand2 size={14} />
              Уточнить промпт
              <ChevronDown
                size={12}
                className={"transition " + (refineOpen ? "rotate-180" : "rotate-0")}
              />
            </button>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!isDirty || saveBusy || loadingContent}
            className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-semibold text-surface transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saveBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Сохранить
          </button>
        </div>
      </div>

      {showRefine && refineOpen && (
        <div className="rounded-2xl border border-line bg-elevated p-4">
          <div className="flex items-start gap-2">
            <Sparkles size={16} className="mt-1 flex-shrink-0 text-accent" />
            <div className="flex-1">
              <p className="text-sm font-medium text-ink">
                Помощь LLM: переформулирует или дополнит шаблон по инструкции
              </p>
              <p className="mt-0.5 text-xs text-ink-faint">
                Плейсхолдеры {`{{name}}`} останутся на месте. Результат подменяет
                содержимое редактора, но не сохраняется автоматически — потом нажми
                «Сохранить», если устраивает.
              </p>
              <textarea
                value={refineInstruction}
                onChange={(e) => setRefineInstruction(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    void handleRefine();
                  }
                }}
                placeholder="Например: «сделай system короче», «добавь правило про русский язык», «объясни роль более конкретно»"
                rows={3}
                className="focus-ring mt-3 w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
              />
              {refineError && (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-800">
                  <AlertTriangle size={12} /> {refineError}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-faint">
                <span>
                  {refineLast
                    ? `последний прогон: ${refineLast.provider} / ${refineLast.model}`
                    : "Cmd/Ctrl + Enter — отправить"}
                </span>
                <button
                  type="button"
                  onClick={() => void handleRefine()}
                  disabled={refineBusy || !refineInstruction.trim()}
                  className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-lg bg-ink px-3 text-sm font-semibold text-canvas transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {refineBusy ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  Применить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PlaceholderHelp({
  items,
}: {
  items: { name: string; description: string }[];
}) {
  if (!items.length) return null;
  return (
    <details className="rounded-xl border border-line bg-elevated/60 px-4 py-3 text-sm">
      <summary className="cursor-pointer select-none text-xs font-medium uppercase tracking-wide text-ink-faint">
        Доступные плейсхолдеры
      </summary>
      <ul className="mt-2 grid grid-cols-1 gap-1.5 text-xs sm:grid-cols-2">
        {items.map((item) => (
          <li key={item.name}>
            <span className="font-mono text-ink">{item.name}</span>
            <span className="text-ink-faint"> — {item.description}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}
