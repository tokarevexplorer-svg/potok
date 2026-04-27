-- Сессия 16.1 (фикс): оценка теперь multi-select.
--
-- Раньше videos.rating хранил одну оценку (verified | super | repeat | null).
-- Теперь оценок может быть несколько одновременно — например, видео может быть
-- одновременно «верифицировано» и «супер». Меняем text на text[].
--
-- Что делает миграция:
-- 1. Добавляет колонку ratings text[] с дефолтом '{}'.
-- 2. Переносит существующие значения: где rating не null — пишем массив из
--    одного элемента. Где null — оставляем пустой массив (это и есть «не оценено»).
-- 3. CHECK ограничивает значения тремя допустимыми ключами.
-- 4. GIN-индекс на массив для быстрого фильтра «оценки содержат X».
-- 5. Удаляет старую колонку rating (вместе с её индексом и CHECK).
--
-- Запусти этот SQL в Supabase → SQL Editor одним блоком.
-- Существующие оценки мигрируют автоматически — данные не теряются.

alter table public.videos
  add column if not exists ratings text[] not null default '{}';

update public.videos
  set ratings = array[rating]
  where rating is not null
    and (ratings is null or array_length(ratings, 1) is null);

alter table public.videos
  drop constraint if exists videos_ratings_check;

alter table public.videos
  add constraint videos_ratings_check
  check (ratings <@ array['verified','super','repeat']::text[]);

create index if not exists videos_ratings_gin_idx
  on public.videos using gin (ratings);

alter table public.videos
  drop column if exists rating;
