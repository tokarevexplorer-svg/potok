-- Сессия 7: ручные поля по принципу Notion.
--   my_categories  — список категорий пользователя (как Select в Notion)
--   tags           — цветные теги (как Multi-Select в Notion)
--   video_tags     — связь many-to-many видео ↔ тегов
-- Поле videos.my_category переезжает с произвольного текста на FK, поле
-- videos.tags (text[]) заменяется на join-таблицу. Реальных назначений до
-- сессии 7 не было (UI ввода не существовало) — миграция данных не нужна.

create table if not exists public.my_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default 'gray',
  created_at timestamptz not null default now()
);

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default 'gray',
  created_at timestamptz not null default now()
);

alter table public.videos drop column if exists my_category;
alter table public.videos
  add column if not exists my_category_id uuid
  references public.my_categories(id) on delete set null;

alter table public.videos drop column if exists tags;

create table if not exists public.video_tags (
  video_id uuid not null references public.videos(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (video_id, tag_id)
);

create index if not exists video_tags_tag_id_idx on public.video_tags(tag_id);
create index if not exists videos_my_category_id_idx on public.videos(my_category_id);

-- Стартовый набор тегов: Notion позволяет emoji в имени — используем его
insert into public.tags (name, color) values
  ('🪝 Хук', 'amber'),
  ('🎨 Визуал', 'purple'),
  ('🎯 Тема', 'blue')
on conflict (name) do nothing;

-- RLS: пока приложение без auth — открываем всё, как у videos
alter table public.my_categories enable row level security;
alter table public.tags enable row level security;
alter table public.video_tags enable row level security;

drop policy if exists "my_categories_public_all" on public.my_categories;
create policy "my_categories_public_all"
  on public.my_categories for all
  to anon, authenticated
  using (true) with check (true);

drop policy if exists "tags_public_all" on public.tags;
create policy "tags_public_all"
  on public.tags for all
  to anon, authenticated
  using (true) with check (true);

drop policy if exists "video_tags_public_all" on public.video_tags;
create policy "video_tags_public_all"
  on public.video_tags for all
  to anon, authenticated
  using (true) with check (true);
