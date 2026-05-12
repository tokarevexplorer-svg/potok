-- Сессия 33 этапа 2 (пункт 17): база конкурентов.
--
-- Под капотом — реестр блогеров (используем team_custom_databases с
-- db_type='competitor', schema_definition хранит мета — username, аватарка,
-- последний парсинг) + отдельная таблица постов team_competitor_posts.
-- Это удобнее, чем динамически создавать таблицу для каждого блогера, как
-- предполагает customDatabaseService.create_custom_table — посты структурно
-- одинаковые, отличается только competitor_id.

create table if not exists public.team_competitor_posts (
  id uuid primary key default gen_random_uuid(),
  competitor_id uuid not null references public.team_custom_databases(id) on delete cascade,
  -- shortCode Instagram (уникален в рамках платформы; используем как natural-key).
  external_id text not null,
  caption text,
  url text,
  -- 'reel' | 'video' | 'image' | 'sidecar' (carousel). Тип берём из Apify-результата.
  type text,
  likes_count integer,
  comments_count integer,
  video_url text,
  transcription text,
  -- AI-саммари: { type, topic, hook, summary }.
  ai_summary jsonb,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (competitor_id, external_id)
);

create index if not exists idx_team_competitor_posts_competitor
  on public.team_competitor_posts(competitor_id);
create index if not exists idx_team_competitor_posts_posted_at
  on public.team_competitor_posts(posted_at desc);

comment on table public.team_competitor_posts is
  'Посты конкурентов с AI-саммари. Сессия 33 этапа 2.';
comment on column public.team_competitor_posts.ai_summary is
  'JSON от Системной LLM: { type, topic, hook, summary }.';
