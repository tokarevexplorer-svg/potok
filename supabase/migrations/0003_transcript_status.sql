-- Сессия 5: статус транскрипции.
-- Жизненный цикл строки:
--   pending    → видео ещё не дошло до транскрипции (Apify не закончил, или мы только в очереди)
--   processing → отправили в Whisper, ждём ответ
--   done       → текст в transcript заполнен
--   no_speech  → Whisper не нашёл речи, в UI показываем «Без речи (музыка/визуал)»
--   error      → ошибка, текст в transcript_error
--
-- В отличие от processing_status (вся обработка в целом), этот статус — только про транскрипцию.

alter table public.videos
  add column if not exists transcript_status text not null default 'pending',
  add column if not exists transcript_error text;

alter table public.videos
  drop constraint if exists videos_transcript_status_check;

alter table public.videos
  add constraint videos_transcript_status_check
  check (transcript_status in ('pending', 'processing', 'done', 'no_speech', 'error'));

create index if not exists videos_transcript_status_idx
  on public.videos (transcript_status);
