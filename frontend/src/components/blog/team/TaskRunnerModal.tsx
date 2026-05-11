"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, GitBranch, Loader2, Plus, Sparkles, X } from "lucide-react";
import VoiceInput from "./VoiceInput";
import ModelSelector from "./ModelSelector";
import {
  BackendApiError,
  createProject,
  fetchProjects,
  previewPrompt,
  runTask,
  type PreviewPromptResult,
  type PromptLayersSummary,
  type TeamProject,
} from "@/lib/team/teamBackendClient";
import { listAgents, type TeamAgent } from "@/lib/team/teamAgentsService";
import type { SuggestedNextStep, TeamTaskModelChoice } from "@/lib/team/types";

// Сессия 13: контекст handoff. Передаётся, когда модалку открывают из
// кнопки «Передать дальше» в TaskViewerModal. Заставляет UI:
//   • показать баннер «Передача от задачи …»
//   • если есть Suggested Next Step — предзаполнить user_input и выбрать
//     агента по соответствию имени (case-insensitive contains).
//   • показать чекбокс «Прикрепить артефакт родителя».
//   • при сабмите пробросить parentTaskId / attachParentArtifact в runTask.
export interface HandoffContext {
  parentTaskId: string;
  parentTitle: string | null;
  // Если в Suggested Next Steps было предложение — пред-заполняем форму.
  suggestion?: SuggestedNextStep | null;
}

interface TaskRunnerModalProps {
  open: boolean;
  taskType: string;
  taskTitle: string;
  onClose: () => void;
  // Когда задача успешно создана — caller получает её id и закрывает модалку.
  onCreated: (taskId: string) => void;
  // Сессия 13: опц. handoff-контекст. Без него — обычный запуск задачи.
  handoff?: HandoffContext | null;
  // Сессия 17: id агента, преданного из шага 2 TaskCreationModal или из
  // кнопки «Поставить задачу» в карточке сотрудника. Если задан — селект
  // агента в форме блокируется (Влад уже выбрал на предыдущем шаге).
  presetAgentId?: string | null;
}

// Параметры задачи, которые UI собирает из формы. Снепшот специфичен для
// типа: research_direct требует source, write_text — point_name, и т. д.
// Передаём в backend как есть (без валидации структуры — backend сам решит).
type TaskParams = Record<string, string | string[]>;

const DEFAULT_MODEL: TeamTaskModelChoice = { preset: "balanced" };

export default function TaskRunnerModal({
  open,
  taskType,
  taskTitle,
  onClose,
  onCreated,
  handoff = null,
  presetAgentId = null,
}: TaskRunnerModalProps) {
  const [params, setParams] = useState<TaskParams>({});
  const [modelChoice, setModelChoice] = useState<TeamTaskModelChoice>(DEFAULT_MODEL);
  const [title, setTitle] = useState("");
  // Сессия 12: выбор сотрудника. null = «без агента» (старое поведение).
  // Сессия 17: при presetAgentId — выставляется при mount и блокируется.
  const [agentId, setAgentId] = useState<string | null>(null);
  const [agents, setAgents] = useState<TeamAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  // Сессия 13: при handoff — прикреплять артефакт родителя как контекст.
  // По умолчанию true: бриф без контекста почти всегда бесполезен новому
  // агенту. Влад может отключить, если хочет «чистую» задачу.
  const [attachParentArtifact, setAttachParentArtifact] = useState(true);
  // Сессия 16/17: проект-тег задачи. null = «без проекта». При создании
  // нового проекта inline сразу выставляется в state.
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projects, setProjects] = useState<TeamProject[]>([]);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  // Сессия 17: чекбокс «Самопроверка» — заглушка до Сессии 29.
  const [selfReview, setSelfReview] = useState(false);

  const [promptOpen, setPromptOpen] = useState(false);
  const [promptPreview, setPromptPreview] = useState<PreviewPromptResult | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  // Если пользователь отредактировал — отдаём backend'у promptOverride.
  const [systemDraft, setSystemDraft] = useState("");
  const [userDraft, setUserDraft] = useState("");
  const [overridden, setOverridden] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Сброс state при смене типа задачи или повторном открытии — пользователь
  // не должен увидеть данные прошлого запуска.
  useEffect(() => {
    if (open) {
      // Сессия 13: при handoff — предзаполняем user_input из Suggested Next Step.
      const initialParams: TaskParams = {};
      if (handoff?.suggestion?.suggestion) {
        initialParams.user_input = handoff.suggestion.suggestion;
      }
      setParams(initialParams);
      setModelChoice(DEFAULT_MODEL);
      setTitle("");
      // Сессия 17: presetAgentId фиксирует агента, иначе старт без агента.
      setAgentId(presetAgentId ?? null);
      setAttachParentArtifact(true);
      setProjectId(null);
      setCreatingProject(false);
      setNewProjectName("");
      setSelfReview(false);
      setPromptOpen(false);
      setPromptPreview(null);
      setPromptError(null);
      setSystemDraft("");
      setUserDraft("");
      setOverridden(false);
      setSubmitError(null);
      setSubmitting(false);
    }
  }, [open, taskType, handoff, presetAgentId]);

  // Подтягиваем активных агентов при открытии — список нужен и до сборки
  // промпта, и при отправке. Ошибку не показываем как блокер — пустой
  // список означает «можно работать без агента», старый сценарий этапа 1.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setAgentsLoading(true);
    listAgents("active")
      .then((list) => {
        if (cancelled) return;
        setAgents(list);
        // Сессия 13: если есть handoff с предложением — пробуем сопоставить
        // имя из Suggested Next Step с display_name активного агента
        // (case-insensitive, ищем подстроку в обе стороны — модель часто
        // даёт сокращённое имя «Маша» вместо полного «Маша-разведчик»).
        // Сессия 17: presetAgentId выигрывает у Suggested.
        if (presetAgentId) {
          setAgentId(presetAgentId);
        } else if (handoff?.suggestion?.agent_name) {
          const needle = handoff.suggestion.agent_name.trim().toLowerCase();
          const match = list.find((a) => {
            const name = a.display_name.toLowerCase();
            return name.includes(needle) || needle.includes(name);
          });
          if (match) setAgentId(match.id);
        }
      })
      .catch((err) => {
        console.warn("[TaskRunnerModal] listAgents failed:", err);
      })
      .finally(() => {
        if (!cancelled) setAgentsLoading(false);
      });
    // Сессия 16/17: список проектов для select'а «Проект».
    fetchProjects("active")
      .then((items) => {
        if (!cancelled) setProjects(items);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, handoff, presetAgentId]);

  // Esc + блокировка скролла фона.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, submitting, onClose]);

  // Готов к запуску: для всех есть user_input, для research — source, для
  // write — point_name. Кнопка disabled, пока не заполнено.
  const ready = useMemo(() => {
    const userInput = String(params.user_input ?? "").trim();
    if (!userInput) return false;
    if (taskType === "research_direct" && !String(params.source ?? "").trim()) {
      return false;
    }
    if (taskType === "write_text" && !String(params.point_name ?? "").trim()) {
      return false;
    }
    return true;
  }, [params, taskType]);

  function setParam(key: string, value: string | string[]) {
    setParams((prev) => ({ ...prev, [key]: value }));
  }

  // Пользователь раскрыл «Промпт» — собираем превью на бэкенде. Делаем это
  // только при первом открытии или если params изменились (при следующем
  // нажатии можно пересобрать). Сессия 12: пробрасываем выбранного агента,
  // чтобы превью отражало Role + Memory + Awareness.
  async function loadPromptPreview() {
    setPromptLoading(true);
    setPromptError(null);
    try {
      const preview = await previewPrompt(
        taskType,
        sanitizeParamsForBackend(params),
        agentId,
      );
      setPromptPreview(preview);
      setSystemDraft(preview.system ?? "");
      setUserDraft(preview.user ?? "");
      setOverridden(false);
    } catch (err) {
      setPromptError(err instanceof Error ? err.message : String(err));
    } finally {
      setPromptLoading(false);
    }
  }

  function togglePromptOpen() {
    const next = !promptOpen;
    setPromptOpen(next);
    if (next && !promptPreview && !promptLoading) {
      // Лениво — только когда пользователь хочет увидеть.
      void loadPromptPreview();
    }
  }

  async function handleSubmit() {
    if (!ready || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const taskId = await runTask({
        taskType,
        params: sanitizeParamsForBackend(params),
        modelChoice,
        promptOverride: overridden
          ? {
              system: systemDraft,
              user: userDraft,
              cacheable_blocks: promptPreview?.cacheableBlocks ?? [],
            }
          : null,
        title: title.trim() || null,
        agentId,
        // Сессия 13: handoff поля. Бэкенд игнорирует, если null.
        parentTaskId: handoff?.parentTaskId ?? null,
        attachParentArtifact: handoff ? attachParentArtifact : undefined,
        // Сессия 16/17: проект-тег.
        projectId,
      });
      onCreated(taskId);
    } catch (err) {
      // 409 — превышен дневной лимит расходов (Сессия 2 этапа 2). Показываем
      // alert и подсказку, как поднять лимит. Форму не блокируем — пользователь
      // может изменить лимит и сразу повторить.
      if (err instanceof BackendApiError && err.status === 409) {
        const message =
          (err.message ?? "Достигнут дневной лимит расходов.") +
          " Открой Админку → Жёсткие лимиты, чтобы поднять лимит.";
        alert(message);
        setSubmitError(message);
      } else {
        setSubmitError(err instanceof Error ? err.message : String(err));
      }
      setSubmitting(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-stretch justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-runner-title"
    >
      <div
        className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
        onClick={submitting ? undefined : onClose}
        role="presentation"
      />

      <div className="relative z-10 flex h-full max-h-screen w-full max-w-2xl flex-col overflow-hidden bg-surface shadow-pop sm:h-auto sm:max-h-[90vh] sm:rounded-2xl sm:border sm:border-line">
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Запуск задачи
            </p>
            <h2
              id="task-runner-title"
              className="mt-0.5 font-display text-lg font-semibold tracking-tight"
            >
              {taskTitle}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-lg text-ink-muted transition hover:bg-elevated hover:text-ink disabled:opacity-50"
            aria-label="Закрыть"
          >
            <X size={18} />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleSubmit();
          }}
          className="flex flex-1 flex-col gap-5 overflow-y-auto p-6"
        >
          {handoff && (
            <div className="rounded-xl border border-accent/30 bg-accent-soft/40 px-4 py-3">
              <div className="flex items-start gap-2.5 text-sm">
                <GitBranch
                  size={16}
                  className="mt-0.5 flex-shrink-0 text-accent"
                  aria-hidden
                />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-ink">
                    Передача от задачи
                    {handoff.parentTitle ? (
                      <span className="ml-1 text-ink-muted">
                        «{handoff.parentTitle}»
                      </span>
                    ) : (
                      <span className="ml-1 text-ink-muted">{handoff.parentTaskId}</span>
                    )}
                  </p>
                  {handoff.suggestion ? (
                    <p className="mt-1 text-xs text-ink-muted">
                      Предложение исходного агента:{" "}
                      <em className="not-italic text-ink">
                        {handoff.suggestion.agent_name}
                      </em>{" "}
                      → {handoff.suggestion.suggestion}
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-ink-muted">
                      Выбери сотрудника-получателя и сформулируй бриф.
                    </p>
                  )}
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs text-ink-muted">
                    <input
                      type="checkbox"
                      checked={attachParentArtifact}
                      onChange={(e) => setAttachParentArtifact(e.target.checked)}
                      className="accent-accent"
                    />
                    Прикрепить артефакт исходной задачи как контекст
                  </label>
                </div>
              </div>
            </div>
          )}

          <TaskFields taskType={taskType} params={params} setParam={setParam} />

          <AgentSelectField
            agents={agents}
            loading={agentsLoading}
            value={agentId}
            disabled={!!presetAgentId}
            onChange={(id) => {
              setAgentId(id);
              // Превью с другим агентом будет другим — сбрасываем кеш, чтобы
              // следующее раскрытие «Промпт» подтянуло свежий Role/Memory.
              setPromptPreview(null);
              setOverridden(false);
              setSystemDraft("");
              setUserDraft("");
            }}
          />

          {/* Сессия 16/17: проект-тег задачи. */}
          <ProjectSelectField
            projects={projects}
            value={projectId}
            onChange={setProjectId}
            creating={creatingProject}
            newName={newProjectName}
            onCreatingChange={setCreatingProject}
            onNewNameChange={setNewProjectName}
            onCreate={async () => {
              const name = newProjectName.trim();
              if (!name) return;
              try {
                const project = await createProject({ name });
                setProjects((prev) => [project, ...prev]);
                setProjectId(project.id);
                setCreatingProject(false);
                setNewProjectName("");
              } catch (err) {
                setSubmitError(err instanceof Error ? err.message : String(err));
              }
            }}
          />

          {/* Сессия 17: «Самопроверка» — заглушка до Сессии 29. */}
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              checked={selfReview}
              onChange={(e) => setSelfReview(e.target.checked)}
              disabled
              className="accent-accent"
            />
            <span className="opacity-70">
              🔍 Самопроверка{" "}
              <span className="text-xs italic">
                (появится в Сессии 29 — пока флажок неактивен)
              </span>
            </span>
          </label>

          {/* Сессия 19: UI-плейсхолдер «Сделать регулярной».
              Реальная функциональность — в пункте 15 (этап 3). */}
          <label className="flex items-center gap-2 text-sm text-ink-muted">
            <input
              type="checkbox"
              disabled
              className="accent-accent"
            />
            <span className="opacity-70">
              ⏰ Сделать регулярной{" "}
              <span className="text-xs italic">
                (появится позже — пока флажок неактивен)
              </span>
            </span>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-ink">
              Название задачи
              <span className="ml-2 text-xs font-normal text-ink-faint">
                (необязательно — иначе подставится дефолт)
              </span>
            </span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={taskTitle}
              className="focus-ring h-11 rounded-xl border border-line bg-canvas px-4 text-sm text-ink placeholder:text-ink-faint"
              maxLength={200}
            />
          </label>

          <div className="rounded-xl border border-line bg-elevated p-4">
            <ModelSelector
              value={modelChoice}
              onChange={setModelChoice}
              taskType={taskType}
            />
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={togglePromptOpen}
              className="focus-ring inline-flex w-fit items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-ink"
            >
              <ChevronDown
                size={14}
                className={"transition " + (promptOpen ? "rotate-0" : "-rotate-90")}
              />
              Промпт {overridden && <em className="text-accent not-italic">(изменён)</em>}
            </button>

            {promptOpen && (
              <div className="flex flex-col gap-3 rounded-xl border border-line bg-elevated p-4">
                {promptLoading ? (
                  <div className="flex items-center gap-2 text-sm text-ink-faint">
                    <Loader2 size={16} className="animate-spin" /> Собираю промпт…
                  </div>
                ) : promptError ? (
                  <div className="text-sm text-accent">
                    Не удалось собрать промпт: {promptError}
                  </div>
                ) : promptPreview ? (
                  <>
                    <PromptLayersPreview
                      layeredPreview={promptPreview.layeredPreview}
                      summary={promptPreview.summary}
                    />
                    <PromptField
                      label="System"
                      value={systemDraft}
                      onChange={(v) => {
                        setSystemDraft(v);
                        setOverridden(true);
                      }}
                    />
                    <PromptField
                      label="User"
                      value={userDraft}
                      onChange={(v) => {
                        setUserDraft(v);
                        setOverridden(true);
                      }}
                    />
                    <div className="flex items-center justify-between text-xs text-ink-faint">
                      <span>
                        Шаблон: <span className="font-mono">{promptPreview.template ?? "—"}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => void loadPromptPreview()}
                        className="focus-ring rounded-md px-2 py-1 text-ink-muted hover:bg-surface hover:text-ink"
                      >
                        Пересобрать из формы
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            )}
          </div>

          {submitError && (
            <p className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
              {submitError}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-5">
            {/* Сессия 19: подсказка про незаполненный бриф. Когда есть всё —
                подсказка исчезает; submit становится активным. */}
            {!ready && (
              <p className="mr-auto text-xs text-ink-faint">
                Заполни бриф задачи
                {taskType === "research_direct" ? " и источник" : ""}
                {taskType === "write_text" ? " и название точки" : ""}, чтобы
                запустить.
              </p>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="focus-ring inline-flex h-11 items-center rounded-xl border border-line bg-surface px-4 text-sm font-medium text-ink-muted transition hover:border-line-strong hover:text-ink disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={!ready || submitting}
              className="focus-ring inline-flex h-11 items-center gap-2 rounded-xl bg-accent px-5 text-sm font-semibold text-surface shadow-card transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Запускаю…
                </>
              ) : (
                <>
                  <Sparkles size={16} /> Запустить
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =========================================================================
// Поля формы по типам задач
// =========================================================================

function TaskFields({
  taskType,
  params,
  setParam,
}: {
  taskType: string;
  params: TaskParams;
  setParam: (key: string, value: string | string[]) => void;
}) {
  if (taskType === "research_direct") {
    return (
      <>
        <Field
          label="URL или путь к файлу в team-database/sources/"
          value={String(params.source ?? "")}
          onChange={(v) => setParam("source", v)}
          placeholder="https://example.com/article или sources/interview.pdf"
          required
        />
        <TextAreaField
          label="Что хочешь узнать"
          value={String(params.user_input ?? "")}
          onChange={(v) => setParam("user_input", v)}
          placeholder="Например: как этот феномен повлиял на культуру XX века?"
          rows={3}
          required
        />
      </>
    );
  }

  if (taskType === "write_text") {
    return (
      <>
        <Field
          label="Название точки / заголовок текста"
          value={String(params.point_name ?? "")}
          onChange={(v) => setParam("point_name", v)}
          placeholder="Например: Прогулка по Гороховой"
          required
        />
        <TextAreaField
          label="Идея текста"
          value={String(params.user_input ?? "")}
          onChange={(v) => setParam("user_input", v)}
          placeholder="Что должно быть в тексте, какой угол подачи, тон, акценты"
          rows={4}
          required
        />
        <Field
          label="Длина (необязательно)"
          value={String(params.length_hint ?? "")}
          onChange={(v) => setParam("length_hint", v)}
          placeholder="например: 1500 знаков, или короткий пост, или произвольно"
        />
        <ResearchPathsField
          value={Array.isArray(params.research_paths) ? params.research_paths : []}
          onChange={(v) => setParam("research_paths", v)}
        />
      </>
    );
  }

  // ideas_free и ideas_questions_for_research — только user_input.
  return (
    <TextAreaField
      label={
        taskType === "ideas_questions_for_research"
          ? "Тема для вопросов"
          : "Что придумать"
      }
      value={String(params.user_input ?? "")}
      onChange={(v) => setParam("user_input", v)}
      placeholder={
        taskType === "ideas_questions_for_research"
          ? "Например: запреты в Российской империи XIX века"
          : "Например: придумай 5 идей коротких сюжетов про необычные истории Петербурга"
      }
      rows={5}
      required
    />
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink">
        {label}
        {required && <span className="ml-1 text-accent">*</span>}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className="focus-ring h-11 rounded-xl border border-line bg-canvas px-4 text-sm text-ink placeholder:text-ink-faint"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  placeholder,
  required,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  rows?: number;
}) {
  return (
    <label className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink">
          {label}
          {required && <span className="ml-1 text-accent">*</span>}
        </span>
        <VoiceInput
          ariaLabel="Надиктовать"
          // Голос дописываем к существующему — пользователь часто что-то уже
          // ввёл клавиатурой и хочет добавить голосом.
          onTranscribed={(text) => {
            const sep = value && !value.endsWith("\n") && !value.endsWith(" ") ? " " : "";
            onChange((value || "") + sep + text);
          }}
        />
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        required={required}
        className="focus-ring w-full resize-y rounded-xl border border-line bg-canvas px-4 py-3 text-sm leading-relaxed text-ink placeholder:text-ink-faint"
      />
    </label>
  );
}

// Простой ввод research-путей: textarea с одним путём на строку. Подсказка
// формата — внутри placeholder. На этапе 2 заменим визуальным пикером файлов
// из team-database.
function ResearchPathsField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const text = value.join("\n");
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink">Источники из исследований</span>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => {
          const lines = e.target.value
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean);
          onChange(lines);
        }}
        rows={3}
        placeholder={"research/2026-05-04_petersburg.md\nresearch/2026-05-05_smolny.md"}
        className="focus-ring w-full resize-y rounded-xl border border-line bg-canvas px-4 py-3 font-mono text-xs leading-relaxed text-ink placeholder:text-ink-faint"
      />
      <span className="text-xs text-ink-faint">
        По одному пути на строку, относительно bucket'а team-database. Можно оставить
        пустым — текст напишется только по идее.
      </span>
    </label>
  );
}

// Read-only превью многослойной структуры промпта (Сессия 6 этапа 2).
// Показывает все 7 слоёв с визуальными разделителями ═══ MISSION ═══ и
// пометкой о пропущенных. Бэкенд старее Сессии 6 не вернёт layeredPreview —
// компонент тогда просто не отрисуется.
function PromptLayersPreview({
  layeredPreview,
  summary,
}: {
  layeredPreview?: string;
  summary?: PromptLayersSummary;
}) {
  if (!layeredPreview) return null;
  const loaded = summary?.layers_loaded ?? [];
  const skipped = summary?.layers_skipped ?? [];
  return (
    <details className="rounded-lg border border-line bg-surface">
      <summary className="cursor-pointer list-none px-3 py-2 text-xs font-medium uppercase tracking-wide text-ink-faint hover:text-ink">
        Слои промпта{" "}
        <span className="font-normal normal-case text-ink-faint">
          · загружено {loaded.length}/{loaded.length + skipped.length}
          {summary?.total_tokens_estimate
            ? ` · ~${summary.total_tokens_estimate} токенов`
            : ""}
        </span>
      </summary>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words border-t border-line px-3 py-2 font-mono text-[11px] leading-relaxed text-ink-muted">
        {layeredPreview}
      </pre>
    </details>
  );
}

function PromptField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={6}
        className="focus-ring w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-ink"
      />
    </label>
  );
}

// Селект «Сотрудник» (Сессия 12 этапа 2). Опциональный — null значит «без
// агента» (старое поведение этапа 1: промпт без Role/Memory/Awareness).
// Если активных агентов нет — показываем подсказку, что список пуст;
// форма всё равно работает в режиме «без агента».
function AgentSelectField({
  agents,
  loading,
  value,
  onChange,
  disabled = false,
}: {
  agents: TeamAgent[];
  loading: boolean;
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
}) {
  const noAgents = !loading && agents.length === 0;
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink">
        Сотрудник
        {disabled ? (
          <span className="ml-2 text-xs font-normal text-ink-faint">
            (выбран на предыдущем шаге)
          </span>
        ) : (
          <span className="ml-2 text-xs font-normal text-ink-faint">
            (необязательно — без выбора задача собирается как раньше)
          </span>
        )}
      </span>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled || loading || noAgents}
        className="focus-ring h-11 rounded-xl border border-line bg-canvas px-4 text-sm text-ink disabled:opacity-60"
      >
        <option value="">
          {loading
            ? "Загружаю список…"
            : noAgents
              ? "Нет активных сотрудников"
              : "— Без агента —"}
        </option>
        {agents.map((a) => {
          const suffix = a.role_title ? ` · ${a.role_title}` : "";
          return (
            <option key={a.id} value={a.id}>
              {a.display_name}
              {suffix}
            </option>
          );
        })}
      </select>
    </label>
  );
}

// Сессия 16/17: select проекта-тега + inline-создание.
function ProjectSelectField({
  projects,
  value,
  onChange,
  creating,
  newName,
  onCreatingChange,
  onNewNameChange,
  onCreate,
}: {
  projects: TeamProject[];
  value: string | null;
  onChange: (id: string | null) => void;
  creating: boolean;
  newName: string;
  onCreatingChange: (v: boolean) => void;
  onNewNameChange: (v: string) => void;
  onCreate: () => void | Promise<void>;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-ink">
        Проект
        <span className="ml-2 text-xs font-normal text-ink-faint">
          (необязательно — задача может быть «⚪ Без проекта»)
        </span>
      </span>
      {creating ? (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => onNewNameChange(e.target.value)}
            placeholder="Название нового проекта"
            className="focus-ring h-11 flex-1 rounded-xl border border-line bg-canvas px-4 text-sm text-ink"
            autoFocus
          />
          <button
            type="button"
            onClick={() => void onCreate()}
            disabled={!newName.trim()}
            className="focus-ring inline-flex h-11 items-center rounded-xl bg-accent px-4 text-sm font-semibold text-surface shadow-card transition hover:bg-accent-hover disabled:opacity-50"
          >
            Создать
          </button>
          <button
            type="button"
            onClick={() => onCreatingChange(false)}
            className="focus-ring inline-flex h-11 items-center rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink-muted transition hover:text-ink"
          >
            Отмена
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || null)}
            className="focus-ring h-11 flex-1 rounded-xl border border-line bg-canvas px-4 text-sm text-ink"
          >
            <option value="">⚪ Без проекта</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => onCreatingChange(true)}
            title="Создать новый проект"
            className="focus-ring inline-flex h-11 items-center gap-1 rounded-xl border border-line bg-surface px-3 text-sm font-medium text-ink-muted transition hover:border-line-strong hover:text-ink"
          >
            <Plus size={14} />
            Новый
          </button>
        </div>
      )}
    </div>
  );
}

// research_paths уезжает как массив, остальные поля — как строки. Сериализуем
// без пустых значений, чтобы backend не получил мусор вроде {length_hint: ""}.
function sanitizeParamsForBackend(params: TaskParams): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      const cleaned = value.map((s) => s.trim()).filter(Boolean);
      if (cleaned.length > 0) out[key] = cleaned;
    } else if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) out[key] = trimmed;
    }
  }
  return out;
}
