-- Сессия 29 этапа 2 (пункт 11): механика самопроверки агента.
--
-- На задаче с self_review_enabled=true после первого вызова LLM запускается
-- второй вызов с той же моделью и тем же набором слоёв промпта (Mission,
-- Role, Goals, Memory, Skills), плюс чек-лист, собранный из 5 источников
-- (правила Memory + Skills + поля шаблона + табу Mission + пункты Влада).
-- Результат — JSON с пройденностью каждого пункта и опц. исправленным
-- ответом. Если revised=true, финальный артефакт = исправленная версия.

alter table public.team_tasks
  add column if not exists self_review_enabled boolean default false,
  add column if not exists self_review_extra_checks text,
  add column if not exists self_review_result jsonb;

comment on column public.team_tasks.self_review_enabled is
  'Включена ли самопроверка для этой задачи (дефолт берётся из frontmatter шаблона, но Влад может переопределить).';
comment on column public.team_tasks.self_review_extra_checks is
  'Дополнительные пункты проверки от Влада — свободный текст, по одному на строку. Идут в чек-лист как источник vlad_extra.';
comment on column public.team_tasks.self_review_result is
  'Результат self-review: { checklist: [{source, item, result, comment}], passed, revised, revised_result? }.';
