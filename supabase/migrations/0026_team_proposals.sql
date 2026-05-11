-- Сессия 22 этапа 2 (по нумерации CLAUDE.md — миграция 0021, по сквозной
-- нумерации проекта — 0026). Предложения от агентов с уровнем автономности 1.
--
-- Цель пункта 15 (этап 3): агенты с autonomy_level=1 могут «подумать»
-- (cron, событие, окно 7 дней) и предложить задачу. Предложение — не
-- задача, а кандидат: Влад его принимает (создаётся реальная задача в
-- team_tasks) или отклоняет (запись в дневник, источник игнорируется в
-- cooldown'е).
--
-- Двухтактный процесс:
--   • Такт 1 (фильтр) — дешёвая модель решает should_propose=true/false.
--     При false — запись в team_agent_diary (read-only журнал отказов).
--   • Такт 2 (формулировка) — основная модель агента формулирует what/why/
--     benefit/estimated_cost/vlad_time/urgency. Запись в team_proposals.
--
-- Глобальный тумблер `autonomy_enabled_globally` (в team_settings)
-- мгновенно глушит все триггеры — Влад может выключить «проактивность
-- команды» одним кликом из Админки (UI — Сессия 23).

-- ============================================================================
-- 1. team_proposals
-- ============================================================================
--
-- Поля:
--   * agent_id      — FK на team_agents (CASCADE при удалении — предложения
--                     удалённого агента бессмысленны).
--   * triggered_by  — тип триггера, который запустил размышление:
--                     'weekly_window' | 'new_db_record' | 'new_competitor_entry'
--                     | 'new_reference_entry' | 'low_score' | 'goals_changed'.
--                     CHECK не ставим — список расширяется в Сессии 24.
--   * kind          — 'regular' | 'urgent' | 'next_step'. urgent игнорирует
--                     тихий час в Telegram (пункт 20).
--   * payload       — JSONB: { what, why, benefit, estimated_cost, vlad_time,
--                     urgency }. Свободная форма, чтобы UI принимал
--                     любые поля от такта 2.
--   * status        — 'pending' | 'accepted' | 'rejected' | 'expired'.
--   * resulting_task_id — id задачи в team_tasks при accept (ON SET NULL —
--                     задача может быть удалена позже, FK строгий).

create table if not exists public.team_proposals (
  id text primary key default gen_random_uuid()::text,
  agent_id text not null references public.team_agents(id) on delete cascade,
  triggered_by text not null,
  kind text not null default 'regular'
    check (kind in ('regular', 'urgent', 'next_step')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'rejected', 'expired')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  resulting_task_id text
);

create index if not exists idx_team_proposals_status_pending
  on public.team_proposals (status)
  where status = 'pending';

create index if not exists idx_team_proposals_agent
  on public.team_proposals (agent_id);

create index if not exists idx_team_proposals_created
  on public.team_proposals (created_at desc);

alter table public.team_proposals enable row level security;

drop policy if exists "team_proposals_public_all" on public.team_proposals;
create policy "team_proposals_public_all"
  on public.team_proposals for all
  to anon, authenticated
  using (true) with check (true);

comment on table public.team_proposals is
  'Предложения задач от агентов с уровнем автономности 1. Кандидаты в задачи, не сами задачи. Принимаются/отклоняются Владом (см. Inbox, Сессия 23).';

-- ============================================================================
-- 2. team_agent_diary
-- ============================================================================
--
-- «Дневник наблюдений» — read-only журнал тех тактов 1, где агент решил
-- «не предлагать». Нужно для отладки («почему агент молчал?») и для
-- будущей диагностики качества решений модели. В Inbox не идёт.

create table if not exists public.team_agent_diary (
  id text primary key default gen_random_uuid()::text,
  agent_id text not null references public.team_agents(id) on delete cascade,
  triggered_by text not null,
  reason_to_skip text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_team_agent_diary_agent
  on public.team_agent_diary (agent_id);

create index if not exists idx_team_agent_diary_created
  on public.team_agent_diary (created_at desc);

alter table public.team_agent_diary enable row level security;

drop policy if exists "team_agent_diary_public_all" on public.team_agent_diary;
create policy "team_agent_diary_public_all"
  on public.team_agent_diary for all
  to anon, authenticated
  using (true) with check (true);

comment on table public.team_agent_diary is
  'Read-only дневник: записи о пропусках агентом в такте 1 (фильтре). Диагностический инструмент. UI карточки агента покажет на вкладке «Дневник» (Сессия 23).';

-- ============================================================================
-- 3. team_settings: глобальный тумблер автономности
-- ============================================================================
--
-- Если outomy_enabled_globally = false, все cron-задачи и /triggers:run
-- спят. UI этого тумблера — Сессия 23 (Админка).

insert into public.team_settings (key, value)
values ('autonomy_enabled_globally', 'false'::jsonb)
on conflict (key) do nothing;
