-- Сессия 9: индекс на processing_status
-- Нужен для быстрого восстановления очереди при старте бэкенда: после перезапуска
-- сканируем videos где processing_status in ('pending', 'processing') и ставим в очередь.
-- Без индекса этот запрос на тысячах строк будет тянуть полный seq scan.
--
-- Уникальность url уже обеспечена `unique` в миграции 0001 — отдельный индекс не нужен.

create index if not exists videos_processing_status_idx
  on public.videos (processing_status)
  where processing_status in ('pending', 'processing');
