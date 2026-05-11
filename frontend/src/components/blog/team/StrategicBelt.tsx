"use client";

import { useEffect, useState } from "react";
import { Target } from "lucide-react";
import { readPromptTemplate } from "@/lib/team/teamPromptsService";

// Сессия 16 этапа 2: стратегический пояс на дашборде.
//
// Тянет два markdown-файла из team-prompts/strategy/ (mission.md, goals.md),
// парсит секции:
//   • из Mission — `## North Star` (одной строкой);
//   • из Goals — `## Фокус на период` (одной строкой);
// и пытается извлечь дату «до …» из секции `## Фокус на период` для
// счётчика «осталось дней» (если она есть).
//
// «Осталось подписчиков» — placeholder-заглушка: данные подключатся, когда
// внутренний аналитик начнёт писать «Текущую точку» (этап 5+).
//
// Если файлов нет или секций не нашли — пояс рендерится с placeholder'ами,
// не падает.

interface StrategicBeltProps {
  initialMission?: string;
  initialGoals?: string;
}

export default function StrategicBelt({
  initialMission,
  initialGoals,
}: StrategicBeltProps) {
  const [mission, setMission] = useState<string | null>(initialMission ?? null);
  const [goals, setGoals] = useState<string | null>(initialGoals ?? null);

  // Грузим файлы один раз при монтировании. Поллинг здесь не нужен —
  // Влад правит mission/goals в Инструкциях, частота низкая.
  useEffect(() => {
    let cancelled = false;
    if (!mission) {
      readPromptTemplate("strategy/mission.md")
        .then((text) => {
          if (!cancelled) setMission(text);
        })
        .catch(() => {
          if (!cancelled) setMission("");
        });
    }
    if (!goals) {
      readPromptTemplate("strategy/goals.md")
        .then((text) => {
          if (!cancelled) setGoals(text);
        })
        .catch(() => {
          if (!cancelled) setGoals("");
        });
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const northStar = extractSectionFirstLine(mission, "North Star");
  const focusBlock = extractSectionFirstLine(goals, "Фокус на период");
  const daysLeft = extractDaysLeft(goals);

  return (
    <section className="rounded-2xl border border-line bg-elevated/50 px-5 py-4 sm:px-6 sm:py-5">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
          <Target size={14} className="text-accent" />
          Стратегия
        </div>
        <div className="flex flex-1 flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] uppercase tracking-wide text-ink-faint">
              Фокус периода
            </span>
            <p className="text-sm font-medium text-ink">
              {focusBlock || (
                <span className="italic text-ink-muted">
                  (фокус не задан — см. Инструкции → Цели на период)
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] uppercase tracking-wide text-ink-faint">
              North Star
            </span>
            <p className="text-sm font-medium text-ink">
              {northStar || (
                <span className="italic text-ink-muted">
                  (North Star не задан — см. Инструкции → Миссия)
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] uppercase tracking-wide text-ink-faint">
              Осталось дней
            </span>
            <p className="text-sm font-medium text-ink">
              {daysLeft !== null ? (
                <>
                  {daysLeft}
                  <span className="ml-1 text-ink-muted">{pluralizeDays(daysLeft)}</span>
                </>
              ) : (
                <span className="italic text-ink-muted">—</span>
              )}
            </p>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] uppercase tracking-wide text-ink-faint">
              До North Star
            </span>
            <p className="text-sm italic text-ink-muted">
              подключится автоматически
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// Возвращает первую непустую строку под заголовком `## <heading>` (case-insensitive)
// или null если секции нет / тело пустое.
function extractSectionFirstLine(text: string | null, heading: string): string | null {
  if (!text) return null;
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^[ \\t]*##[ \\t]+${escaped}[ \\t]*$`, "im");
  const m = text.match(re);
  if (!m) return null;
  const after = text.slice(m.index! + m[0].length);
  // Тело до следующего заголовка # или ##.
  const nextRe = /^[ \t]*#{1,2}[ \t]+\S/m;
  const nextMatch = after.match(nextRe);
  const body = nextMatch ? after.slice(0, nextMatch.index) : after;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.trim().replace(/^[-*•][ \t]+/, "");
    if (!line) continue;
    return line;
  }
  return null;
}

// Пытается найти в Goals дату формата «до 31.05.2026» / «до 31 мая 2026»
// / «до 2026-05-31» в секции «Фокус на период». Возвращает число оставшихся
// дней (≥0) или null.
function extractDaysLeft(goals: string | null): number | null {
  if (!goals) return null;
  const section = extractSectionFirstLine(goals, "Фокус на период");
  if (!section) return null;

  // ISO: 2026-05-31
  let m = section.match(/до\s+(\d{4})-(\d{2})-(\d{2})/i);
  if (m) {
    const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return diffDays(date);
  }
  // dd.mm.yyyy
  m = section.match(/до\s+(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (m) {
    const date = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    return diffDays(date);
  }
  // dd <месяц> yyyy
  const months: Record<string, number> = {
    января: 0, февраля: 1, марта: 2, апреля: 3, мая: 4, июня: 5,
    июля: 6, августа: 7, сентября: 8, октября: 9, ноября: 10, декабря: 11,
  };
  m = section.match(/до\s+(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i);
  if (m) {
    const month = months[m[2].toLowerCase()];
    if (month === undefined) return null;
    const date = new Date(Date.UTC(Number(m[3]), month, Number(m[1])));
    return diffDays(date);
  }
  return null;
}

function diffDays(target: Date): number {
  const now = new Date();
  const today = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const ms = target.getTime() - today.getTime();
  return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
}

function pluralizeDays(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return "дней";
  if (mod10 === 1) return "день";
  if (mod10 >= 2 && mod10 <= 4) return "дня";
  return "дней";
}
