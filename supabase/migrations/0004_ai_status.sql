-- Сессия 6: статус AI-анализа (саммари + категория).
-- Жизненный цикл строки:
--   pending    → ещё не дошли до анализа (Apify/Whisper не закончили)
--   processing → отправили в OpenAI, ждём ответ
--   done       → ai_summary / ai_category заполнены
--   skipped    → недостаточно данных для анализа (нет ни речи, ни описания)
--   error      → ошибка, текст в ai_error
--
-- Сами поля ai_summary / ai_category / ai_category_suggestion уже есть
-- из миграции 0001 — здесь только статус и ошибка.

alter table public.videos
  add column if not exists ai_status text not null default 'pending',
  add column if not exists ai_error text;

alter table public.videos
  drop constraint if exists videos_ai_status_check;

alter table public.videos
  add constraint videos_ai_status_check
  check (ai_status in ('pending', 'processing', 'done', 'skipped', 'error'));

create index if not exists videos_ai_status_idx
  on public.videos (ai_status);
