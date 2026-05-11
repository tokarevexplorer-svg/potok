-- Сессия 14 этапа 2 (по нумерации CLAUDE.md — миграция 0017, по сквозной
-- нумерации проекта — 0022). Парсер обратной связи и таблица эпизодов.
--
-- Цель пункта 9 (этап 2): записывать «сырой» фидбэк Влада на задачи в виде
-- эпизодов — оценка (0-5) + комментарий — и параллельно класть в parsed_text
-- нейтрализованную LLM формулировку. Эпизоды НЕ попадают в промпт; они
-- сырьё для будущего Curator'а (сессия 15) — он сжимает эпизоды в правила
-- и кандидатов для team_agent_memory.
--
-- Каналы:
--   * task_card    — оценка задачи прямо из карточки в дашборде (этот этап).
--   * telegram     — голосовая обратная связь из Telegram (пункт 20, этап 6).
--   * edit_diff    — diff правок результата (отложено).
--
-- Статусы:
--   * active                 — свежий эпизод, виден в карточке агента.
--   * compressed_to_rule     — Curator уже использовал в обобщении правила.
--   * dismissed              — пользователь отклонил кандидат (см. Сессия 15).
--   * archived               — старые эпизоды (>90 дней), скрытые из UI.
--
-- agent_id — FK на team_agents с CASCADE: при удалении агента эпизоды
-- удаляются автоматически. task_id — soft-ref на team_tasks.id (text),
-- без FK (PK team_tasks — record_id; одна задача имеет несколько снапшотов).

create table if not exists public.team_feedback_episodes (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.team_agents(id) on delete cascade,
  task_id text,
  channel text not null check (channel in ('task_card', 'telegram', 'edit_diff')),
  score integer check (score >= 0 and score <= 5),
  raw_input text not null,
  parsed_text text,
  status text not null default 'active'
    check (status in ('active', 'compressed_to_rule', 'dismissed', 'archived')),
  created_at timestamptz not null default now()
);

create index if not exists idx_feedback_episodes_agent
  on public.team_feedback_episodes (agent_id);

create index if not exists idx_feedback_episodes_agent_status
  on public.team_feedback_episodes (agent_id, status);

create index if not exists idx_feedback_episodes_task
  on public.team_feedback_episodes (task_id)
  where task_id is not null;

comment on table public.team_feedback_episodes is
  'Эпизоды обратной связи: сырой фидбэк Влада, нейтрализованный LLM. Не попадают в промпт — служат сырьём для сжатия в правила (Curator, Сессия 15).';

alter table public.team_feedback_episodes enable row level security;

drop policy if exists "team_feedback_episodes_public_all" on public.team_feedback_episodes;
create policy "team_feedback_episodes_public_all"
  on public.team_feedback_episodes for all
  to anon, authenticated
  using (true) with check (true);
