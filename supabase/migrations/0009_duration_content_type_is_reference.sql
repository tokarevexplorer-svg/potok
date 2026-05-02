-- Сессия 18: хронометраж + тип контента + AI-классификация «референс/другое».
--
-- Что добавляет:
--   duration       (integer, nullable)  — длительность видео в секундах. Для фото/каруселей null.
--   content_type   (text, default 'video', CHECK in 'video'|'image'|'carousel')
--                  — что прислал Apify. Для уже сохранённых записей по умолчанию 'video',
--                  потому что до этой сессии мы кормили в систему только Reels.
--   is_reference   (boolean, nullable)  — определяется AI: true = полезно для блога,
--                  false = личный/нерелевантный. null = ещё не определено.
--                  Влад может вручную переключить через UI.
--
-- Запусти этот SQL в Supabase → SQL Editor одним блоком. Миграция ничего не дропает.

alter table public.videos
  add column if not exists duration integer,
  add column if not exists content_type text not null default 'video',
  add column if not exists is_reference boolean;

alter table public.videos
  drop constraint if exists videos_content_type_check;

alter table public.videos
  add constraint videos_content_type_check
  check (content_type in ('video', 'image', 'carousel'));

-- Индексы под новые фильтры в FilterBar.
create index if not exists videos_content_type_idx
  on public.videos (content_type);

-- Частичный индекс: ускоряет фильтр «is_reference = true/false»,
-- при этом не раздувается записями с null (их большинство до AI-анализа).
create index if not exists videos_is_reference_idx
  on public.videos (is_reference)
  where is_reference is not null;
