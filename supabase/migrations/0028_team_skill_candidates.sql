-- Сессия 25 этапа 2 (по нумерации CLAUDE.md — миграция 0023, по сквозной
-- нумерации проекта — 0028). Кандидаты в навыки + порог skill extraction.
--
-- Цель пункта 10: при оценке задачи на максимум (5/5) backend анализирует,
-- какие переиспользуемые паттерны там лежат, и создаёт запись в
-- team_skill_candidates. Влад ревьюит их в отдельном экране (Сессия 27) и
-- одобряет/отклоняет. Принятые превращаются в .md-файлы в Storage
-- team-prompts/agent-skills/<agent_id>/ — оттуда они идут в слой Skills
-- промпта.
--
-- Сами skill-файлы лежат в Storage, не в БД — это удобнее для ручной
-- правки и истории. Кандидаты — в БД, потому что у них short lifecycle
-- (pending → approved/rejected → удалён или продвинут в файл).

create table if not exists public.team_skill_candidates (
  id text primary key default gen_random_uuid()::text,
  agent_id text not null references public.team_agents(id) on delete cascade,
  task_id text,
  score integer check (score >= 0 and score <= 5),
  skill_name text not null,
  when_to_apply text not null,
  what_to_do text not null,
  why_it_works text not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired')),
  vlad_comment text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists idx_skill_candidates_agent
  on public.team_skill_candidates (agent_id);

create index if not exists idx_skill_candidates_status_pending
  on public.team_skill_candidates (status)
  where status = 'pending';

alter table public.team_skill_candidates enable row level security;

drop policy if exists "team_skill_candidates_public_all" on public.team_skill_candidates;
create policy "team_skill_candidates_public_all"
  on public.team_skill_candidates for all
  to anon, authenticated
  using (true) with check (true);

comment on table public.team_skill_candidates is
  'Кандидаты в навыки, извлечённые из успешных задач. Аналог кандидатов в правила (Сессия 15), но для positive learning.';

-- Порог оценки для skill extraction. Дефолт 5 — только задачи на максимум.
-- 4 — обработка через batch (Сессия 26). 3 — экспериментально, много шума.
insert into public.team_settings (key, value)
values ('skill_extraction_threshold', '5'::jsonb)
on conflict (key) do nothing;
