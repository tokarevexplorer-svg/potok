-- Сессия 24 этапа 2 (по нумерации CLAUDE.md inline, по сквозной — 0027).
-- Состояние событийных триггеров автономности.
--
-- pollEventTriggers (см. triggerService.js) каждые 6 часов проверяет три
-- типа событий: новые записи в БД конкурентов, низкие оценки задач,
-- изменение Целей в Storage. Чтобы не дёргать те же события повторно,
-- нужно хранить «когда мы последний раз проверяли этот тип триггера для
-- этого агента». Таблица — простой PK (agent_id, trigger_type) с
-- last_checked_at.
--
-- Cooldown 7 дней (см. proposalService.getLastReflection) живёт ОТДЕЛЬНО —
-- через JOIN team_proposals + team_agent_diary. trigger_state нужен только
-- для «не считать одни и те же эпизоды дважды на разных тиках поллинга».

create table if not exists public.team_trigger_state (
  agent_id text not null references public.team_agents(id) on delete cascade,
  trigger_type text not null,
  last_checked_at timestamptz not null default now(),
  primary key (agent_id, trigger_type)
);

alter table public.team_trigger_state enable row level security;

drop policy if exists "team_trigger_state_public_all" on public.team_trigger_state;
create policy "team_trigger_state_public_all"
  on public.team_trigger_state for all
  to anon, authenticated
  using (true) with check (true);

comment on table public.team_trigger_state is
  'Маркеры «когда мы последний раз поллили этот тип триггера для этого агента». Не путать с cooldown'' ом 7 дней (он живёт через JOIN proposals+diary).';
