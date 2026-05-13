-- Сессия 51 этапа 2: снимаем CHECK-constraint на team_api_keys.provider.
--
-- Constraint живёт с миграции 0012 (этап 1), где провайдеров было ровно три.
-- Сессия 48 расширила сервис под произвольных провайдеров (DeepSeek, Groq,
-- кастомные OpenAI-compatible), но забыла снять CHECK на уровне БД —
-- при попытке вставить `provider='deepseek'` PostgREST возвращает ошибку
-- `team_api_keys_provider_check`.
--
-- Снимаем CHECK полностью. Валидация slug провайдера остаётся в
-- keysService.ensureProvider (regex `^[a-z][a-z0-9_-]{0,40}$`).

ALTER TABLE team_api_keys
  DROP CONSTRAINT IF EXISTS team_api_keys_provider_check;
