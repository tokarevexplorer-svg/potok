"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";

interface AutosavingTextEditorProps {
  // Имя поля для отображения в индикаторе сохранения («Контекст», «Концепция»).
  label: string;
  // Начальное значение из БД/Storage. Если null — поле пустое.
  initialValue: string | null;
  // Подпись внутри textarea для пустого значения.
  placeholder?: string;
  // Функция сохранения. Получает свежее значение, бросает на ошибке.
  onSave: (value: string) => Promise<void>;
  // Минимальная высота textarea. Дефолт — крупный, чтобы было удобно писать.
  minRows?: number;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

const AUTOSAVE_DELAY_MS = 1000;

// Поле для крупных текстов (context.md, concept.md) с автосохранением:
//   • debounce 1 секунда после остановки ввода → save
//   • Esc и blur → немедленный save
//   • визуальный индикатор статуса (Сохраняю / Сохранено / Ошибка)
//
// Паттерн взят из NoteCell Потока (autosave при blur/Esc), расширен для
// контролируемого случая «непрерывная правка большого markdown'а».
export default function AutosavingTextEditor({
  label,
  initialValue,
  placeholder,
  onSave,
  minRows = 18,
}: AutosavingTextEditorProps) {
  const [value, setValue] = useState(initialValue ?? "");
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const lastSavedRef = useRef<string>(initialValue ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Если внешнее initialValue поменялось (другая вкладка БД, ручная перезагрузка
  // данных) — синкаем; но только если сейчас нет несохранённых правок.
  useEffect(() => {
    if (state.kind === "saving") return;
    const next = initialValue ?? "";
    if (next !== lastSavedRef.current && next !== value) {
      setValue(next);
      lastSavedRef.current = next;
      setState({ kind: "idle" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialValue]);

  const flush = useCallback(
    async (raw: string) => {
      const trimmedSame = raw === lastSavedRef.current;
      if (trimmedSame) return;
      setState({ kind: "saving" });
      try {
        await onSave(raw);
        lastSavedRef.current = raw;
        setState({ kind: "saved", at: Date.now() });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState({ kind: "error", message });
      }
    },
    [onSave],
  );

  // На каждое изменение — переустанавливаем таймер. Если за AUTOSAVE_DELAY_MS
  // нет нового изменения, выполняем save.
  function handleChange(next: string) {
    setValue(next);
    if (state.kind === "error") {
      // Сбрасываем ошибку, как только пользователь начал что-то править —
      // ниже flush попробует сохранить ещё раз и обновит state.
      setState({ kind: "idle" });
    }
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flush(next);
    }, AUTOSAVE_DELAY_MS);
  }

  function handleBlur() {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    void flush(value);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void flush(value);
      // Снимаем фокус — это закрывает идеальный «закончил мысль» жест.
      (e.target as HTMLTextAreaElement).blur();
    }
  }

  // Чистим таймер при unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={minRows}
        spellCheck
        className="focus-ring min-h-[400px] w-full resize-y rounded-2xl border border-line bg-canvas p-4 font-mono text-sm leading-relaxed text-ink placeholder:text-ink-faint"
      />
      <div className="flex items-center justify-between text-xs">
        <SaveIndicator label={label} state={state} />
        <span className="text-ink-faint">
          Сохраняется автоматически · Esc — сохранить и снять фокус
        </span>
      </div>
    </div>
  );
}

function SaveIndicator({ label, state }: { label: string; state: SaveState }) {
  if (state.kind === "saving") {
    return (
      <span className="inline-flex items-center gap-1.5 text-ink-faint">
        <Loader2 size={12} className="animate-spin" />
        Сохраняю «{label}»…
      </span>
    );
  }
  if (state.kind === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-emerald-700">
        <Check size={12} />
        Сохранено в Storage
      </span>
    );
  }
  if (state.kind === "error") {
    return <span className="text-rose-700">Ошибка: {state.message}</span>;
  }
  return <span className="text-ink-faint">Готово к редактированию</span>;
}
