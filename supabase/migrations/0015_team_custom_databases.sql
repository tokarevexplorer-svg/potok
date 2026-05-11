-- Сессия 5 этапа 2 (по нумерации Claude_team_stage2.md — миграция «11»,
-- по сквозной нумерации проекта — 0015). Раздел «Базы»: реестр баз команды.
--
-- Реестр того, какие структурированные базы знания доступны команде.
-- На старте — две зашитые записи:
--   1) Референсы — указатель на существующую таблицу public.videos
--      (база Reels с транскрипцией и AI-разбором).
--   2) Конкуренты — placeholder. Реальная таблица каналов конкурентов
--      появится в этапе 5; здесь храним запись с table_name =
--      'competitors_placeholder' для рендера приглушённой карточки/пункта.
--
-- Будущие пользовательские базы (db_type='custom') добавляются мастером
-- «+ Создать базу» (этап 6, пункт 22) — он же создаст реальные таблицы.
-- Эта сессия (5) НЕ создаёт ни мастера, ни самих таблиц-кастомных —
-- только реестр и read-only просмотрщик Референсов.
--
-- Колонки:
--   * name              — отображаемое имя в UI и в slug'е /blog/databases/<slug>.
--   * description       — пояснение для карточки на индекс-странице.
--   * table_name        — имя реальной таблицы Postgres (для referensy/custom)
--                         или sentinel 'competitors_placeholder' (для competitor).
--                         UNIQUE — чтобы один реестр-указатель на одну таблицу.
--   * schema_definition — JSONB с описанием колонок для рендера в UI:
--                         { "columns": [{"key","label","type"}, ...] }
--                         Для placeholder-баз — NULL.
--   * db_type           — 'referensy' | 'competitor' | 'custom'. Влияет только
--                         на стиль карточки/пункта меню и доступ к содержимому.
--   * parent_db_id      — для будущих под-баз (например, отдельная база каналов
--                         конкурентов под общей «Конкуренты»). Сейчас не
--                         используется, оставлено как задел.
--
-- RLS открытая, как у остальных team_* таблиц — приложение защищено на уровне
-- бэкенда (requireAuth + whitelist). service-role клиент бэкенда обходит RLS.

create table if not exists public.team_custom_databases (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  table_name text not null unique,
  schema_definition jsonb,
  db_type text not null default 'custom'
    check (db_type in ('referensy', 'competitor', 'custom')),
  parent_db_id uuid references public.team_custom_databases(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists team_custom_databases_db_type_idx
  on public.team_custom_databases (db_type);

alter table public.team_custom_databases enable row level security;

drop policy if exists "team_custom_databases_public_all" on public.team_custom_databases;
create policy "team_custom_databases_public_all"
  on public.team_custom_databases for all
  to anon, authenticated
  using (true) with check (true);

-- Seed: две фиксированные записи. ON CONFLICT (table_name) DO NOTHING —
-- идемпотентно: повторный запуск миграции не дублирует строки и не затирает
-- описание, если Влад его уже отредактировал в Dashboard.

insert into public.team_custom_databases (name, description, table_name, db_type, schema_definition)
values
  (
    'Референсы',
    'Видеореференсы для блога — Instagram Reels с транскрипцией и AI-анализом',
    'videos',
    'referensy',
    '{"columns":[{"key":"caption","label":"Описание","type":"text"},{"key":"author","label":"Автор","type":"text"},{"key":"ai_category","label":"Категория","type":"text"},{"key":"is_reference","label":"Референс","type":"boolean"},{"key":"created_at","label":"Добавлено","type":"date"}]}'::jsonb
  ),
  (
    'Конкуренты',
    'Каналы конкурентов с транскрипцией роликов и AI-анализом',
    'competitors_placeholder',
    'competitor',
    null
  )
on conflict (table_name) do nothing;
