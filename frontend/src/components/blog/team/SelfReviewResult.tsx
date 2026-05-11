"use client";

// Сессия 30: блок с результатом самопроверки в карточке задачи.
//
// Source-метки (memory_rule, skill, template_field, mission_taboo,
// vlad_extra, tool_manifest) переводятся на русский. Иконка пункта:
//   ✅ — «да»
//   ❌ — «нет»  (подсвечивается красным фоном)
//   ➖ — «неприменимо»
//
// Бейдж сверху:
//   passed=true                       → «✅ Пройдена»
//   passed=false, revised=true        → «⚠️ Пройдена с правками»
//   passed=false, revised=false       → «❌ Не пройдена полностью»
//
// Если revised=true — внизу пометка «Результат был исправлен на основании
// пунктов "нет". Исходная версия сохранена в логе».

import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Minus, X } from "lucide-react";
import type { SelfReviewResultPayload } from "@/lib/team/types";

const SOURCE_LABELS: Record<string, string> = {
  memory_rule: "Правило Memory",
  skill: "Навык",
  template_field: "ТЗ",
  mission_taboo: "Табу Mission",
  vlad_extra: "Доп. проверка",
  tool_manifest: "Инструмент",
};

interface Props {
  result: SelfReviewResultPayload;
}

export default function SelfReviewResult({ result }: Props) {
  const [open, setOpen] = useState(false);

  if (!result) return null;

  // skipped: true приходит из selfReviewService, если чек-лист оказался
  // пустым после фильтрации. В таком случае в team_tasks self_review_result
  // обычно null, но если запись всё-таки есть — показываем мягким текстом.
  if (result.skipped) {
    return (
      <section className="mt-5 rounded-2xl border border-line bg-elevated/40 p-4 text-sm text-ink-faint">
        <p>
          🔍 Самопроверка пропущена{result.reason ? `: ${result.reason}` : "."}
        </p>
      </section>
    );
  }

  const checklist = Array.isArray(result.checklist) ? result.checklist : [];
  const totalNo = checklist.filter((c) => c.result === "нет").length;
  const totalYes = checklist.filter((c) => c.result === "да").length;
  const totalNA = checklist.filter((c) => c.result === "неприменимо").length;

  const badge = computeBadge(result);

  return (
    <section className="mt-5 rounded-2xl border border-line bg-elevated/40 p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="focus-ring flex w-full items-center justify-between gap-3 rounded-lg p-1 text-left"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-ink">🔍 Самопроверка</span>
          <BadgePill kind={badge.kind} label={badge.label} />
          <span className="text-xs text-ink-faint">
            {totalYes} ✓ · {totalNo} ✗ · {totalNA} ➖
          </span>
        </div>
        {open ? (
          <ChevronDown size={16} className="text-ink-faint" />
        ) : (
          <ChevronRight size={16} className="text-ink-faint" />
        )}
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-1">
          {checklist.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line bg-canvas px-3 py-2 text-sm text-ink-faint">
              Чек-лист пуст.
            </p>
          ) : (
            checklist.map((entry, idx) => (
              <ChecklistRow key={idx} entry={entry} />
            ))
          )}
          {result.parse_error && (
            <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {result.parse_error}
            </p>
          )}
          {result.revised && (
            <p className="mt-2 text-xs text-ink-faint">
              Результат был исправлен на основании пунктов «нет». Исходная
              версия сохранена в логе.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function ChecklistRow({
  entry,
}: {
  entry: SelfReviewResultPayload["checklist"][number];
}) {
  const isNo = entry.result === "нет";
  const source = SOURCE_LABELS[entry.source] ?? entry.source;
  const containerClass = isNo
    ? "rounded-lg border border-rose-200 bg-rose-50 px-3 py-2"
    : "rounded-lg border border-transparent bg-canvas px-3 py-2";
  return (
    <div className={containerClass}>
      <div className="flex items-start gap-2">
        <ResultIcon value={entry.result} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-faint">
            {source}
          </p>
          <p className="mt-0.5 break-words text-sm text-ink">{entry.item}</p>
          {entry.comment && (
            <p className="mt-1 italic text-xs text-ink-muted">
              {entry.comment}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ResultIcon({ value }: { value: string }) {
  if (value === "да") {
    return (
      <span
        className="mt-1 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
        aria-label="да"
      >
        <Check size={12} />
      </span>
    );
  }
  if (value === "нет") {
    return (
      <span
        className="mt-1 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-rose-100 text-rose-700"
        aria-label="нет"
      >
        <X size={12} />
      </span>
    );
  }
  return (
    <span
      className="mt-1 inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-canvas text-ink-faint"
      aria-label="неприменимо"
    >
      <Minus size={12} />
    </span>
  );
}

type BadgeKind = "passed" | "revised" | "failed";

function computeBadge(result: SelfReviewResultPayload): {
  kind: BadgeKind;
  label: string;
} {
  if (result.passed) return { kind: "passed", label: "✅ Пройдена" };
  if (result.revised) return { kind: "revised", label: "⚠️ Пройдена с правками" };
  return { kind: "failed", label: "❌ Не пройдена полностью" };
}

function BadgePill({ kind, label }: { kind: BadgeKind; label: string }) {
  const cls =
    kind === "passed"
      ? "bg-emerald-100 text-emerald-800"
      : kind === "revised"
        ? "bg-amber-100 text-amber-900"
        : "bg-rose-100 text-rose-800";
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
