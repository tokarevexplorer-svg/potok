"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Trash2,
  X,
} from "lucide-react";
import clsx from "clsx";
import type { MyCategory, Tag, Video } from "@/lib/types";
import { buildInstagramEmbedUrl } from "@/lib/instagramEmbed";
import { formatAiCategory } from "@/lib/aiCategories";
import type { SwipeRightPayload } from "@/lib/manualFieldsService";
import EntityChip from "./EntityChip";
import SwipeRightFlow from "./SwipeRightFlow";

type ViewerMode = "default" | "cleanup";

interface SwipeViewerProps {
  /** Снимок видео на момент открытия — итерация по нему фиксирована. */
  videos: Video[];
  startIndex?: number;
  /**
   * Режим работы:
   *  - "default": свайп влево → меню «Удалить/В закладки», свайп вправо → воронка тегов/категории/оценки.
   *  - "cleanup": свайп влево → сразу в закладки, свайп вправо → пометить «для блога» (is_reference=true). Без меню/воронки.
   */
  mode?: ViewerMode;
  myCategories: MyCategory[];
  tags: Tag[];
  onClose: () => void;
  onDelete: (videoId: string) => Promise<void>;
  onMoveToBookmarks: (videoId: string) => Promise<void>;
  /** Только для cleanup-режима: пометить видео как «полезно для блога». */
  onMarkAsReference?: (videoId: string) => Promise<void>;
  onCreateMyCategory: (name: string) => Promise<MyCategory>;
  onCreateTag: (name: string) => Promise<Tag>;
  onSubmitRightFlow: (videoId: string, payload: SwipeRightPayload) => Promise<void>;
}

const SWIPE_THRESHOLD = 110;
const SWIPE_VELOCITY = 0.6;
const ANIM_MS = 250;
// Если iframe не вызвал onLoad за этот таймаут — показываем fallback c превью.
const EMBED_TIMEOUT_MS = 5000;

// Полноэкранный Tinder-режим: одна карточка по центру, свайп влево/вправо
// (мышь, тач, клавиатура), счётчик прогресса. Влево → мини-меню «Удалить /
// В закладки». Вправо → воронка SwipeRightFlow (категория → заметка/теги →
// оценка), после неё — переход к следующей карточке.
export default function SwipeViewer({
  videos: initialVideos,
  startIndex = 0,
  mode = "default",
  myCategories,
  tags,
  onClose,
  onDelete,
  onMoveToBookmarks,
  onMarkAsReference,
  onCreateMyCategory,
  onCreateTag,
  onSubmitRightFlow,
}: SwipeViewerProps) {
  // Снапшот списка фиксируем здесь — пока пользователь смотрит, удаления и
  // перенос в закладки изменяют parent state, но мы продолжаем итерацию.
  const [videos] = useState(initialVideos);
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, startIndex), Math.max(0, initialVideos.length - 1)),
  );
  const [drag, setDrag] = useState<{ dx: number; dy: number } | null>(null);
  const [exitDir, setExitDir] = useState<"left" | "right" | null>(null);
  const [postLeftMenu, setPostLeftMenu] = useState(false);
  // Воронка после правого свайпа — рендерится поверх карточки.
  const [rightFlowOpen, setRightFlowOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // iframe не вызвал onLoad за 5 сек → переключаемся на fallback с превью.
  // Для фото/каруселей iframe не показываем вовсе.
  const [embedFailed, setEmbedFailed] = useState(false);

  const start = useRef<{ x: number; y: number; t: number } | null>(null);

  const total = videos.length;
  const current = index < total ? videos[index] : null;

  // Блокируем скролл фона на время режима.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // При смене карточки — сбрасываем все промежуточные состояния анимации.
  useEffect(() => {
    setExitDir(null);
    setDrag(null);
    setPostLeftMenu(false);
    setRightFlowOpen(false);
    setEmbedFailed(false);
  }, [index]);

  const triggerSwipe = useCallback(
    (direction: "left" | "right") => {
      if (busy || exitDir || postLeftMenu || rightFlowOpen) return;
      if (!current) return;

      // Cleanup-режим: оба свайпа фиксируют действие сразу, без меню/воронки.
      // Влево → в закладки, вправо → пометить как «для блога». Анимация ухода
      // идёт в обе стороны — пользователь должен видеть фиксацию выбора.
      if (mode === "cleanup") {
        setExitDir(direction);
        setDrag(null);
        const action = direction === "left" ? "bookmark" : "markRef";
        window.setTimeout(() => {
          performCleanupAction(action);
        }, ANIM_MS);
        return;
      }

      // Default-режим:
      // Вправо: открываем воронку без анимации ухода — карточка остаётся
      // на месте (видна за затемнённой подложкой), листание произойдёт после
      // сохранения. Влево: классическая анимация + мини-меню.
      if (direction === "right") {
        setDrag(null);
        setRightFlowOpen(true);
        return;
      }
      setExitDir(direction);
      setDrag(null);
      window.setTimeout(() => {
        setPostLeftMenu(true);
      }, ANIM_MS);
    },
    // performCleanupAction опирается на current/onMoveToBookmarks/onMarkAsReference
    // — но мы их не включаем в deps, чтобы не пересоздавать триггер на каждом
    // рендере. Внутри performCleanupAction всегда читаем актуальные ссылки через
    // замыкание на момент клика — это допустимо, потому что свайп — мгновенное
    // действие.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy, exitDir, postLeftMenu, rightFlowOpen, current, mode],
  );

  async function performCleanupAction(action: "bookmark" | "markRef") {
    if (!current) return;
    setBusy(true);
    try {
      if (action === "bookmark") {
        await onMoveToBookmarks(current.id);
      } else if (onMarkAsReference) {
        await onMarkAsReference(current.id);
      }
      setBusy(false);
      setExitDir(null);
      setIndex((i) => i + 1);
    } catch (e) {
      // Ошибка: возвращаем карточку в исходную позицию, оставляем индекс,
      // показываем сообщение. Пользователь может попробовать заново.
      setBusy(false);
      setExitDir(null);
      alert((e as Error).message);
    }
  }

  function onPointerDown(e: React.PointerEvent) {
    if (busy || exitDir || postLeftMenu || rightFlowOpen) return;
    // Не перехватываем тачи на iframe — Instagram должен получать свои клики.
    const target = e.target as HTMLElement;
    if (target.tagName === "IFRAME") return;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
    setDrag({ dx: 0, dy: 0 });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!start.current) return;
    setDrag({
      dx: e.clientX - start.current.x,
      dy: e.clientY - start.current.y,
    });
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!start.current) return;
    const dx = e.clientX - start.current.x;
    const elapsed = Date.now() - start.current.t || 1;
    const v = Math.abs(dx) / elapsed;
    start.current = null;
    if (Math.abs(dx) > SWIPE_THRESHOLD || v > SWIPE_VELOCITY) {
      triggerSwipe(dx > 0 ? "right" : "left");
    } else {
      setDrag(null);
    }
  }

  // Клавиатура: Esc закрывает (или скрывает меню), стрелки листают. Когда
  // открыта воронка правого свайпа — стрелки игнорируем (Esc ловит сама воронка).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (rightFlowOpen) return;
      if (e.key === "Escape") {
        if (postLeftMenu) setPostLeftMenu(false);
        else onClose();
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        triggerSwipe("left");
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        triggerSwipe("right");
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [postLeftMenu, rightFlowOpen, onClose, triggerSwipe]);

  async function handleDelete() {
    if (!current || busy) return;
    setBusy(true);
    try {
      await onDelete(current.id);
      setBusy(false);
      setPostLeftMenu(false);
      setIndex((i) => i + 1);
    } catch (e) {
      setBusy(false);
      alert((e as Error).message);
    }
  }

  async function handleBookmark() {
    if (!current || busy) return;
    setBusy(true);
    try {
      await onMoveToBookmarks(current.id);
      setBusy(false);
      setPostLeftMenu(false);
      setIndex((i) => i + 1);
    } catch (e) {
      setBusy(false);
      alert((e as Error).message);
    }
  }

  async function handleRightFlowSubmit(
    videoId: string,
    payload: SwipeRightPayload,
  ) {
    await onSubmitRightFlow(videoId, payload);
    setRightFlowOpen(false);
    setIndex((i) => i + 1);
  }

  if (typeof document === "undefined") return null;

  // Список закончился — показываем экран завершения.
  if (!current) {
    return createPortal(
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-4 bg-canvas p-6">
        <button
          type="button"
          onClick={onClose}
          className="focus-ring absolute left-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink-muted transition hover:text-ink"
          aria-label="Закрыть"
          title="Закрыть (Esc)"
        >
          <X size={20} />
        </button>
        <p className="font-display text-2xl text-ink">
          {total === 0
            ? mode === "cleanup"
              ? "Нет видео для разбора"
              : "В таблице нет видео"
            : mode === "cleanup"
              ? "Очистка завершена"
              : "Все видео просмотрены"}
        </p>
        {total > 0 && (
          <p className="text-sm text-ink-muted">
            {mode === "cleanup"
              ? `Разобрано: ${total} ${total === 1 ? "видео" : "видео"}`
              : `Просмотрено: ${total} из ${total}`}
          </p>
        )}
        <button
          type="button"
          onClick={onClose}
          className="focus-ring mt-2 inline-flex h-12 items-center justify-center rounded-xl bg-accent px-5 text-base font-medium text-surface shadow-card transition hover:bg-accent-hover"
        >
          Вернуться к таблице
        </button>
      </div>,
      document.body,
    );
  }

  // Трансформация карточки: либо «уходит» с экрана, либо тащится за курсором.
  let cardTransform: string | undefined;
  let cardOpacity: number | undefined;
  if (exitDir) {
    const sign = exitDir === "left" ? -1 : 1;
    cardTransform = `translateX(${sign * 1500}px) rotate(${sign * 30}deg)`;
    cardOpacity = 0;
  } else if (drag) {
    cardTransform = `translate(${drag.dx}px, ${drag.dy * 0.2}px) rotate(${drag.dx * 0.05}deg)`;
  }

  // Для фото/каруселей iframe-плеер бесполезен — Instagram отдаст пустоту или
  // битый embed. Сразу показываем превью + кнопку «Открыть в Instagram».
  const useEmbed = current.contentType === "video";
  const embedUrl = useEmbed ? buildInstagramEmbedUrl(current.url) : null;
  const author = current.author ?? "Автор не указан";
  const summary = current.aiSummary;
  const categoryLabel = formatAiCategory(
    current.aiCategory,
    current.aiCategorySuggestion,
  );

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-canvas">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-line bg-surface/80 px-4 py-3 backdrop-blur">
        <button
          type="button"
          onClick={onClose}
          className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-ink-muted transition hover:text-ink"
          aria-label="Закрыть просмотр"
          title="Esc"
        >
          <X size={20} />
        </button>
        <div className="text-sm font-medium text-ink-muted">
          {mode === "cleanup"
            ? `Осталось проверить: ${total - index}`
            : `${index + 1} из ${total}`}
        </div>
        <div className="w-10" aria-hidden />
      </div>

      {/* Card area */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden px-2 py-4 sm:px-6">
        <button
          type="button"
          onClick={() => triggerSwipe("left")}
          aria-label="Предыдущее (←)"
          title="←"
          className="focus-ring absolute left-3 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink-muted shadow-card transition hover:bg-elevated hover:text-ink lg:inline-flex"
        >
          <ChevronLeft size={24} />
        </button>
        <button
          type="button"
          onClick={() => triggerSwipe("right")}
          aria-label="Следующее (→)"
          title="→"
          className="focus-ring absolute right-3 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-surface text-ink-muted shadow-card transition hover:bg-elevated hover:text-ink lg:inline-flex"
        >
          <ChevronRight size={24} />
        </button>

        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          style={{
            transform: cardTransform,
            opacity: cardOpacity,
            transition:
              drag !== null
                ? "none"
                : `transform ${ANIM_MS}ms ease, opacity ${ANIM_MS}ms ease`,
            touchAction: "pan-y",
          }}
          className={clsx(
            "flex h-full w-full max-w-[420px] flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-pop",
            !drag && !exitDir && "cursor-grab active:cursor-grabbing",
          )}
        >
          {/* Видео / fallback */}
          <div className="relative w-full flex-1 overflow-hidden bg-elevated">
            <CardMedia
              key={current.id}
              embedUrl={embedUrl}
              videoId={current.id}
              videoUrl={current.url}
              thumbnailUrl={current.thumbnailUrl}
              embedFailed={embedFailed}
              onEmbedFail={() => setEmbedFailed(true)}
            />

            {/* Кнопка «Открыть в Instagram» — всегда видна поверх плеера/превью.
                На мобиле URL открывает приложение Instagram автоматически. */}
            <a
              href={current.url}
              target="_blank"
              rel="noreferrer"
              onPointerDown={(e) => e.stopPropagation()}
              className="focus-ring absolute right-3 top-3 z-10 inline-flex items-center gap-1.5 rounded-full bg-ink/70 px-3 py-1.5 text-xs font-medium text-surface backdrop-blur-sm transition hover:bg-ink/85"
              title="Открыть пост в Instagram"
            >
              <ExternalLink size={14} />
              <span className="hidden sm:inline">Instagram</span>
            </a>
          </div>

          {/* Инфо-панель: автор, AI-саммари, категория */}
          <div className="flex flex-col gap-2 border-t border-line p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {author}
            </div>
            {summary ? (
              <p className="line-clamp-2 text-sm leading-snug text-ink">{summary}</p>
            ) : (
              <p className="text-sm italic text-ink-faint">
                Саммари ещё не готово
              </p>
            )}
            {categoryLabel && (
              <div>
                <EntityChip name={categoryLabel} color="blue" size="sm" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Подсказка по управлению */}
      <div className="border-t border-line px-4 py-2 text-center text-xs text-ink-faint">
        {mode === "cleanup"
          ? "← в закладки · → для блога · клавиши ← / → · Esc — закрыть"
          : "← мимо · → следующее · клавиши ← / → · Esc — закрыть"}
      </div>

      {/* Воронка после свайпа вправо */}
      {rightFlowOpen && current && (
        <SwipeRightFlow
          video={current}
          myCategories={myCategories}
          tags={tags}
          onCreateMyCategory={onCreateMyCategory}
          onCreateTag={onCreateTag}
          onSubmit={handleRightFlowSubmit}
          onCancel={() => setRightFlowOpen(false)}
        />
      )}

      {/* Меню после свайпа влево */}
      {postLeftMenu && (
        <div
          className="absolute inset-0 z-[110] flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-pop">
            <h3 className="font-display text-lg text-ink">
              Что сделать с видео?
            </h3>
            <button
              type="button"
              onClick={handleDelete}
              disabled={busy}
              className="focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 size={18} />
              Удалить
            </button>
            <button
              type="button"
              onClick={handleBookmark}
              disabled={busy}
              className="focus-ring inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-line bg-elevated px-4 text-sm font-semibold text-ink transition hover:bg-line/40 disabled:opacity-50"
            >
              <Bookmark size={18} />В закладки
            </button>
            <button
              type="button"
              onClick={() => setPostLeftMenu(false)}
              disabled={busy}
              className="focus-ring inline-flex h-10 items-center justify-center rounded-xl text-sm text-ink-muted transition hover:bg-elevated disabled:opacity-50"
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}

interface CardMediaProps {
  embedUrl: string | null;
  videoId: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  embedFailed: boolean;
  onEmbedFail: () => void;
}

// Внутренности карточки: iframe Instagram-плеера или fallback с превью.
// Если iframe не успел загрузиться за EMBED_TIMEOUT_MS — переключаемся на превью.
// Для фото/каруселей вызывающий код передаёт embedUrl=null, и мы сразу
// показываем превью.
function CardMedia({
  embedUrl,
  videoId,
  videoUrl,
  thumbnailUrl,
  embedFailed,
  onEmbedFail,
}: CardMediaProps) {
  // Таймер ставим при каждом новом video id; чистим при unmount/смене карточки.
  useEffect(() => {
    if (!embedUrl || embedFailed) return;
    const timer = window.setTimeout(onEmbedFail, EMBED_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
    // videoId передан только чтобы гарантировать рестарт таймера на новой карточке.
  }, [embedUrl, embedFailed, onEmbedFail, videoId]);

  if (embedUrl && !embedFailed) {
    return (
      <iframe
        src={embedUrl}
        title="Instagram embed"
        className="h-full w-full"
        allow="autoplay; encrypted-media; picture-in-picture; clipboard-write"
        allowFullScreen
        referrerPolicy="no-referrer"
        // onLoad срабатывает один раз — отменять таймер не обязательно, но и не вредно.
        onLoad={() => {
          /* iframe загрузился — оставляем как есть */
        }}
      />
    );
  }

  if (thumbnailUrl) {
    return (
      <div className="relative h-full w-full">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/thumbnail?url=${encodeURIComponent(thumbnailUrl)}`}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
        <a
          href={videoUrl}
          target="_blank"
          rel="noreferrer"
          onPointerDown={(e) => e.stopPropagation()}
          className="focus-ring absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-xl bg-surface/95 px-5 py-3 text-sm font-medium text-ink shadow-pop transition hover:bg-surface"
        >
          <ExternalLink size={16} />
          Смотреть в Instagram
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full items-center justify-center p-6 text-center text-sm text-ink-muted">
      Не удалось определить ссылку на видео
    </div>
  );
}
