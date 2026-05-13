-- Сессия 44 этапа 2 (пункт 22): batch-режим Anthropic.
--
-- Задачи, запущенные в batch-режиме, получают batch_id и переходят в статус
-- 'awaiting_resource' (существующий статус, см. миграцию 0030). batchPollService
-- раз в 5 минут проверяет batch у Anthropic и заносит результат — стоимость
-- × 0.5 (скидка Anthropic Batch API).

ALTER TABLE team_tasks
  ADD COLUMN IF NOT EXISTS batch_mode BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS batch_id TEXT;

-- Частичный индекс по batch_id — нужен только batchPollService'у для выборки
-- задач, ожидающих результата. У основной массы задач batch_id = NULL.
CREATE INDEX IF NOT EXISTS idx_team_tasks_batch
  ON team_tasks(batch_id)
  WHERE batch_id IS NOT NULL;

COMMENT ON COLUMN team_tasks.batch_mode IS
  'Задача запущена через Anthropic Batch API (50% скидка, до 24ч). Поддержка только anthropic-провайдера; для остальных флаг игнорируется с warning.';
COMMENT ON COLUMN team_tasks.batch_id IS
  'ID batch-запроса Anthropic для отслеживания (msg_batch_*). batchPollService поллит статус через @anthropic-ai/sdk.';
