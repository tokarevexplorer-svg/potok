-- Сессия 12 этапа 2 (по нумерации Claude_team_stage2.md — миграция 0015,
-- по сквозной нумерации проекта — 0019). Привязка задач к агентам и
-- индексы для будущего поагентного биллинга.
--
-- Цель:
--   1) team_tasks.agent_id — необязательная ссылка на агента-исполнителя.
--      Используется taskRunner, чтобы при сборке промпта подтянуть Role +
--      Memory + Awareness конкретного агента. Без выбранного агента задача
--      выполняется как раньше (только Mission + Goals + шаблон).
--      FK на team_agents(id) с ON DELETE SET NULL: архив агента (мягкое
--      удаление, status='archived') не трогает FK, а полное DELETE
--      (если когда-нибудь появится) только сбросит ссылку, не уничтожая задачу.
--
--   2) team_api_calls.agent_id — уже добавлено в 0018 для test_run/role_draft
--      из мастера. Здесь только индексируем по agent_id ещё одним обычным
--      (не partial) индексом для будущих агрегаций "расход агента X за период"
--      — partial-индекс 0018 годен только для NOT NULL запросов, а агрегации
--      могут крутиться по всем строкам. Дублирующиеся индексы Postgres сам
--      разрулит при планировании; стоимость хранения — копейки.

alter table public.team_tasks
  add column if not exists agent_id text
    references public.team_agents(id) on delete set null;

create index if not exists idx_team_tasks_agent
  on public.team_tasks (agent_id);

comment on column public.team_tasks.agent_id is
  'Агент-исполнитель задачи. NULL — задача без агента (как в этапе 1). Используется для биллинга по агентам и фильтрации в логе.';

-- team_api_calls.agent_id уже добавлен в 0018 (без FK — допускает 'system'
-- и id ещё-не-созданных агентов в test_run). Тот partial-индекс заточен под
-- queries `where agent_id is not null`. Для будущей поагентной агрегации
-- нужен обычный индекс по столбцу — добавляем его рядом, без удаления
-- существующего partial-индекса.
create index if not exists idx_team_api_calls_agent
  on public.team_api_calls (agent_id);
