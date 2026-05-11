-- Сессия 10 этапа 2 (по нумерации Claude_team_stage2.md — миграция 0014,
-- по сквозной нумерации проекта — 0018).
--
-- Цель:
--   1) Дополнить team_agents двумя «защитными» полями — purpose и
--      success_criteria. Они обязательны при создании агента через мастер
--      (заставляют Влада подумать: «зачем нужен новый агент, который не
--      покрывается существующими?») и оценочны через 2 недели работы.
--      В промпт эти поля НЕ идут — только для самопроверки.
--
--   2) Дополнить team_api_calls двумя метаданными — agent_id и purpose.
--      Нужны, чтобы вызовы из контекста агента (test-run в мастере,
--      draft-role и т.п.) были распознаваемы в журнале расходов.
--      agent_id — TEXT без FK, потому что мы используем «псевдо-id» вроде
--      'system' для системных вызовов (черновик Role в мастере), а также
--      потому что отдельные вызовы могут логически принадлежать ещё-не-
--      созданному агенту (test-run внутри мастера).

alter table public.team_agents
  add column if not exists purpose text,
  add column if not exists success_criteria text;

comment on column public.team_agents.purpose is
  'Обязательное при создании через мастер. Защита от размножения агентов — заставляет подумать перед созданием. В промпт НЕ идёт.';
comment on column public.team_agents.success_criteria is
  'Обязательное при создании через мастер. Оценочный критерий через 2 недели — оставить или убрать агента. В промпт НЕ идёт.';

-- ---------------------------------------------------------------------------
-- team_api_calls: контекст вызова (агент + цель)
-- ---------------------------------------------------------------------------
-- Без FK на team_agents.id, потому что:
--   - 'system' — псевдо-агент для draft-role и других системных вызовов;
--   - test_run внутри мастера происходит до создания агента (id ещё не
--     зарегистрирован в team_agents).

alter table public.team_api_calls
  add column if not exists agent_id text,
  add column if not exists purpose text;

comment on column public.team_api_calls.agent_id is
  'Идентификатор агента или псевдо-id (''system''). Без FK на team_agents — поддерживает системные вызовы и черновики.';
comment on column public.team_api_calls.purpose is
  'Цель вызова: ''task'' (по умолчанию для задач), ''role_draft'', ''test_run'', ''voice_transcribe'' и т.п. Используется для разбора расходов по типу активности.';

-- Точечный индекс по agent_id — для будущих агрегаций «сколько потратил
-- агент X»; partial, чтобы не раздувать таблицу для вызовов без агента.
create index if not exists team_api_calls_agent_id_idx
  on public.team_api_calls (agent_id)
  where agent_id is not null;
