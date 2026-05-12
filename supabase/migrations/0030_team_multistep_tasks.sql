-- Сессия 31 этапа 2 (пункт 17): инфраструктура многошаговых задач и
-- уточнений от агента.
--
-- Новые статусы (документация в комментарии, ENUM не используем —
-- team_tasks.status остаётся TEXT):
--   clarifying          — агент формулирует вопросы перед запуском.
--   awaiting_input      — задача ждёт ответов Влада на уточняющие вопросы.
--   awaiting_resource   — задача ждёт внешний ресурс (например, NotebookLM
--                         воркер выполняет очередной шаг многошаговой задачи).
--
-- Новые поля:
--   step_state                — JSONB с прогрессом многошаговой задачи.
--   clarification_enabled     — boolean, включить ли вопросы агента перед запуском.
--   clarification_questions   — массив вопросов агента.
--   clarification_answers     — массив ответов Влада.
--   comparison_group_id       — соц-ссылка для мульти-LLM сравнения (Сессия 34).

comment on column public.team_tasks.status is
  'Статусы: pending, running, done, error, archived, marked_done, clarifying, awaiting_input, awaiting_resource.';

alter table public.team_tasks
  add column if not exists step_state jsonb,
  add column if not exists clarification_enabled boolean default false,
  add column if not exists clarification_questions jsonb,
  add column if not exists clarification_answers jsonb,
  add column if not exists comparison_group_id text;

comment on column public.team_tasks.step_state is
  'Состояние многошаговой задачи: { current_step, total_steps, steps: [{question, status, result?}], accumulated_results, notebook_id?, synthesis_pending? }. NULL для одношаговых.';
comment on column public.team_tasks.clarification_enabled is
  'Если true — taskRunner перед первым LLM-вызовом запросит у агента уточняющие вопросы (clarifying → awaiting_input).';
comment on column public.team_tasks.clarification_questions is
  'Массив вопросов агента: [{question, required}]. NULL до момента генерации.';
comment on column public.team_tasks.clarification_answers is
  'Массив ответов Влада: [{question, answer}]. NULL пока Влад не ответил.';
comment on column public.team_tasks.comparison_group_id is
  'Сессия 34: id группы клонов задачи для мульти-LLM сравнения. Все задачи с одним comparison_group_id рендерятся бок о бок.';

create index if not exists idx_team_tasks_comparison
  on public.team_tasks(comparison_group_id)
  where comparison_group_id is not null;
