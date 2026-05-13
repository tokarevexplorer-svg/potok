-- Сессия 49 этапа 2 (пункт 1, этап 7): Системная LLM.
--
-- Системная LLM — единое место, где живёт выбор «какой моделью обрабатывать
-- НЕ-task вызовы» (feedback_parser, episode_compression, clarification,
-- merge_artifacts, daily_report, promote_artifact, draft_role, и т.п.).
-- До этой сессии каждый сервис ходил через свой pickProvider() helper,
-- выбирая первого попавшегося провайдера из anthropic/openai/google.
-- Теперь — единая настройка в team_settings.
--
-- Поля:
--   system_llm_provider — slug провайдера (anthropic/openai/google/deepseek/…)
--   system_llm_model    — id модели у этого провайдера
--   system_llm_budget_usd — мягкий месячный лимит. При превышении лог
--                           warning, но НЕ блокировка (Влад сам решит).
--
-- ВАЖНО: в этой сессии мы не вводим отдельный столбец `system_function` в
-- team_api_calls — поле `purpose` уже выполняет ту же роль (значения
-- 'feedback_parser', 'autonomy_filter', 'batch', 'merge', 'promote_artifact',
-- 'clarification', 'daily_report' и т.д. появлялись начиная с Сессии 22).
-- Добавление system_function было бы дублирующим столбцом.

INSERT INTO team_settings (key, value)
VALUES
  ('system_llm_provider', '"anthropic"'::jsonb),
  ('system_llm_model', '"claude-haiku-4-5"'::jsonb),
  ('system_llm_budget_usd', '10'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Чтобы дальнейшие фильтры биллинга по purpose='system_*' работали быстрее,
-- добавим индекс. (Если уже есть от предыдущих сессий — IF NOT EXISTS).
CREATE INDEX IF NOT EXISTS idx_team_api_calls_purpose
  ON team_api_calls(purpose);
