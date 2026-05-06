"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { transcribeVoice } from "@/lib/team/teamBackendClient";

interface VoiceInputProps {
  // Текст, полученный от Whisper, передаётся целиком — caller сам решает,
  // дописывать его к существующему значению textarea или заменять.
  onTranscribed: (text: string) => void;
  // Опциональная подпись для accessibility (по умолчанию «Записать голосом»).
  ariaLabel?: string;
  // Если у caller'а есть основания скрыть кнопку (например, browser не
  // поддерживает MediaRecorder) — можно передать disabled.
  disabled?: boolean;
}

// Иконка-кнопка микрофона. Логика:
//   1) клик → запрашиваем разрешение getUserMedia({audio: true})
//   2) MediaRecorder пишет в blob (формат — то, что предложит браузер;
//      ffmpeg на бэкенде нормализует через extractAudio)
//   3) повторный клик → останавливаем запись, отправляем blob на
//      /api/team/voice/transcribe, ждём текст, передаём наверх
//   4) при ошибке — alert и возврат в исходное состояние
//
// Состояния: idle / recording / transcribing. Только одна запись за раз.
export default function VoiceInput({
  onTranscribed,
  ariaLabel = "Записать голосом",
  disabled = false,
}: VoiceInputProps) {
  const [state, setState] = useState<"idle" | "recording" | "transcribing">("idle");
  const [supported, setSupported] = useState(true);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    // SSR-безопасная проверка: window и его свойств может не быть на сервере.
    if (typeof window === "undefined") return;
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof window.MediaRecorder === "undefined"
    ) {
      setSupported(false);
    }
  }, []);

  // Гарантированная очистка: при unmount, если запись всё ещё идёт —
  // отпускаем микрофон, чтобы у пользователя не осталась активной зелёная
  // иконка вкладки.
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore
        }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function startRecording() {
    if (state !== "idle" || disabled || !supported) return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      alert(`Не удалось получить доступ к микрофону: ${message}`);
      return;
    }
    streamRef.current = stream;

    let recorder: MediaRecorder;
    try {
      // Без явного mimeType — браузер выбирает лучший доступный (webm/opus
      // на Chromium, mp4/aac на Safari). На бэкенде ffmpeg всё нормализует
      // в mp3 64kbps моно.
      recorder = new MediaRecorder(stream);
    } catch (err) {
      stream.getTracks().forEach((t) => t.stop());
      const message = err instanceof Error ? err.message : String(err);
      alert(`Браузер не поддерживает запись: ${message}`);
      return;
    }

    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = async () => {
      // Освобождаем микрофон сразу — блобы уже в chunksRef.
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;

      const mime = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];

      if (blob.size === 0) {
        setState("idle");
        return;
      }

      setState("transcribing");
      try {
        // Имя файла не важно для бэкенда (определяет по содержимому), но
        // Multer всё равно его требует. Подставляем расширение по mime.
        const ext = mime.includes("webm")
          ? "webm"
          : mime.includes("mp4") || mime.includes("aac")
            ? "m4a"
            : mime.includes("ogg")
              ? "ogg"
              : "webm";
        const result = await transcribeVoice(blob, `voice.${ext}`);
        onTranscribed(result.text || "");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        alert(`Не удалось распознать речь: ${message}`);
      } finally {
        setState("idle");
      }
    };

    recorderRef.current = recorder;
    recorder.start();
    setState("recording");
  }

  function stopRecording() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      recorder.stop();
    }
  }

  function handleClick() {
    if (state === "idle") startRecording();
    else if (state === "recording") stopRecording();
    // transcribing — клики игнорируем, пока ждём ответ Whisper.
  }

  if (!supported) return null;

  const label =
    state === "recording"
      ? "Остановить запись"
      : state === "transcribing"
        ? "Распознаю…"
        : ariaLabel;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || state === "transcribing"}
      className={
        "focus-ring inline-flex h-10 w-10 items-center justify-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-50 " +
        (state === "recording"
          ? "border-accent bg-accent/10 text-accent animate-pulse"
          : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink")
      }
      aria-label={label}
      title={label}
    >
      {state === "transcribing" ? (
        <Loader2 size={18} className="animate-spin" />
      ) : state === "recording" ? (
        <MicOff size={18} />
      ) : (
        <Mic size={18} />
      )}
    </button>
  );
}
