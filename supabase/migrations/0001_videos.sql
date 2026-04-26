-- Сессия 2: таблица videos
-- Хранит сохранённые Reels и все поля из структуры данных CLAUDE.md.
-- Запусти этот SQL один раз в Supabase → SQL Editor.

create extension if not exists "pgcrypto";

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),

  -- Блок 1: справочная информация
  url text not null unique,
  published_at timestamptz,
  author text,
  author_url text,
  caption text,
  thumbnail_url text,

  -- Блок 2: статистика
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  virality_score numeric,

  -- Блок 3: содержание
  ai_summary text,
  transcript text,
  ai_category text,
  ai_category_suggestion text,

  -- Блок 4: ручные поля
  my_category text,
  tags text[] not null default '{}',
  note text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Индексы под типовые фильтры и сортировки
create index if not exists videos_created_at_idx on public.videos (created_at desc);
create index if not exists videos_published_at_idx on public.videos (published_at desc);
create index if not exists videos_author_idx on public.videos (author);
create index if not exists videos_ai_category_idx on public.videos (ai_category);
create index if not exists videos_tags_gin_idx on public.videos using gin (tags);

-- Автообновление updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists videos_set_updated_at on public.videos;
create trigger videos_set_updated_at
before update on public.videos
for each row execute function public.set_updated_at();

-- RLS: включаем, но пока открываем всё для anon/authenticated.
-- На данном этапе у приложения нет логина — это личный инструмент без авторизации.
-- Когда добавим auth (будущая сессия), заменим политики на owner-based.
alter table public.videos enable row level security;

drop policy if exists "videos_public_select" on public.videos;
drop policy if exists "videos_public_insert" on public.videos;
drop policy if exists "videos_public_update" on public.videos;
drop policy if exists "videos_public_delete" on public.videos;

create policy "videos_public_select"
  on public.videos for select
  to anon, authenticated
  using (true);

create policy "videos_public_insert"
  on public.videos for insert
  to anon, authenticated
  with check (true);

create policy "videos_public_update"
  on public.videos for update
  to anon, authenticated
  using (true)
  with check (true);

create policy "videos_public_delete"
  on public.videos for delete
  to anon, authenticated
  using (true);
