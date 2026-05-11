-- Сессия 20 этапа 2 (по нумерации CLAUDE.md — миграция 0020, по сквозной
-- нумерации проекта — 0025). Инструменты команды + привязка к агентам.
--
-- Цель пункта 16 (этап 3): у агентов появляются «руки» — внешние инструменты,
-- которые они могут вызывать в ходе работы (NotebookLM, Web Search, потом
-- Apify и т.д.). Реестр строго один на проект; привязки многие-ко-многим
-- через отдельную таблицу.
--
-- Поля team_tools:
--   * id              — text-PK. Обычно slug ('notebooklm', 'web-search'),
--                       но допускаем uuid (default gen_random_uuid()).
--   * name            — отображаемое имя в Админке и Awareness (NotebookLM,
--                       Web Search).
--   * description     — одна строка для карточки в Админке.
--   * tool_type       — 'executor' (в Hands агента — методичка идёт в
--                       Awareness) | 'system' (системный, не для агента,
--                       например Apify-парсер баз).
--   * manifest_path   — путь к markdown-методичке в team-prompts/. Только
--                       латиница ('tools/notebooklm.md') — Supabase Storage
--                       отбивает кириллицу в путях (см. отклонение Сессии 4).
--   * connection_config — JSONB. Для NotebookLM — URL воркера, heartbeat
--                       интервал. Для будущего Web Search (Сессия 32) —
--                       provider, api_key.
--   * status          — 'active' | 'inactive' | 'error'. Inactive = доступ
--                       к инструменту запрещён всем агентам, даже если
--                       привязка в team_agent_tools есть.

create table if not exists public.team_tools (
  id text primary key default gen_random_uuid()::text,
  name text not null unique,
  description text,
  tool_type text not null default 'executor'
    check (tool_type in ('executor', 'system')),
  manifest_path text,
  connection_config jsonb not null default '{}'::jsonb,
  status text not null default 'inactive'
    check (status in ('active', 'inactive', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists team_tools_set_updated_at on public.team_tools;
create trigger team_tools_set_updated_at
before update on public.team_tools
for each row execute function public.set_updated_at();

alter table public.team_tools enable row level security;

drop policy if exists "team_tools_public_all" on public.team_tools;
create policy "team_tools_public_all"
  on public.team_tools for all
  to anon, authenticated
  using (true) with check (true);

comment on table public.team_tools is
  'Реестр инструментов. executor = в Hands агента (методичка идёт в Awareness промпта). system = инфраструктурный (Сессия 33, Apify).';

-- =========================================================================
-- Связка агент ↔ инструмент
-- =========================================================================

create table if not exists public.team_agent_tools (
  agent_id text not null references public.team_agents(id) on delete cascade,
  tool_id text not null references public.team_tools(id) on delete cascade,
  primary key (agent_id, tool_id)
);

create index if not exists idx_team_agent_tools_tool
  on public.team_agent_tools (tool_id);

alter table public.team_agent_tools enable row level security;

drop policy if exists "team_agent_tools_public_all" on public.team_agent_tools;
create policy "team_agent_tools_public_all"
  on public.team_agent_tools for all
  to anon, authenticated
  using (true) with check (true);

comment on table public.team_agent_tools is
  'Какие инструменты доступны какому агенту. Третья секция Awareness строится отсюда.';

-- =========================================================================
-- Seed: NotebookLM как первый инструмент команды.
-- =========================================================================
-- manifest_path использует ASCII (см. отклонение Сессии 4 + 9): Supabase
-- Storage отбивает кириллицу в путях с `Invalid key`. UI-метка в карточке
-- останется русской («Инструменты»), а реальный bucket-путь — tools/.
-- Статус 'inactive' по умолчанию — Влад включает руками в Сессии 21,
-- когда воркер появится на проде.

insert into public.team_tools (id, name, description, tool_type, manifest_path, status)
values (
  'notebooklm',
  'NotebookLM',
  'Инструмент для глубокого исследования по подгруженным источникам (книги, статьи, PDF). Локальный воркер.',
  'executor',
  'tools/notebooklm.md',
  'inactive'
) on conflict (id) do nothing;
