"use client";

// Сессия 10 этапа 2: мастер создания агента.
//
// Три шага:
//   1. «Кто это»            — Identity (имя, роль, отдел, биография) + purpose
//                             и success_criteria (защита от размножения агентов).
//   2. «Должностная»        — Role: написать самому или сформулировать с LLM
//                             (текст + голос через VoiceInput).
//   3. «Настройки и проверка» — модель, seed-rules, тестовый полигон,
//                             финальная кнопка «Создать сотрудника».
//
// Пока вне scope (Сессии 11+ и далее):
//   - Загрузка аватара файлом — пока текстовое поле (URL/эмодзи).
//   - database_access, available_tools, allowed_task_templates — disabled
//     placeholder'ы. Заполняются позже из карточки сотрудника.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  FileText,
  Loader2,
  MessageCircle,
  PenLine,
  Play,
  Trash2,
  User,
} from "lucide-react";
import {
  createAgent,
  DEPARTMENT_LABELS,
  draftRole,
  type AgentDepartment,
  type CreateAgentInput,
  type DraftRoleMessage,
  testRunAgent,
} from "@/lib/team/teamAgentsService";
import { fetchModelsConfig } from "@/lib/team/teamBackendClient";
import VoiceInput from "@/components/blog/team/VoiceInput";

type Department = AgentDepartment | "none";

interface IdentityState {
  display_name: string;
  slug: string;
  // true пока пользователь сам не правил slug — слаг автогенерируется из имени.
  slug_auto: boolean;
  role_title: string;
  department: Department;
  avatar_url: string;
  biography: string;
  purpose: string;
  success_criteria: string;
}

const INITIAL_IDENTITY: IdentityState = {
  display_name: "",
  slug: "",
  slug_auto: true,
  role_title: "",
  department: "none",
  avatar_url: "",
  biography: "",
  purpose: "",
  success_criteria: "",
};

// Транслит — повторяет логику agentService.generateSlug на бэкенде, чтобы
// превью совпадало с тем, что в итоге попадёт в БД (Влад правит вручную, если
// захочет другой slug).
const TRANSLIT_MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
  я: "ya",
};

function generateSlug(displayName: string): string {
  const src = displayName.trim().toLowerCase();
  if (!src) return "";
  let out = "";
  for (const ch of src) {
    if (TRANSLIT_MAP[ch] !== undefined) out += TRANSLIT_MAP[ch];
    else if (/[a-z0-9]/.test(ch)) out += ch;
    else if (/\s|-|_|\./.test(ch)) out += "-";
  }
  return out.replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
}

const ROLE_TEMPLATE = `## Зона ответственности
[Что делает этот агент]

## Методология работы
[Как подходит к задачам]

## Принципы
- [принцип 1]
- [принцип 2]

## Что НЕ делает
- [ограничение 1]
`;

const MIN_ROLE_LENGTH = 100;

// Fallback-список моделей, если pricing.json не загружен. Используем
// рабочие alias-id (без даты-суффикса), потому что хардкод с датой быстро
// устаревает у Anthropic. TODO: убрать, когда у всех проектов будет pricing.json.
const FALLBACK_MODELS = [
  "claude-sonnet-4-5",
  "gemini-2.0-flash",
  "gpt-4o-mini",
];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export default function CreateAgentWizard() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [identity, setIdentity] = useState<IdentityState>(INITIAL_IDENTITY);

  // Step 2 state
  const [roleMode, setRoleMode] = useState<"write" | "dialog">("write");
  const [roleText, setRoleText] = useState<string>("");
  const [dialogMessages, setDialogMessages] = useState<ChatMessage[]>([]);
  const [dialogInput, setDialogInput] = useState<string>("");
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  // Когда LLM прислал финальный Role-файл — показываем кнопку «Вставить
  // в редактор» рядом с последним ответом.
  const [lastDraftIsFinal, setLastDraftIsFinal] = useState(false);

  // Step 3 state
  const [model, setModel] = useState<string>("");
  const [provider, setProvider] = useState<string | null>(null);
  const [seedRulesText, setSeedRulesText] = useState<string>("");
  const [testQuery, setTestQuery] = useState<string>("");
  const [testResponse, setTestResponse] = useState<string>("");
  const [testBusy, setTestBusy] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  // Список моделей для select'а на шаге 3.
  const [availableModels, setAvailableModels] = useState<
    Array<{ id: string; provider: string | null; label: string | null }>
  >([]);
  const [modelsLoaded, setModelsLoaded] = useState(false);

  // Финальное создание.
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Загрузка моделей через models-config (используется ModelSelector в задачах).
  useEffect(() => {
    let cancelled = false;
    fetchModelsConfig()
      .then((cfg) => {
        if (cancelled) return;
        const pricing = cfg.pricing;
        const list: Array<{ id: string; provider: string | null; label: string | null }> = [];
        if (Array.isArray(pricing.models)) {
          for (const m of pricing.models) {
            if (m?.id) list.push({ id: m.id, provider: m.provider ?? null, label: m.label ?? null });
          }
        }
        if (list.length === 0) {
          for (const id of FALLBACK_MODELS) {
            list.push({ id, provider: null, label: null });
          }
        }
        setAvailableModels(list);
        // Если ещё не выбрана — берём первую из списка (обычно claude-sonnet).
        setModel((prev) => prev || list[0]?.id || "");
        setProvider((prev) => prev || list[0]?.provider || null);
        setModelsLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        const list = FALLBACK_MODELS.map((id) => ({ id, provider: null, label: null }));
        setAvailableModels(list);
        setModel((prev) => prev || list[0]?.id || "");
        setProvider(null);
        setModelsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Автогенерация slug, пока пользователь сам его не правил.
  useEffect(() => {
    if (!identity.slug_auto) return;
    const next = generateSlug(identity.display_name);
    setIdentity((prev) => (prev.slug === next ? prev : { ...prev, slug: next }));
  }, [identity.display_name, identity.slug_auto]);

  // ===== Валидация шагов =====
  const step1Valid = useMemo(() => {
    return (
      identity.display_name.trim().length > 0 &&
      identity.slug.trim().length > 0 &&
      identity.role_title.trim().length > 0 &&
      identity.biography.trim().length > 0 &&
      identity.purpose.trim().length > 0 &&
      identity.success_criteria.trim().length > 0
    );
  }, [identity]);

  const step2Valid = roleText.trim().length >= MIN_ROLE_LENGTH;

  // ===== Step 1 handlers =====
  function patchIdentity(patch: Partial<IdentityState>) {
    setIdentity((prev) => ({ ...prev, ...patch }));
  }

  // ===== Step 2 handlers =====
  function loadTemplate() {
    if (roleText.trim()) {
      if (!confirm("Заменить содержимое редактора шаблоном?")) return;
    }
    setRoleText(ROLE_TEMPLATE);
  }

  async function handleDialogSend(textOverride?: string) {
    const text = (textOverride ?? dialogInput).trim();
    if (!text || dialogBusy) return;

    const nextMessages: ChatMessage[] = [
      ...dialogMessages,
      { role: "user", content: text },
    ];
    setDialogMessages(nextMessages);
    setDialogInput("");
    setDialogBusy(true);
    setDialogError(null);
    try {
      const result = await draftRole({
        messages: nextMessages as DraftRoleMessage[],
        display_name: identity.display_name,
        role_title: identity.role_title,
      });
      const response = result.response ?? "";
      setDialogMessages([...nextMessages, { role: "assistant", content: response }]);
      // Финальный Role — по маркеру `## Зона ответственности` в начале.
      const trimmed = response.trim();
      const isFinal = trimmed.startsWith("## Зона ответственности");
      setLastDraftIsFinal(isFinal);
      if (isFinal) {
        setRoleText(trimmed);
      }
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : String(err));
    } finally {
      setDialogBusy(false);
    }
  }

  function insertLastDraft() {
    const last = [...dialogMessages].reverse().find((m) => m.role === "assistant");
    if (!last) return;
    setRoleText(last.content.trim());
  }

  // ===== Step 3 handlers =====
  const seedRulesArr = useMemo(() => {
    return seedRulesText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  }, [seedRulesText]);

  async function handleTestRun() {
    const query = testQuery.trim();
    if (!query) {
      setTestError("Введите тестовый запрос");
      return;
    }
    if (!model) {
      setTestError("Не выбрана модель");
      return;
    }
    setTestBusy(true);
    setTestError(null);
    setTestResponse("");
    try {
      const result = await testRunAgent({
        role: roleText,
        seed_rules: seedRulesArr,
        model,
        provider: provider ?? undefined,
        query,
      });
      setTestResponse(result.response || "(пустой ответ)");
    } catch (err) {
      setTestError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestBusy(false);
    }
  }

  async function handleCreate() {
    setSubmitBusy(true);
    setSubmitError(null);
    try {
      const department: AgentDepartment | null =
        identity.department === "none" ? null : identity.department;
      const payload: CreateAgentInput = {
        id: identity.slug.trim(),
        display_name: identity.display_name.trim(),
        role_title: identity.role_title.trim() || null,
        department,
        biography: identity.biography.trim() || null,
        avatar_url: identity.avatar_url.trim() || null,
        purpose: identity.purpose.trim(),
        success_criteria: identity.success_criteria.trim(),
        default_model: model || null,
        role_content: roleText.trim() || null,
        seed_rules: seedRulesArr,
      };
      await createAgent(payload);
      router.push("/blog/team/staff");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
      setSubmitBusy(false);
    }
  }

  return (
    <div className="mt-8 flex flex-col gap-6">
      <Stepper step={step} />

      {step === 1 && (
        <Step1Identity identity={identity} patch={patchIdentity} setIdentity={setIdentity} />
      )}

      {step === 2 && (
        <Step2Role
          roleMode={roleMode}
          setRoleMode={setRoleMode}
          roleText={roleText}
          setRoleText={setRoleText}
          loadTemplate={loadTemplate}
          dialogMessages={dialogMessages}
          dialogInput={dialogInput}
          setDialogInput={setDialogInput}
          dialogBusy={dialogBusy}
          dialogError={dialogError}
          onDialogSend={handleDialogSend}
          lastDraftIsFinal={lastDraftIsFinal}
          insertLastDraft={insertLastDraft}
        />
      )}

      {step === 3 && (
        <Step3Settings
          availableModels={availableModels}
          modelsLoaded={modelsLoaded}
          model={model}
          setModel={(id) => {
            setModel(id);
            const found = availableModels.find((m) => m.id === id);
            setProvider(found?.provider ?? null);
          }}
          seedRulesText={seedRulesText}
          setSeedRulesText={setSeedRulesText}
          testQuery={testQuery}
          setTestQuery={setTestQuery}
          testResponse={testResponse}
          testBusy={testBusy}
          testError={testError}
          onTestRun={handleTestRun}
        />
      )}

      {/* Навигация по шагам */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <button
          type="button"
          onClick={() => setStep((s) => (s === 1 ? 1 : ((s - 1) as 1 | 2 | 3)))}
          disabled={step === 1}
          className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas px-4 py-2 text-sm font-medium text-ink-muted transition hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ArrowLeft size={14} /> Назад
        </button>

        {submitError && (
          <p className="inline-flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">
            <AlertTriangle size={14} /> {submitError}
          </p>
        )}

        {step < 3 && (
          <button
            type="button"
            onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)}
            disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
            className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-surface shadow-card transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            Далее <ArrowRight size={14} />
          </button>
        )}

        {step === 3 && (
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={!step2Valid || submitBusy}
            className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-surface shadow-card transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitBusy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Создать сотрудника
          </button>
        )}
      </div>
    </div>
  );
}

// ===========================================================================
// Stepper
// ===========================================================================

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const items: Array<{ n: 1 | 2 | 3; label: string }> = [
    { n: 1, label: "Кто это" },
    { n: 2, label: "Должностная" },
    { n: 3, label: "Настройки и проверка" },
  ];
  return (
    <ol className="flex flex-wrap items-center gap-2 text-sm">
      {items.map((it, idx) => {
        const active = it.n === step;
        const done = it.n < step;
        return (
          <li key={it.n} className="inline-flex items-center gap-2">
            <span
              className={
                "inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold " +
                (active
                  ? "bg-accent text-surface"
                  : done
                    ? "bg-accent-soft text-accent"
                    : "bg-canvas text-ink-muted")
              }
            >
              {done ? <Check size={14} /> : it.n}
            </span>
            <span className={active ? "font-semibold text-ink" : "text-ink-muted"}>
              {it.label}
            </span>
            {idx < items.length - 1 && (
              <ChevronRight size={14} className="text-ink-faint" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ===========================================================================
// Step 1 — Identity
// ===========================================================================

function Step1Identity({
  identity,
  patch,
  setIdentity,
}: {
  identity: IdentityState;
  patch: (p: Partial<IdentityState>) => void;
  setIdentity: React.Dispatch<React.SetStateAction<IdentityState>>;
}) {
  return (
    <section className="grid grid-cols-1 gap-6 rounded-2xl border border-line bg-elevated p-6 shadow-card md:grid-cols-2">
      <FieldText
        label="Имя сотрудника"
        required
        placeholder="Маша, Алексей, Шеф…"
        value={identity.display_name}
        onChange={(v) => patch({ display_name: v })}
        hint="Видно во всех списках команды и в карточке."
      />

      <FieldText
        label="ID (slug)"
        required
        placeholder="masha"
        value={identity.slug}
        onChange={(v) => {
          // Любое ручное редактирование выключает автогенерацию.
          setIdentity((prev) => ({ ...prev, slug: v, slug_auto: false }));
        }}
        hint={
          identity.slug_auto
            ? "Сгенерировано из имени. Можно отредактировать вручную."
            : "Латиница, цифры, дефисы. Будет в URL карточки агента."
        }
      />

      <FieldText
        label="Должность"
        required
        placeholder="Аналитик-разведчик"
        value={identity.role_title}
        onChange={(v) => patch({ role_title: v })}
        hint="Одна строка — заголовок карточки."
      />

      <FieldSelect
        label="Департамент"
        value={identity.department}
        onChange={(v) => patch({ department: v as Department })}
        options={[
          { value: "analytics", label: DEPARTMENT_LABELS.analytics },
          { value: "preproduction", label: DEPARTMENT_LABELS.preproduction },
          { value: "production", label: DEPARTMENT_LABELS.production },
          { value: "none", label: "Без департамента" },
        ]}
      />

      <FieldText
        label="Аватар"
        placeholder="🦊 или https://… (опционально)"
        value={identity.avatar_url}
        onChange={(v) => patch({ avatar_url: v })}
        hint="Эмодзи или URL картинки. Загрузка файлом появится позже."
      />

      <div className="md:col-span-2">
        <FieldTextarea
          label="Биография"
          required
          rows={4}
          placeholder="2–3 предложения: тон общения, характер, как помогает"
          value={identity.biography}
          onChange={(v) => patch({ biography: v })}
        />
      </div>

      <div className="md:col-span-2 grid grid-cols-1 gap-4 rounded-2xl border border-dashed border-line bg-canvas p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Проверка перед созданием
        </p>
        <FieldTextarea
          label="Зачем нужен этот агент?"
          required
          rows={3}
          placeholder="Какую задачу он решает, которую не закрывает никто из существующих?"
          value={identity.purpose}
          onChange={(v) => patch({ purpose: v })}
          hint="Защита от размножения агентов. В промпт не уходит."
        />
        <FieldTextarea
          label="Критерий успеха через 2 недели"
          required
          rows={3}
          placeholder="Что должно произойти, чтобы оставить агента, а не убрать?"
          value={identity.success_criteria}
          onChange={(v) => patch({ success_criteria: v })}
          hint="Через 2 недели сверитесь с этим критерием — оценить ROI."
        />
      </div>
    </section>
  );
}

// ===========================================================================
// Step 2 — Role
// ===========================================================================

function Step2Role({
  roleMode,
  setRoleMode,
  roleText,
  setRoleText,
  loadTemplate,
  dialogMessages,
  dialogInput,
  setDialogInput,
  dialogBusy,
  dialogError,
  onDialogSend,
  lastDraftIsFinal,
  insertLastDraft,
}: {
  roleMode: "write" | "dialog";
  setRoleMode: (m: "write" | "dialog") => void;
  roleText: string;
  setRoleText: (v: string) => void;
  loadTemplate: () => void;
  dialogMessages: ChatMessage[];
  dialogInput: string;
  setDialogInput: (v: string) => void;
  dialogBusy: boolean;
  dialogError: string | null;
  onDialogSend: (override?: string) => void;
  lastDraftIsFinal: boolean;
  insertLastDraft: () => void;
}) {
  const length = roleText.trim().length;
  const valid = length >= MIN_ROLE_LENGTH;
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-line bg-elevated p-6 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setRoleMode("write")}
          className={
            "focus-ring inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition " +
            (roleMode === "write"
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink")
          }
        >
          <PenLine size={14} /> Написать самому
        </button>
        <button
          type="button"
          onClick={() => setRoleMode("dialog")}
          className={
            "focus-ring inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition " +
            (roleMode === "dialog"
              ? "border-accent bg-accent-soft text-accent"
              : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink")
          }
        >
          <MessageCircle size={14} /> Сформулировать через диалог
        </button>
        <span className="ml-auto text-xs text-ink-faint">
          {length} символов {valid ? "✓" : `(минимум ${MIN_ROLE_LENGTH})`}
        </span>
      </div>

      {roleMode === "dialog" && (
        <DialogPanel
          messages={dialogMessages}
          input={dialogInput}
          setInput={setDialogInput}
          busy={dialogBusy}
          error={dialogError}
          onSend={onDialogSend}
          lastDraftIsFinal={lastDraftIsFinal}
          insertLastDraft={insertLastDraft}
        />
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Role-файл (markdown)
          </span>
          <button
            type="button"
            onClick={loadTemplate}
            className="focus-ring inline-flex items-center gap-1 rounded-md text-xs font-medium text-ink-muted hover:text-ink"
          >
            <FileText size={12} /> Подставить шаблон
          </button>
        </div>
        <textarea
          value={roleText}
          onChange={(e) => setRoleText(e.target.value)}
          spellCheck={false}
          rows={20}
          placeholder="## Зона ответственности
…
"
          className="focus-ring w-full resize-y rounded-2xl border border-line bg-canvas p-4 font-mono text-sm leading-relaxed text-ink placeholder:text-ink-faint"
        />
      </div>
    </section>
  );
}

function DialogPanel({
  messages,
  input,
  setInput,
  busy,
  error,
  onSend,
  lastDraftIsFinal,
  insertLastDraft,
}: {
  messages: ChatMessage[];
  input: string;
  setInput: (v: string) => void;
  busy: boolean;
  error: string | null;
  onSend: (override?: string) => void;
  lastDraftIsFinal: boolean;
  insertLastDraft: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-canvas p-4">
      <div className="flex flex-col gap-3 max-h-[40vh] overflow-y-auto pr-1">
        {messages.length === 0 ? (
          <p className="text-sm text-ink-faint">
            Опишите, чем будет заниматься агент. Можно голосом — кнопка справа от
            поля ввода. Ассистент задаст уточняющие вопросы, потом соберёт
            Role-файл по шаблону.
          </p>
        ) : (
          messages.map((m, i) => <ChatBubble key={i} msg={m} />)
        )}
        {busy && (
          <p className="inline-flex items-center gap-2 text-sm text-ink-muted">
            <Loader2 size={14} className="animate-spin" /> Ассистент думает…
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
      )}

      {lastDraftIsFinal && (
        <button
          type="button"
          onClick={insertLastDraft}
          className="focus-ring inline-flex items-center gap-1.5 self-start rounded-xl bg-accent px-3 py-1.5 text-sm font-semibold text-surface transition hover:bg-accent-hover"
        >
          <ArrowRight size={14} /> Вставить в редактор
        </button>
      )}

      <div className="flex items-end gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSend();
            }
          }}
          placeholder="Например: «Маша смотрит видео конкурентов и достаёт цепляющие приёмы»"
          rows={2}
          className="focus-ring flex-1 resize-y rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
        />
        <VoiceInput
          onTranscribed={(t) => {
            if (!t) return;
            setInput(t);
          }}
        />
        <button
          type="button"
          onClick={() => onSend()}
          disabled={busy || !input.trim()}
          className="focus-ring inline-flex h-10 items-center gap-1.5 rounded-xl bg-ink px-4 text-sm font-semibold text-canvas transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
          Отправить
        </button>
      </div>
    </div>
  );
}

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === "user";
  return (
    <div
      className={
        "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed " +
        (isUser
          ? "self-end bg-accent-soft text-ink"
          : "self-start bg-surface text-ink border border-line")
      }
    >
      <div className="mb-1 inline-flex items-center gap-1.5 text-xs font-semibold text-ink-faint">
        {isUser ? <User size={11} /> : <Bot size={11} />}
        {isUser ? "Вы" : "Ассистент"}
      </div>
      {msg.content}
    </div>
  );
}

// ===========================================================================
// Step 3 — Settings + Test
// ===========================================================================

function Step3Settings({
  availableModels,
  modelsLoaded,
  model,
  setModel,
  seedRulesText,
  setSeedRulesText,
  testQuery,
  setTestQuery,
  testResponse,
  testBusy,
  testError,
  onTestRun,
}: {
  availableModels: Array<{ id: string; provider: string | null; label: string | null }>;
  modelsLoaded: boolean;
  model: string;
  setModel: (id: string) => void;
  seedRulesText: string;
  setSeedRulesText: (v: string) => void;
  testQuery: string;
  setTestQuery: (v: string) => void;
  testResponse: string;
  testBusy: boolean;
  testError: string | null;
  onTestRun: () => void;
}) {
  return (
    <section className="flex flex-col gap-6 rounded-2xl border border-line bg-elevated p-6 shadow-card">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Модель по умолчанию
          </span>
          {!modelsLoaded ? (
            <span className="inline-flex items-center gap-2 text-sm text-ink-muted">
              <Loader2 size={14} className="animate-spin" /> Загружаю список…
            </span>
          ) : (
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="focus-ring h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                  {m.provider ? ` (${m.provider})` : ""}
                </option>
              ))}
            </select>
          )}
          <span className="text-xs text-ink-faint">
            Любую задачу можно переопределить при запуске. Это default.
          </span>
        </label>

        <DisabledField
          label="Доступ к базам"
          hint="Настроите в карточке сотрудника — после создания."
        />
        <DisabledField
          label="Доступные инструменты"
          hint="Появится в следующих этапах."
        />
        <DisabledField
          label="Разрешённые шаблоны задач"
          hint="Появится в следующих этапах."
        />
      </div>

      <FieldTextarea
        label="Стартовые правила (seed rules)"
        rows={5}
        placeholder={`Одно правило — одна строка. Пример:
Вступление не больше двух предложений
Не использовать пафос и громкие слова`}
        value={seedRulesText}
        onChange={setSeedRulesText}
        hint="Эти правила сразу попадут в память агента с source='seed' и в его промпт."
      />

      <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-line bg-canvas p-4">
        <h3 className="font-display text-lg font-semibold tracking-tight">
          Проверить агента
        </h3>
        <p className="text-xs text-ink-muted">
          Промпт собирается так: Mission + Role (из шага 2) + seed rules + ваш
          запрос. Тестовый прогон не сохраняется в журнал задач, но расход
          уйдёт в Админку → Расходы с пометкой test_run.
        </p>
        <textarea
          value={testQuery}
          onChange={(e) => setTestQuery(e.target.value)}
          rows={3}
          placeholder="Тестовый запрос: «Расскажи в трёх предложениях, как тебя зовут и чем ты занимаешься.»"
          className="focus-ring w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onTestRun}
            disabled={testBusy || !testQuery.trim() || !model}
            className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-canvas transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {testBusy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Проверить
          </button>
          {testError && (
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-1.5 text-xs text-rose-800">
              <AlertTriangle size={12} /> {testError}
            </span>
          )}
        </div>
        {testResponse && (
          <div className="rounded-xl border border-line bg-surface p-4 text-sm leading-relaxed text-ink">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-faint">
              Ответ агента
            </p>
            <div className="whitespace-pre-wrap">{testResponse}</div>
          </div>
        )}
      </div>
    </section>
  );
}

// ===========================================================================
// Re-usable field components
// ===========================================================================

function FieldText({
  label,
  value,
  onChange,
  placeholder,
  hint,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="focus-ring h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-faint"
      />
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

function FieldTextarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
  hint,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  hint?: string;
  required?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {label}
        {required && <span className="ml-1 text-rose-500">*</span>}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="focus-ring w-full resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
      />
      {hint && <span className="text-xs text-ink-faint">{hint}</span>}
    </label>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="focus-ring h-10 rounded-lg border border-line bg-surface px-3 text-sm text-ink"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function DisabledField({ label, hint }: { label: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </span>
      <div className="inline-flex h-10 items-center gap-2 rounded-lg border border-dashed border-line bg-canvas px-3 text-sm text-ink-muted">
        <Trash2 size={12} className="opacity-50" />
        Недоступно сейчас
      </div>
      <span className="text-xs text-ink-faint">{hint}</span>
    </div>
  );
}

