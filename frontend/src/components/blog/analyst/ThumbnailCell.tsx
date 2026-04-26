"use client";

import { useState } from "react";
import type { Rating } from "@/lib/types";
import ImagePreviewModal from "./ImagePreviewModal";
import RatingCell from "./RatingCell";

interface ThumbnailCellProps {
  url: string | null;
  videoId: string;
  rating: Rating | null;
  onSelectRating: (videoId: string, rating: Rating | null) => Promise<void>;
}

// Превью + эмодзи оценки рядом. Клик по картинке — модалка увеличения,
// клик по эмодзи — поповер выбора оценки.
export default function ThumbnailCell({
  url,
  videoId,
  rating,
  onSelectRating,
}: ThumbnailCellProps) {
  const [open, setOpen] = useState(false);

  // Прокси-URL — Instagram CDN отдаёт 403 без подмены Referer.
  const proxied = url ? `/api/thumbnail?url=${encodeURIComponent(url)}` : null;

  return (
    <div className="flex items-start gap-2">
      {proxied ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Увеличить превью"
          className="focus-ring h-14 w-10 shrink-0 cursor-zoom-in overflow-hidden rounded-md bg-line transition hover:opacity-90"
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
      ) : (
        <div className="h-14 w-10 shrink-0 rounded-md bg-line/70" aria-hidden />
      )}

      <RatingCell
        videoId={videoId}
        rating={rating}
        onSelect={onSelectRating}
      />

      {proxied && (
        <ImagePreviewModal
          open={open}
          src={proxied}
          alt="Превью видео"
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
