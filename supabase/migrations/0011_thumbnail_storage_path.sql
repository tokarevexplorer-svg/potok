-- Сессия 20 (фикс): переезд с Google Drive на Supabase Storage.
--
-- Service Account-ы Google не имеют собственной storage quota, поэтому
-- залить файл в обычную папку Drive они не могут (только в Shared Drive,
-- который доступен в Google Workspace). На бесплатном Google это блокер.
--
-- Решение — Supabase Storage: уже есть в проекте, бесплатно до 1 ГБ,
-- ключ доступа уже прокинут (SUPABASE_SERVICE_ROLE_KEY).
--
-- Что делает миграция:
--   1. Переименовывает поле `thumbnail_drive_id` → `thumbnail_storage_path`
--      в таблицах `videos` и `bookmarks`. Тип text, nullable — без изменений.
--      Реальных данных в этом поле не было (Google Drive-загрузка ни разу
--      не сработала из-за ENAMETOOLONG / storage quota), так что переименование
--      безопасно.
--
-- Запусти этот SQL в Supabase → SQL Editor одним блоком.

alter table public.videos
  rename column thumbnail_drive_id to thumbnail_storage_path;

alter table public.bookmarks
  rename column thumbnail_drive_id to thumbnail_storage_path;
