-- Сессия 8 этапа 2 (по нумерации Claude_team_stage2.md — миграция 0012,
-- по сквозной нумерации проекта — 0016). Память агентов.
--
-- Раздел «Память» команды: эпизоды и правила (этап 1, пункт 3).
--
--   * Эпизод — сырая запись из обратной связи Влада на конкретную задачу:
--     оценка 0–5 + текст разбора. В промпт НЕ попадает — слишком много шума.
--   * Правило — обобщение из нескольких эпизодов (формируется Curator'ом
--     в этапе 2 пункт 9, либо вручную через UI / seed-скрипт). Активные
--     правила попадают целиком в слой `memory` промпта (см. promptBuilder.js).
--
-- Жизненный цикл правила:
--   candidate → (Влад смотрит) → active|rejected
--   active → archived (мягкое удаление)
--   active с pinned=true Curator никогда не трогает.
--
-- agent_id — пока произвольная строка. FK на public.team_agents добавится
-- в Сессии 9 (миграция 0017). На этом этапе FK нет специально — таблицы
-- агентов ещё не существует, а тесты Сессии 8 должны работать с любым
-- слагом (например, `test-agent`).
--
-- RLS открытая, как у остальных team_* таблиц — приложение защищено на
-- уровне бэкенда (requireAuth + whitelist). service-role клиент обходит RLS.

create table if not exists public.team_agent_memory (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  type text not null
    check (type in ('episode', 'rule')),
  content text not null,
  source text not null default 'manual'
    check (source in ('manual', 'seed', 'feedback', 'curator')),
  status text not null default 'active'
    check (status in ('active', 'archived', 'rejected', 'candidate')),
  score integer,
  task_id text,
  source_episode_ids uuid[],
  reviewed_at timestamptz,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_team_agent_memory_agent_type
  on public.team_agent_memory (agent_id, type);
create index if not exists idx_team_agent_memory_agent_status
  on public.team_agent_memory (agent_id, status);
create index if not exists idx_team_agent_memory_type_status
  on public.team_agent_memory (type, status);

comment on table public.team_agent_memory is
  'Память агентов: эпизоды (сырой фидбэк) и правила (обобщения). Эпизоды НЕ попадают в промпт, правила — попадают целиком.';

alter table public.team_agent_memory enable row level security;

drop policy if exists "team_agent_memory_public_all" on public.team_agent_memory;
create policy "team_agent_memory_public_all"
  on public.team_agent_memory for all
  to anon, authenticated
  using (true) with check (true);
