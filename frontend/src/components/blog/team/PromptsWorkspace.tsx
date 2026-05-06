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
import {
  type PromptTemplateEntry,
  listPromptTemplates,
  readPromptTemplate,
} from "@/lib/team/teamPromptsService";
import {
  refinePromptTemplate,
  savePromptTemplate,
} from "@/lib/team/teamBackendClient";

// Подсказка про общие плейсхолдеры. Шаблон-специфичные пользователь видит
// прямо в тексте — мы их не парсим, потому что некоторые шаблоны передают
// специфичные переменные (point_name, source, edits, ...).
const COMMON_PLACEHOLDERS = [
  { name: "{{context}}", description: "context.md из базы — кешируемый блок (см. Базу → Контекст)" },
  { name: "{{concept}}", description: "concept.md из базы — кешируемый блок (см. Базу → Концепция)" },
  { name: "{{user_input}}", description: "Текст, введённый пользователем при запуске задачи" },
];

const TASK_SPECIFIC_PLACEHOLDERS: Record<string, { name: string; description: string }[]> = {
  "research-direct.md": [
    { name: "{{source}}", description: "URL или путь к файлу источника, материал которого подгружается" },
    { name: "{{source_text}}", description: "Содержимое источника после fetch'а — рабочий текст для анализа" },
  ],
  "write-text.md": [
    { name: "{{point_name}}", description: "Название точки экскурсии (slug идёт в путь к артефакту)" },
    { name: "{{length_hint}}", description: "Подсказка по длине: «короткий», «средний», «длинный»" },
    { name: "{{research}}", description: "Собранные исследования из research_paths — подмешиваются автоматически" },
  ],
  "edit-text-fragments.md": [
    { name: "{{full_text}}", description: "Полный текст артефакта write_text задачи — текущая версия" },
    { name: "{{edits}}", description: "Список правок: фрагмент → инструкция, форматируется автоматически" },
    { name: "{{general_instruction}}", description: "Общая инструкция к правке (опц.)" },
  ],
  "ideas-questions-for-research.md": [],
  "ideas-free.md": [],
};

interface PromptsWorkspaceProps {
  initialTemplates: PromptTemplateEntry[];
}

export default function PromptsWorkspace({ initialTemplates }: PromptsWorkspaceProps) {
  const [templates, setTemplates] = useState<PromptTemplateEntry[]>(initialTemplates);
  const [activeName, setActiveName] = useState<string | null>(
    initialTemplates[0]?.name ?? null,
  );
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

  // Загружаем содержимое выбранного шаблона.
  useEffect(() => {
    if (!activeName) {
      setContent("");
      setOriginalContent("");
      return;
    }
    let cancelled = false;
    setLoadingContent(true);
    setLoadError(null);
    setSavedHint(null);
    setSaveError(null);
    setRefineOpen(false);
    setRefineInstruction("");
    readPromptTemplate(activeName)
      .then((text) => {
        if (cancelled) return;
        setContent(text);
        setOriginalContent(text);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingContent(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeName]);

  const isDirty = content !== originalContent;

  async function reloadTemplates() {
    try {
      const fresh = await listPromptTemplates();
      setTemplates(fresh);
    } catch (err) {
      console.warn("[prompts] reload list failed:", err);
    }
  }

  async function handleSave() {
    if (!activeName) return;
    setSaveBusy(true);
    setSaveError(null);
    setSavedHint(null);
    try {
      await savePromptTemplate(activeName, content);
      setOriginalContent(content);
      setSavedHint("Сохранено");
      // Обновим updated_at в списке (best-effort).
      void reloadTemplates();
      // Через 3 секунды — снимаем «Сохранено», чтобы не висело.
      setTimeout(() => setSavedHint(null), 3000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleRefine() {
    if (!activeName) return;
    const instruction = refineInstruction.trim();
    if (!instruction) {
      setRefineError("Опиши, что улучшить");
      return;
    }
    setRefineBusy(true);
    setRefineError(null);
    try {
      const result = await refinePromptTemplate(content, instruction);
      // Не сохраняем автоматически — пользователь увидит правки и нажмёт
      // «Сохранить», когда будет готов.
      setContent(result.content);
      setRefineLast({ provider: result.provider, model: result.model });
      setRefineInstruction("");
      // Не закрываем панель — можно сразу попросить ещё одну итерацию.
    } catch (err) {
      setRefineError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefineBusy(false);
    }
  }

  const placeholders = useMemo(() => {
    if (!activeName) return COMMON_PLACEHOLDERS;
    const taskSpecific = TASK_SPECIFIC_PLACEHOLDERS[activeName] ?? [];
    return [...COMMON_PLACEHOLDERS, ...taskSpecific];
  }, [activeName]);

  if (templates.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-elevated/40 px-4 py-12 text-center">
        <p className="text-sm font-medium text-ink-muted">
          Шаблонов пока нет в bucket'е team-prompts.
        </p>
        <p className="mt-1 text-xs text-ink-faint">
          Загрузите markdown-файлы через Supabase Dashboard → Storage → team-prompts.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      {/* Sidebar: список шаблонов */}
      <aside className="flex flex-col gap-2">
        <p className="px-1 text-xs font-medium uppercase tracking-wide text-ink-faint">
          Шаблоны
        </p>
        <ul className="flex flex-col gap-1">
          {templates.map((t) => {
            const active = t.name === activeName;
            return (
              <li key={t.name}>
                <button
                  type="button"
                  onClick={() => {
                    if (isDirty && active) return;
                    if (
                      isDirty &&
                      !confirm("Есть несохранённые правки. Переключиться без сохранения?")
                    ) {
                      return;
                    }
                    setActiveName(t.name);
                  }}
                  className={`focus-ring flex w-full flex-col gap-0.5 rounded-xl border px-3 py-2 text-left text-sm transition ${
                    active
                      ? "border-line-strong bg-elevated text-ink"
                      : "border-transparent text-ink-muted hover:bg-elevated hover:text-ink"
                  }`}
                >
                  <span className="font-medium">{t.name}</span>
                  {t.updatedAt && (
                    <span className="text-[11px] text-ink-faint">
                      изменён{" "}
                      {new Date(t.updatedAt).toLocaleString("ru", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* Editor */}
      <section className="flex flex-col gap-4 min-w-0">
        {!activeName && (
          <p className="rounded-xl border border-dashed border-line bg-elevated/40 px-4 py-8 text-center text-sm text-ink-muted">
            Выбери шаблон слева, чтобы начать редактирование.
          </p>
        )}

        {activeName && (
          <>
            {loadError && (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                {loadError}
              </p>
            )}

            <PlaceholderHelp items={placeholders} />

            <div className="relative">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={
                  loadingContent ? "Грузим…" : "Markdown-шаблон с {{плейсхолдерами}}"
                }
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
              <p className="rounded-xl bg-accent-soft px-3 py-2 text-sm text-accent">
                {saveError}
              </p>
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

            {refineOpen && (
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
          </>
        )}
      </section>
    </div>
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

