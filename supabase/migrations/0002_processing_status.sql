-- Сессия 4: статус фоновой обработки видео.
-- Жизненный цикл строки:
--   pending    → только что добавили ссылку, бэкенд ещё не взял в работу
--   processing → бэкенд отправил запрос в Apify и ждёт результат
--   done       → Apify вернул данные, поля справочной информации и статистики заполнены
--   error      → обработка упала, текст ошибки лежит в processing_error

alter table public.videos
  add column if not exists processing_status text not null default 'pending',
  add column if not exists processing_error text,
  add column if not exists processed_at timestamptz;

-- Ограничим допустимые значения статуса.
alter table public.videos
  drop constraint if exists videos_processing_status_check;

alter table public.videos
  add constraint videos_processing_status_check
  check (processing_status in ('pending', 'processing', 'done', 'error'));

create index if not exists videos_processing_status_idx
  on public.videos (processing_status);
