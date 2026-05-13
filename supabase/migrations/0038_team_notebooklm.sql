-- Сессия 50 этапа 2 (пункт 1, этап 7): мониторинг NotebookLM воркера.
--
-- Локальный воркер NotebookLM (запускается на машине Влада, см. этап 5
-- пункт 17) периодически шлёт heartbeat'ы в эту таблицу. Админка читает
-- последнюю запись и решает: 🟢 онлайн / 🟡 возможно занят / 🔴 офлайн.
--
-- Очередь задач между Railway-бэкендом и локальным воркером — пока тоже
-- здесь, как минимальная инфраструктура: backend вставляет строку, воркер
-- забирает в работу, отписывается о результате. Полноценная очередь с
-- ретраями и приоритетами — отдельная сессия.

CREATE TABLE IF NOT EXISTS team_notebooklm_heartbeat (
  id SERIAL PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'alive',
  version TEXT,
  last_task_id TEXT,
  last_task_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_notebooklm_heartbeat_created
  ON team_notebooklm_heartbeat(created_at DESC);

COMMENT ON TABLE team_notebooklm_heartbeat IS
  'Heartbeat-записи от локального NotebookLM-воркера. Последняя строка = текущее состояние. Воркер шлёт раз в ~30 сек.';

CREATE TABLE IF NOT EXISTS team_notebooklm_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'done', 'error')),
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_team_notebooklm_queue_status
  ON team_notebooklm_queue(status)
  WHERE status IN ('queued', 'running');

COMMENT ON TABLE team_notebooklm_queue IS
  'Очередь задач для локального NotebookLM-воркера. Backend INSERT, воркер забирает SELECT FOR UPDATE и обновляет status/result.';
