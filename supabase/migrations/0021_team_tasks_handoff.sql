-- Сессия 13 этапа 2 (по нумерации Claude_team_stage2/CLAUDE.md — миграция 0016,
-- по сквозной нумерации проекта — 0021). Handoff и цепочки задач.
--
-- Цель пункта 8 (этап 2): передача задач между агентами кликом Влада.
-- Никакой автоматической оркестрации — Влад нажимает «Передать дальше»
-- на завершённой задаче, выбирает агента-получателя и бриф. Новая задача
-- получает parent_task_id = id исходной → цепочка задач трассируется.
--
-- Дополнительно агент в финале ответа может предложить блок
-- «**Suggested Next Steps:**» (через инструкцию в Awareness). taskRunner
-- парсит блок и сохраняет в team_tasks.suggested_next_steps. UI handoff
-- пред-заполняет форму этими данными — но решение всегда за Владом.
--
-- Колонки:
--   * parent_task_id        — id родительской задачи (text). Soft-ref на
--                             team_tasks.id (без FK: team_tasks append-only
--                             с PK по record_id, а несколько строк имеют
--                             один и тот же id). Nullable: задачи без
--                             родителя — обычные (большинство).
--   * suggested_next_steps  — JSONB-массив [{ agent_name, suggestion }, ...].
--                             Парсится из ответа LLM в finishTask. Nullable.
--                             В промпт НЕ возвращается — только для UI handoff.
--
-- Индекс на parent_task_id — для быстрых JOIN'ов «найти все дочерние»
-- (используется в GET /api/team/tasks/:id/chain).

alter table public.team_tasks
  add column if not exists parent_task_id text,
  add column if not exists suggested_next_steps jsonb;

create index if not exists team_tasks_parent_id_idx
  on public.team_tasks (parent_task_id)
  where parent_task_id is not null;

comment on column public.team_tasks.parent_task_id is
  'ID родительской задачи при handoff. Soft-ref на team_tasks.id (text). NULL = корневая задача без передачи.';

comment on column public.team_tasks.suggested_next_steps is
  'Массив предложений агента передать задачу дальше: [{agent_name, suggestion}]. Парсится из блока **Suggested Next Steps:** в ответе LLM.';
