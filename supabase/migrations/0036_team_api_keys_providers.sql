-- Сессия 48 этапа 2 (пункт 1, этап 7): универсальный OpenAI-compatible адаптер.
--
-- Расширяем team_api_keys, чтобы хранить:
--   * base_url           — для OpenAI-compatible (DeepSeek, Groq, Perplexity и т.п.)
--   * is_openai_compatible — флаг, использует ли наш универсальный адаптер
--   * display_name        — человекочитаемое имя в UI
--   * models              — массив доступных моделей (можно заполнить вручную или
--                            подтянуть через GET /models на тестовом вызове)
--
-- Backfill: существующие 3 встроенных провайдера получают аккуратные значения.

ALTER TABLE team_api_keys
  ADD COLUMN IF NOT EXISTS base_url TEXT,
  ADD COLUMN IF NOT EXISTS is_openai_compatible BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS models JSONB DEFAULT '[]'::jsonb;

UPDATE team_api_keys
SET display_name = 'Anthropic',
    is_openai_compatible = FALSE
WHERE provider = 'anthropic' AND display_name IS NULL;

UPDATE team_api_keys
SET display_name = 'OpenAI',
    is_openai_compatible = TRUE,
    base_url = 'https://api.openai.com/v1'
WHERE provider = 'openai' AND display_name IS NULL;

UPDATE team_api_keys
SET display_name = 'Google Gemini',
    is_openai_compatible = FALSE
WHERE provider = 'google' AND display_name IS NULL;

COMMENT ON COLUMN team_api_keys.base_url IS 'Base URL для OpenAI-compatible (DeepSeek, Groq и т.п.). NULL у нативных Anthropic/Google.';
COMMENT ON COLUMN team_api_keys.is_openai_compatible IS 'true = ходит через универсальный sendOpenAICompatibleRequest в llmClient.';
COMMENT ON COLUMN team_api_keys.display_name IS 'Человекочитаемое имя в UI Админки.';
COMMENT ON COLUMN team_api_keys.models IS 'Массив доступных моделей провайдера. Заполняется вручную или через тест-вызов.';
