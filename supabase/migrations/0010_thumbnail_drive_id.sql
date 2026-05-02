-- Сессия 20: постоянные превью через Google Drive.
--
-- Превью с Instagram CDN — временные (~24 часа) и требуют отсутствия Referer.
-- В этой сессии бэкенд после парсинга скачивает превью и заливает его в папку
-- на Google Drive. Постоянный URL пишется в существующее поле `thumbnail_url`
-- (заменяет временную ссылку на постоянную), а fileId — в новое поле
-- `thumbnail_drive_id`, чтобы при удалении видео можно было снести и файл с Drive.
--
-- Что делает миграция:
--   1. Добавляет колонку `thumbnail_drive_id` (text, nullable) в `videos`.
--   2. То же самое для `bookmarks` — туда видео переезжают через moveToBookmarks
--      вместе с превью, и нам нужен fileId, чтобы при удалении из закладок
--      тоже подчищать Drive.
--
-- Запусти этот SQL в Supabase → SQL Editor одним блоком. Миграция ничего не
-- дропает — только добавляет два nullable-поля.

alter table public.videos
  add column if not exists thumbnail_drive_id text;

alter table public.bookmarks
  add column if not exists thumbnail_drive_id text;
