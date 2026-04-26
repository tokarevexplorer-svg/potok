-- Сессия 14: таблица закладок и поле оценки видео.
--
-- 1) Поле videos.rating: пользовательская оценка (✅ verified / 🔥 super / 🔄 repeat).
--    null = не оценено. Для фильтрации создаём индекс.
-- 2) Таблица bookmarks: видео, которые не пойдут в блог, но не хотим терять
--    (рестораны, выставки, AI-контент и пр.). Фундамент будущего раздела
--    «Сохранёнки». Структура — копия основных полей из videos. Это
--    самостоятельная сущность, без FK на videos.
--
-- Запусти этот SQL в Supabase → SQL Editor одним блоком.
--
-- Ничего не дропается, бэкап делать не нужно.

-- ---------- 1. Поле rating в videos ----------

alter table public.videos
  add column if not exists rating text
  check (rating in ('verified', 'super', 'repeat'));

create index if not exists videos_rating_idx
  on public.videos (rating)
  where rating is not null;

-- ---------- 2. Таблица bookmarks ----------

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),

  -- Справочные поля (копия из videos)
  url text not null unique,
  published_at timestamptz,
  author text,
  author_url text,
  caption text,
  thumbnail_url text,

  -- Статистика
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  virality_score numeric,

  -- Содержание
  ai_summary text,
  transcript text,
  ai_category text,
  ai_category_suggestion text,

  -- Заметка пользователя — единственное «ручное» поле, которое имеет смысл
  -- на закладках. Категории/теги/оценка — сущности блога, в bookmarks не тянем.
  user_note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookmarks_created_at_idx on public.bookmarks (created_at desc);
create index if not exists bookmarks_published_at_idx on public.bookmarks (published_at desc);
create index if not exists bookmarks_author_idx on public.bookmarks (author);

-- Автообновление updated_at — функция set_updated_at уже создана миграцией 0001
drop trigger if exists bookmarks_set_updated_at on public.bookmarks;
create trigger bookmarks_set_updated_at
before update on public.bookmarks
for each row execute function public.set_updated_at();

-- RLS: открытая, как у videos — приложение пока без auth
alter table public.bookmarks enable row level security;

drop policy if exists "bookmarks_public_all" on public.bookmarks;
create policy "bookmarks_public_all"
  on public.bookmarks for all
  to anon, authenticated
  using (true) with check (true);
