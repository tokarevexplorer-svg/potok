"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Filter, Maximize2, Minimize2, PlayCircle } from "lucide-react";
import clsx from "clsx";
import type { MyCategory, Rating, Tag, Video } from "@/lib/types";
import {
  applyFilters,
  initialFilterState,
  uniqueAuthors,
  type FilterState,
} from "@/lib/videoFilters";
import { pickNextColor, type EntityColor } from "@/lib/tagColors";
import * as svc from "@/lib/manualFieldsService";
import type { SwipeRightPayload } from "@/lib/manualFieldsService";
import { deleteVideo, deleteVideos } from "@/lib/videoDeleteService";
import VideoTable from "./VideoTable";
import VideoTableEmpty from "./VideoTableEmpty";
import FilterBar from "./FilterBar";
import EntityManageModal from "./EntityManageModal";
import BulkActionBar from "./BulkActionBar";
import BatchProgressBar from "./BatchProgressBar";
import ConfirmDialog from "./ConfirmDialog";
import SwipeViewer from "./SwipeViewer";

interface AnalystWorkspaceProps {
  initialVideos: Video[];
  initialMyCategories: MyCategory[];
  initialTags: Tag[];
}

// Главный клиентский экран Аналитика. Держит локальный state видео/категорий/
// тегов и фильтров. Все правки идут через manualFieldsService и обновляют
// state оптимистично — без revalidate, чтобы взаимодействие было мгновенным.
export default function AnalystWorkspace({
  initialVideos,
  initialMyCategories,
  initialTags,
}: AnalystWorkspaceProps) {
  const [videos, setVideos] = useState(initialVideos);
  const [myCategories, setMyCategories] = useState(initialMyCategories);
  const [tags, setTags] = useState(initialTags);
  const [filters, setFilters] = useState<FilterState>(initialFilterState);
  const [fullscreen, setFullscreen] = useState(false);
  const [manageMode, setManageMode] = useState<"none" | "categories" | "tags">("none");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // Подтверждение удаления: либо для одной строки, либо для bulk-операции.
  const [pendingDelete, setPendingDelete] = useState<
    | { kind: "single"; id: string }
    | { kind: "bulk"; ids: string[] }
    | null
  >(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  // Подтверждение массового переноса в закладки.
  const [pendingBookmark, setPendingBookmark] = useState<{ ids: string[] } | null>(
    null,
  );
  const [bookmarkBusy, setBookmarkBusy] = useState(false);
  // Tinder-режим: храним снимок отфильтрованного списка на момент открытия,
  // чтобы удаления и переносы в закладки не сбивали итерацию.
  // mode = "default" — обычный просмотр (свайпы открывают меню/воронку).
  // mode = "cleanup" — быстрая очистка по is_reference=false (влево → в закладки,
  // вправо → пометить «для блога», без меню/воронки).
  const [viewer, setViewer] = useState<
    { mode: "default" | "cleanup"; videos: Video[] } | null
  >(null);

  // Когда сервер обновил пропсы (после addVideo + revalidatePath) — синкаем state.
  useEffect(() => setVideos(initialVideos), [initialVideos]);
  useEffect(() => setMyCategories(initialMyCategories), [initialMyCategories]);
  useEffect(() => setTags(initialTags), [initialTags]);

  // Подчищаем выделение: если видео уже нет в списке (новые initialVideos
  // или удаление), не держим «висящие» id.
  useEffect(() => {
    setSelectedIds((prev) => {
      const valid = new Set(videos.map((v) => v.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (valid.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [videos]);

  // Fullscreen: блокируем скролл и закрываем по Esc.
  useEffect(() => {
    if (!fullscreen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setFullscreen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [fullscreen]);

  const filtered = useMemo(() => applyFilters(videos, filters), [videos, filters]);
  const authors = useMemo(() => uniqueAuthors(videos), [videos]);
  // Сколько видео ждут разбора в режиме «Очистка» (помечены AI как not-ref).
  const cleanupCount = useMemo(
    () => videos.filter((v) => v.isReference === false).length,
    [videos],
  );

  // ------- Мутации видео -------

  const handleSelectMyCategory = useCallback(
    async (videoId: string, categoryId: string | null) => {
      setVideos((prev) =>
        prev.map((v) => (v.id === videoId ? { ...v, myCategoryId: categoryId } : v)),
      );
      try {
        await svc.setVideoMyCategory(videoId, categoryId);
      } catch (e) {
        alert((e as Error).message);
      }
    },
    [],
  );

  const handleAttachTag = useCallback(async (videoId: string, tagId: string) => {
    setVideos((prev) =>
      prev.map((v) =>
        v.id === videoId && !v.tagIds.includes(tagId)
          ? { ...v, tagIds: [...v.tagIds, tagId] }
          : v,
      ),
    );
    try {
      await svc.attachTag(videoId, tagId);
    } catch (e) {
      alert((e as Error).message);
    }
  }, []);

  const handleDetachTag = useCallback(async (videoId: string, tagId: string) => {
    setVideos((prev) =>
      prev.map((v) =>
        v.id === videoId ? { ...v, tagIds: v.tagIds.filter((id) => id !== tagId) } : v,
      ),
    );
    try {
      await svc.detachTag(videoId, tagId);
    } catch (e) {
      alert((e as Error).message);
    }
  }, []);

  const handleSaveNote = useCallback(
    async (videoId: string, value: string | null) => {
      setVideos((prev) =>
        prev.map((v) => (v.id === videoId ? { ...v, note: value } : v)),
      );
      try {
        await svc.setVideoNote(videoId, value);
      } catch (e) {
        alert((e as Error).message);
      }
    },
    [],
  );

  const handleUpdateRatings = useCallback(
    async (videoId: string, ratings: Rating[]) => {
      setVideos((prev) =>
        prev.map((v) => (v.id === videoId ? { ...v, ratings } : v)),
      );
      try {
        await svc.setVideoRatings(videoId, ratings);
      } catch (e) {
        alert((e as Error).message);
      }
    },
    [],
  );

  const handleUpdateIsReference = useCallback(
    async (videoId: string, value: boolean | null) => {
      setVideos((prev) =>
        prev.map((v) => (v.id === videoId ? { ...v, isReference: value } : v)),
      );
      try {
        await svc.setVideoIsReference(videoId, value);
      } catch (e) {
        alert((e as Error).message);
      }
    },
    [],
  );

  // ------- Выбор строк -------

  const handleToggleSelected = useCallback((videoId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(videoId)) next.delete(videoId);
      else next.add(videoId);
      return next;
    });
  }, []);

  // Чекбокс в шапке: если выбраны не все из отфильтрованных — добивает до всех,
  // иначе снимает выделение со всех видимых.
  const handleToggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const visibleIds = filtered.map((v) => v.id);
      const allSelected = visibleIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  }, [filtered]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // ------- Удаление -------

  const handleRequestDelete = useCallback((videoId: string) => {
    setPendingDelete({ kind: "single", id: videoId });
  }, []);

  const handleRequestBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    setPendingDelete({ kind: "bulk", ids: Array.from(selectedIds) });
  }, [selectedIds]);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleteBusy(true);
    const ids =
      pendingDelete.kind === "single" ? [pendingDelete.id] : pendingDelete.ids;
    // Собираем storagePaths из снапшота — потом удалятся вместе с записями.
    const idSet = new Set(ids);
    const storagePaths = videos
      .filter((v) => idSet.has(v.id))
      .map((v) => v.thumbnailStoragePath)
      .filter((x): x is string => Boolean(x));
    // Оптимистично убираем из state — если упадёт, вернём.
    const snapshot = videos;
    setVideos((prev) => prev.filter((v) => !ids.includes(v.id)));
    try {
      if (pendingDelete.kind === "single") {
        await deleteVideo(pendingDelete.id, storagePaths[0] ?? null);
      } else {
        await deleteVideos(pendingDelete.ids, storagePaths);
      }
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setPendingDelete(null);
    } catch (e) {
      setVideos(snapshot);
      alert("Не удалось удалить: " + (e as Error).message);
    } finally {
      setDeleteBusy(false);
    }
  }

  // ------- Массовый перенос в закладки -------

  const handleRequestBulkBookmark = useCallback(() => {
    if (selectedIds.size === 0) return;
    setPendingBookmark({ ids: Array.from(selectedIds) });
  }, [selectedIds]);

  async function confirmBookmark() {
    if (!pendingBookmark) return;
    setBookmarkBusy(true);
    const { ids } = pendingBookmark;
    const snapshot = videos;
    // Оптимистично режем строки. moveToBookmarks внутри делает upsert+delete,
    // и если на середине пачки сеть упадёт — часть уже уехала, мы откатываем
    // только в state, БД остаётся в консистентном состоянии (просто меньше
    // строк, чем планировали).
    setVideos((prev) => prev.filter((v) => !ids.includes(v.id)));
    try {
      await svc.moveManyToBookmarks(ids);
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setPendingBookmark(null);
    } catch (e) {
      // Если упало — самый безопасный путь: вернуть весь снапшот, при
      // следующем revalidatePath реальная картина с сервера всё равно
      // подтянется. До тех пор пользователь увидит лишние строки, но это
      // лучше, чем потеря.
      setVideos(snapshot);
      alert("Не удалось перенести в закладки: " + (e as Error).message);
    } finally {
      setBookmarkBusy(false);
    }
  }

  // ------- Tinder-режим -------

  // Удаление прямо из режима — без диалога подтверждения, действие изолировано
  // в режиме «быстрого разбора», у пользователя есть мини-меню как страховка.
  const handleViewerDelete = useCallback(async (videoId: string) => {
    const snapshot = videos;
    const storagePath =
      videos.find((v) => v.id === videoId)?.thumbnailStoragePath ?? null;
    setVideos((prev) => prev.filter((v) => v.id !== videoId));
    try {
      await deleteVideo(videoId, storagePath);
    } catch (e) {
      setVideos(snapshot);
      throw e;
    }
  }, [videos]);

  const handleViewerBookmark = useCallback(async (videoId: string) => {
    const snapshot = videos;
    setVideos((prev) => prev.filter((v) => v.id !== videoId));
    try {
      await svc.moveToBookmarks(videoId);
    } catch (e) {
      setVideos(snapshot);
      throw e;
    }
  }, [videos]);

  // Cleanup-режим: «вернуть в основную базу как референс». Обновляет
  // is_reference=true, но сама строка остаётся в таблице (в отличие от
  // переноса в закладки). Используем отдельный коллбэк, а не общий
  // handleUpdateIsReference — здесь это часть жеста-свайпа, нужно отличить
  // ошибку запроса (надо откатиться и не идти к следующей карточке).
  const handleViewerMarkAsReference = useCallback(async (videoId: string) => {
    const snapshot = videos;
    setVideos((prev) =>
      prev.map((v) => (v.id === videoId ? { ...v, isReference: true } : v)),
    );
    try {
      await svc.setVideoIsReference(videoId, true);
    } catch (e) {
      setVideos(snapshot);
      throw e;
    }
  }, [videos]);

  // Воронка правого свайпа: применяем все изменения к локальному state, потом
  // отправляем одним батчем. При ошибке откатываем по снапшоту.
  const handleViewerSubmitRightFlow = useCallback(
    async (videoId: string, payload: SwipeRightPayload) => {
      const snapshot = videos;
      setVideos((prev) =>
        prev.map((v) => {
          if (v.id !== videoId) return v;
          const next = { ...v };
          if (payload.myCategoryId !== undefined)
            next.myCategoryId = payload.myCategoryId;
          if (payload.note !== undefined) next.note = payload.note;
          if (payload.ratings !== undefined) next.ratings = payload.ratings;
          if (payload.tagIdsToAttach && payload.tagIdsToAttach.length > 0) {
            const set = new Set(next.tagIds);
            for (const id of payload.tagIdsToAttach) set.add(id);
            next.tagIds = Array.from(set);
          }
          return next;
        }),
      );
      try {
        await svc.saveSwipeRightFlow(videoId, payload);
      } catch (e) {
        setVideos(snapshot);
        throw e;
      }
    },
    [videos],
  );

  // ------- Мутации справочников -------

  function nextColor(): EntityColor {
    // Цвет «по кругу» из палитры, чтобы новые теги не сливались по цвету.
    return pickNextColor(myCategories.length + tags.length);
  }

  const handleCreateMyCategory = useCallback(
    async (name: string): Promise<MyCategory> => {
      const created = await svc.createMyCategory(name, nextColor());
      setMyCategories((prev) => [...prev, created].sort((a, b) =>
        a.name.localeCompare(b.name, "ru"),
      ));
      return created;
    },
    // nextColor зависит от длин — но мы хотим стабильную ссылку на коллбэк.
    // В худшем случае подряд созданные элементы получат тот же цвет — не критично.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handleCreateTag = useCallback(async (name: string): Promise<Tag> => {
    const created = await svc.createTag(name, nextColor());
    setTags((prev) => [...prev, created]);
    return created;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ------- Управление справочниками (модалка) -------

  async function renameMyCategory(id: string, name: string) {
    setMyCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name } : c)),
    );
    await svc.renameMyCategory(id, name);
  }
  async function recolorMyCategory(id: string, color: EntityColor) {
    setMyCategories((prev) => prev.map((c) => (c.id === id ? { ...c, color } : c)));
    await svc.setMyCategoryColor(id, color);
  }
  async function deleteMyCategory(id: string) {
    setMyCategories((prev) => prev.filter((c) => c.id !== id));
    setVideos((prev) =>
      prev.map((v) => (v.myCategoryId === id ? { ...v, myCategoryId: null } : v)),
    );
    await svc.deleteMyCategory(id);
  }

  async function renameTag(id: string, name: string) {
    setTags((prev) => prev.map((t) => (t.id === id ? { ...t, name } : t)));
    await svc.renameTag(id, name);
  }
  async function recolorTag(id: string, color: EntityColor) {
    setTags((prev) => prev.map((t) => (t.id === id ? { ...t, color } : t)));
    await svc.setTagColor(id, color);
  }
  async function deleteTag(id: string) {
    setTags((prev) => prev.filter((t) => t.id !== id));
    setVideos((prev) =>
      prev.map((v) => ({ ...v, tagIds: v.tagIds.filter((t) => t !== id) })),
    );
    setFilters((f) => ({ ...f, tagIds: f.tagIds.filter((t) => t !== id) }));
    await svc.deleteTag(id);
  }

  const pendingCount =
    pendingDelete?.kind === "bulk" ? pendingDelete.ids.length : 1;

  return (
    <div
      className={clsx(
        fullscreen
          ? "fixed inset-0 z-[60] flex flex-col gap-4 bg-canvas p-4 sm:p-6 lg:p-8"
          : "flex flex-col gap-4",
      )}
    >
      <BatchProgressBar videos={videos} />

      <FilterBar
        filters={filters}
        onChange={setFilters}
        authors={authors}
        myCategories={myCategories}
        tags={tags}
        totalCount={videos.length}
        filteredCount={filtered.length}
      />

      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-ink-faint">
          {videos.length === 0
            ? "Таблица пуста"
            : `Показано: ${filtered.length} ${plural(filtered.length, "видео", "видео", "видео")}`}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setViewer({ mode: "default", videos: filtered })
            }
            disabled={filtered.length === 0}
            className="focus-ring inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink-muted transition hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Режим просмотра"
            title="Просмотр карточками со свайпами"
          >
            <PlayCircle size={18} />
            <span className="hidden sm:inline">Режим просмотра</span>
          </button>
          <button
            type="button"
            onClick={() => {
              // В режим очистки идём по всему массиву видео (без учёта текущих
              // фильтров): задача — пройтись по всем не-референсам и решить.
              const cleanupList = videos.filter((v) => v.isReference === false);
              if (cleanupList.length > 0) {
                setViewer({ mode: "cleanup", videos: cleanupList });
              }
            }}
            disabled={cleanupCount === 0}
            className="focus-ring inline-flex h-10 items-center gap-2 rounded-lg border border-line bg-surface px-3 text-sm font-medium text-ink-muted transition hover:border-line-strong hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Очистка"
            title={
              cleanupCount === 0
                ? "Нет видео с пометкой «Другое»"
                : `Быстро разобрать ${cleanupCount} видео с пометкой «Другое»`
            }
          >
            <Filter size={18} />
            <span className="hidden sm:inline">
              Очистка{cleanupCount > 0 ? ` · ${cleanupCount}` : ""}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setFullscreen((v) => !v)}
            className="focus-ring inline-flex h-10 w-10 items-center justify-center rounded-lg border border-line bg-surface text-ink-muted transition hover:border-line-strong hover:text-ink"
            aria-label={fullscreen ? "Свернуть таблицу" : "Развернуть таблицу"}
            title={fullscreen ? "Свернуть (Esc)" : "Развернуть"}
          >
            {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          </button>
        </div>
      </div>

      <div className={clsx("min-w-0", fullscreen ? "min-h-0 flex-1" : "")}>
        {videos.length === 0 ? (
          <VideoTableEmpty />
        ) : (
          <VideoTable
            videos={filtered}
            myCategories={myCategories}
            tags={tags}
            selectedIds={selectedIds}
            onToggleAll={handleToggleAll}
            onSelectMyCategory={handleSelectMyCategory}
            onCreateMyCategory={handleCreateMyCategory}
            onAttachTag={handleAttachTag}
            onDetachTag={handleDetachTag}
            onCreateTag={handleCreateTag}
            onSaveNote={handleSaveNote}
            onUpdateRatings={handleUpdateRatings}
            onUpdateIsReference={handleUpdateIsReference}
            onManageMyCategories={() => setManageMode("categories")}
            onManageTags={() => setManageMode("tags")}
            onToggleSelected={handleToggleSelected}
            onRequestDelete={handleRequestDelete}
          />
        )}
      </div>

      <BulkActionBar
        count={selectedIds.size}
        onClear={clearSelection}
        onDelete={handleRequestBulkDelete}
        onMoveToBookmarks={handleRequestBulkBookmark}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        tone="danger"
        title={
          pendingCount > 1
            ? `Удалить ${pendingCount} ${plural(pendingCount, "видео", "видео", "видео")}?`
            : "Удалить видео?"
        }
        description={
          pendingCount > 1
            ? "Видео и все их данные (статистика, транскрипция, саммари, теги, заметки) будут удалены безвозвратно."
            : "Видео и все его данные будут удалены безвозвратно."
        }
        confirmLabel="Удалить"
        cancelLabel="Отмена"
        busy={deleteBusy}
        onConfirm={confirmDelete}
        onCancel={() => {
          if (!deleteBusy) setPendingDelete(null);
        }}
      />

      <ConfirmDialog
        open={pendingBookmark !== null}
        tone="neutral"
        title={
          pendingBookmark && pendingBookmark.ids.length > 1
            ? `Переместить ${pendingBookmark.ids.length} ${plural(pendingBookmark.ids.length, "видео", "видео", "видео")} в закладки?`
            : "Переместить видео в закладки?"
        }
        description="Видео уйдут из основной таблицы и появятся в таблице «bookmarks» в Supabase. Из основной базы удалятся, но не пропадут — это безопасный «архив»."
        confirmLabel="В закладки"
        busyLabel="Переношу…"
        cancelLabel="Отмена"
        busy={bookmarkBusy}
        onConfirm={confirmBookmark}
        onCancel={() => {
          if (!bookmarkBusy) setPendingBookmark(null);
        }}
      />

      <EntityManageModal
        open={manageMode === "categories"}
        onClose={() => setManageMode("none")}
        title="Категории «Я»"
        entities={myCategories}
        onRename={renameMyCategory}
        onRecolor={recolorMyCategory}
        onDelete={deleteMyCategory}
        deleteConfirmHint="Удалить категорию? Видео с этой категорией останутся, но без неё."
      />
      <EntityManageModal
        open={manageMode === "tags"}
        onClose={() => setManageMode("none")}
        title="Теги"
        entities={tags}
        onRename={renameTag}
        onRecolor={recolorTag}
        onDelete={deleteTag}
        deleteConfirmHint="Удалить тег? Он снимется со всех видео."
      />

      {viewer && (
        <SwipeViewer
          mode={viewer.mode}
          videos={viewer.videos}
          myCategories={myCategories}
          tags={tags}
          onClose={() => setViewer(null)}
          onDelete={handleViewerDelete}
          onMoveToBookmarks={handleViewerBookmark}
          onMarkAsReference={handleViewerMarkAsReference}
          onCreateMyCategory={handleCreateMyCategory}
          onCreateTag={handleCreateTag}
          onSubmitRightFlow={handleViewerSubmitRightFlow}
        />
      )}
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
