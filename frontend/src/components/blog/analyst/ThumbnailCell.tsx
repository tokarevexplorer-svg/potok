"use client";

import { useState } from "react";
import ImagePreviewModal from "./ImagePreviewModal";

interface ThumbnailCellProps {
  url: string | null;
}

// Превью в ячейке таблицы. Клик — открывает модалку с увеличенной картинкой.
// Курсор zoom-in подсказывает, что картинка кликабельна.
export default function ThumbnailCell({ url }: ThumbnailCellProps) {
  const [open, setOpen] = useState(false);

  if (!url) {
    return <div className="h-14 w-10 rounded-md bg-line/70" aria-hidden />;
  }

  // Прокси-URL — Instagram CDN отдаёт 403 без подмены Referer.
  const proxied = `/api/thumbnail?url=${encodeURIComponent(url)}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Увеличить превью"
        className="focus-ring h-14 w-10 cursor-zoom-in overflow-hidden rounded-md bg-line transition hover:opacity-90"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={proxied}
          alt=""
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
          className="h-full w-full object-cover"
        />
      </button>
      <ImagePreviewModal
        open={open}
        src={proxied}
        alt="Превью видео"
        onClose={() => setOpen(false)}
      />
    </>
  );
}
