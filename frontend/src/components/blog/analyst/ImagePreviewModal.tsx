"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

interface ImagePreviewModalProps {
  open: boolean;
  src: string;
  alt?: string;
  onClose: () => void;
}

// Полноэкранная модалка с увеличенным превью.
// Esc/клик по подложке — закрывают, body-скролл блокируется.
export default function ImagePreviewModal({
  open,
  src,
  alt = "",
  onClose,
}: ImagePreviewModalProps) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Превью видео"
      className="fixed inset-0 z-[100] flex items-center justify-center p-6"
    >
      <div
        role="presentation"
        onClick={onClose}
        className="absolute inset-0 bg-ink/70 backdrop-blur-sm"
      />

      <button
        type="button"
        onClick={onClose}
        className="focus-ring absolute right-6 top-6 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface/90 text-ink-muted shadow-pop transition hover:bg-surface hover:text-ink"
        aria-label="Закрыть"
      >
        <X size={20} />
      </button>

      <div className="relative z-0 flex max-h-[90vh] max-w-[90vw] items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-pop"
        />
      </div>
    </div>
  );
}
