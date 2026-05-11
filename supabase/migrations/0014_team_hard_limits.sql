-- Сессия 2 этапа 2 (по нумерации Claude_team_stage2.md — миграция 0010,
-- по сквозной нумерации проекта — 0014). Жёсткие лимиты расходов.
--
-- В рамках Сессии 2 «Жёсткие лимиты расходов и блок Безопасности в Админке»
-- (этап 0, пункт 21): добавляем дневной лимит ($5 дефолт) и лимит на задачу
-- ($1 дефолт) с жёсткой блокировкой постановки/выполнения, чтобы случайный
-- сценарий «промпт ушёл в цикл» не разорил бюджет.
--
-- Колонки добавляются в существующую key-value таблицу team_settings —
-- такой же компромисс, как в миграции 0013 (whitelisted_email): таблица
-- была изначально (key TEXT PK, value JSONB), ТЗ просит named columns.
-- Все четыре поля хранятся в единственной записи с ключом 'limits'
-- (см. backend/src/services/team/limitsService.js, сессия 2).
--
-- Поведение лимитов:
--   * dailyLimit (5 USD) — суммируется по team_api_calls за текущие сутки UTC.
--     При попытке поставить новую задачу свыше лимита бэкенд возвращает
--     409 Conflict и фронт показывает alert. Действует до конца UTC-суток.
--   * taskLimit (1 USD) — суммируется по конкретному task_id в team_api_calls.
--     После каждого LLM-вызова в многошаговой задаче проверяется превышение.
--     При превышении задача мягко обрывается со status='error' (промежуточные
--     артефакты и step_state не удаляются — Влад сможет анализировать или
--     продолжить руками).
--   * Оба `*_enabled` флага позволяют временно выключить проверку без
--     обнуления самого лимита (например, для длинного исследования).

alter table public.team_settings
  add column if not exists hard_daily_limit_usd numeric(10, 2) default 5.00;

comment on column public.team_settings.hard_daily_limit_usd is
  'Жёсткий дневной лимит расходов в USD. По умолчанию $5. Считается по сумме cost_usd из team_api_calls за текущие UTC-сутки. Используется одна запись с key=''limits''.';

alter table public.team_settings
  add column if not exists hard_task_limit_usd numeric(10, 2) default 1.00;

comment on column public.team_settings.hard_task_limit_usd is
  'Жёсткий лимит стоимости одной задачи в USD. По умолчанию $1. Считается по сумме cost_usd в team_api_calls по конкретному task_id. Используется одна запись с key=''limits''.';

alter table public.team_settings
  add column if not exists hard_daily_limit_enabled boolean default true;

comment on column public.team_settings.hard_daily_limit_enabled is
  'Включён ли дневной лимит. true — постановка задач блокируется при превышении; false — лимит игнорируется.';

alter table public.team_settings
  add column if not exists hard_task_limit_enabled boolean default true;

comment on column public.team_settings.hard_task_limit_enabled is
  'Включён ли лимит на задачу. true — выполнение задачи мягко прерывается при превышении; false — лимит игнорируется.';

-- Сразу инициализируем строку с дефолтами, чтобы UI не показывал «не задано»
-- сразу после миграции и чтобы код мог писать через upsert по key='limits'.
insert into public.team_settings (key, value, hard_daily_limit_usd, hard_task_limit_usd, hard_daily_limit_enabled, hard_task_limit_enabled)
values ('limits', null, 5.00, 1.00, true, true)
on conflict (key) do update
  set
    hard_daily_limit_usd     = coalesce(public.team_settings.hard_daily_limit_usd, 5.00),
    hard_task_limit_usd      = coalesce(public.team_settings.hard_task_limit_usd, 1.00),
    hard_daily_limit_enabled = coalesce(public.team_settings.hard_daily_limit_enabled, true),
    hard_task_limit_enabled  = coalesce(public.team_settings.hard_task_limit_enabled, true);
