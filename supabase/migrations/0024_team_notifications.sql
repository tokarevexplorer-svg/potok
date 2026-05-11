-- Сессия 18 этапа 2 (по нумерации CLAUDE.md — миграция 0019, по сквозной
-- нумерации проекта — 0024). Inbox внимания: агрегатор событий, на которые
-- Владу нужно отреагировать.
--
-- Цель пункта 14 (этап 3): из множества источников (оценки задач, кандидаты
-- в правила, handoff-предложения, будущие skill-кандидаты, проактивные
-- предложения от агентов) Владу нужно одно место «что сейчас требует
-- решения». Эта таблица — агрегатор. Каждая строка = ОДНО событие.
--
-- Поля минимальны: id, type (с CHECK), title, description, agent_id (опц.),
-- related_entity_id/_type (универсальная ссылка на источник без FK — у
-- разных типов источники в разных таблицах), link (куда вести Влада в
-- браузере), is_read, created_at.
--
-- Индексы:
--   • partial по is_read=false — самый частый запрос «непрочитанные».
--   • по type — для groupBy в сводке.

create table if not exists public.team_notifications (
  id text primary key default gen_random_uuid()::text,
  type text not null check (type in (
    'rule_candidate',
    'skill_candidate',
    'rule_revision',
    'task_awaiting_review',
    'handoff_suggestion',
    'proposal'
  )),
  title text not null,
  description text,
  agent_id text references public.team_agents(id) on delete set null,
  related_entity_id text,
  related_entity_type text,
  link text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_team_notifications_unread
  on public.team_notifications (is_read)
  where is_read = false;

create index if not exists idx_team_notifications_type
  on public.team_notifications (type);

create index if not exists idx_team_notifications_agent
  on public.team_notifications (agent_id);

alter table public.team_notifications enable row level security;

drop policy if exists "team_notifications_public_all" on public.team_notifications;
create policy "team_notifications_public_all"
  on public.team_notifications for all
  to anon, authenticated
  using (true) with check (true);

comment on table public.team_notifications is
  'Inbox внимания: события, на которые Влад должен отреагировать. Каждый элемент = одно решение (Сессия 18, пункт 14).';
