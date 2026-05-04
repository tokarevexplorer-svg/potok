-- Сессия 24: таблицы и buckets для раздела «Команда».
--
-- Новый раздел «Блог → Команда» — функциональная копия локальной ДК Лурье
-- (десктопного инструмента подготовки экскурсий) внутри Потока. Реализуется
-- по архитектурному документу STAGE1_ARCHITECTURE_v2.md и плану
-- ROADMAP_STAGE1_v2.md (этап 1, сессия 1 этих документов).
--
-- Что создаём:
--   1. team_tasks      — журнал задач команды. Append-only: каждое изменение
--                        статуса/контента задачи = новая строка с тем же task id.
--                        Текущее состояние задачи = последняя строка по этому id.
--   2. team_api_calls  — журнал вызовов LLM (для агрегации расходов и UI «Расходы»).
--   3. team_api_keys   — ключи моделей (anthropic / openai / google). Хранение в БД,
--                        а не в env, чтобы Влад мог менять через админку без
--                        передеплоя бэкенда.
--   4. team_settings   — пользовательские настройки команды (порог алерта расходов
--                        и пр.). Один key-value стол на всё.
--
--   5. Buckets в Storage:
--        team-database — артефакты задач (research/, texts/, ideas/, sources/, uploads/,
--                        context.md, concept.md). Приватный, доступ через service-role
--                        бэкенда — все операции (включая чтение) идут через
--                        backend/src/routes/team/artifacts.js.
--        team-prompts  — шаблоны промптов (5 markdown-файлов).
--        team-config   — pricing.json, presets.json.
--
-- Префикс `team_` / `team-` — чтобы новые сущности не конфликтовали с
-- существующими таблицами/buckets Потока (videos, bookmarks, thumbnails) и легко
-- искались в Supabase Dashboard.
--
-- RLS на всех таблицах открытая, как у videos — приложение пока без auth.
-- Service-role клиент бэкенда обходит RLS, browser-клиент ходит через anon.
--
-- Запусти этот SQL в Supabase → SQL Editor одним блоком. Миграция ничего не дропает.
-- Если шаг с buckets упадёт (раздел STORAGE BUCKETS ниже) — создай их руками
-- в Dashboard → Storage → New bucket. Имена: team-database, team-prompts, team-config.
-- Все три приватные (Public bucket = OFF).

-- pgcrypto уже подгружен миграцией 0001 (для gen_random_uuid()), повторно не нужен.

-- ============================================================================
-- 1. team_tasks — журнал задач команды (append-only)
-- ============================================================================
--
-- Каждый запуск задачи генерирует task id (текстовый, формата "tsk_<random>",
-- генерируется бэкендом — здесь не задаём дефолт). На каждое изменение статуса
-- (running → done, переименование, архив, AI-правка фрагментов) — новая строка
-- с тем же `id`. record_id у каждой строки уникальный.
--
-- Чтение текущего состояния задачи: SELECT DISTINCT ON (id) ... ORDER BY id, created_at DESC.
-- Поэтому индекс (id, created_at desc) — обязательный.

create table if not exists public.team_tasks (
  record_id uuid primary key default gen_random_uuid(),

  -- ID задачи. Одинаковый для всех снапшотов. Текстовый, генерируется бэкендом.
  id text not null,

  -- Тип: ideas_free | ideas_questions_for_research | research_direct | write_text | edit_text_fragments
  -- CHECK не ставим — список типов расширяется на этапе 2 для агентов,
  -- лучше валидировать в коде, чем тащить миграцию на каждый новый тип.
  type text not null,
  title text,

  -- Статус: running | done | revision | archived | error | marked_done
  status text not null,

  -- Входные параметры задачи (user_input, source, point_name, length_hint, research_paths и т.п.)
  params jsonb not null default '{}'::jsonb,

  -- Выбор модели: {preset?: 'fast'|'balanced'|'best', provider?, model?}
  model_choice jsonb not null default '{}'::jsonb,

  -- Резолвлёный провайдер и модель (после resolveModelChoice). Дублируются здесь
  -- для удобной агрегации в team_api_calls и админке расходов — и чтобы запись
  -- задачи была самодостаточной, без необходимости джойнить api_calls.
  provider text,
  model text,

  -- Собранный промпт: {system, user, cacheable_blocks, template}
  prompt jsonb,
  prompt_override_used boolean not null default false,

  -- Финальный текст ответа LLM (саммари, ответ на вопрос, написанный текст и т.д.).
  -- Для большинства задач дублирует содержимое артефакта — артефакт первичен,
  -- result хранится для быстрого отображения превью без скачивания файла.
  result text,

  -- Путь в Supabase Storage до артефакта-файла (относительно bucket'а team-database).
  -- Например: research/2026-05-04_petersburg.md, texts/poltava/v1_2026-05-04.md
  artifact_path text,

  -- Токены: {input, output, cached}
  tokens jsonb,

  -- Стоимость задачи в USD. Для AI-правки фрагментов — суммируется с родительской
  -- задачей в её собственной строке (а не создаёт новый team_tasks record).
  cost_usd numeric,

  -- Текст ошибки если status = 'error'
  error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

-- Индекс под DISTINCT ON (id) — основной паттерн чтения задач.
-- Также покрывает фильтрацию по конкретной задаче (`where id = '...'`).
create index if not exists team_tasks_id_created_at_idx
  on public.team_tasks (id, created_at desc);

-- Сортировка списка задач в логе — по времени создания.
create index if not exists team_tasks_created_at_idx
  on public.team_tasks (created_at desc);

-- Частичный индекс на активные задачи (recovery после рестарта бэкенда +
-- лента «В процессе» в UI). Большинство строк — done/archived, в этот индекс
-- не попадают.
create index if not exists team_tasks_running_idx
  on public.team_tasks (id)
  where status = 'running';

-- Триггер updated_at на случай, если строку всё-таки апдейтят
-- (append-only — соглашение, но защититься на уровне БД дёшево).
-- Функция set_updated_at() уже создана миграцией 0001.
drop trigger if exists team_tasks_set_updated_at on public.team_tasks;
create trigger team_tasks_set_updated_at
before update on public.team_tasks
for each row execute function public.set_updated_at();

alter table public.team_tasks enable row level security;

drop policy if exists "team_tasks_public_all" on public.team_tasks;
create policy "team_tasks_public_all"
  on public.team_tasks for all
  to anon, authenticated
  using (true) with check (true);

-- ============================================================================
-- 2. team_api_calls — журнал вызовов LLM
-- ============================================================================
--
-- Пишется бэкендом (costTracker.recordCall) после каждого вызова к Anthropic /
-- OpenAI / Google. Используется для UI «Админка → Расходы» (агрегация по
-- провайдерам/моделям/дням) и для биллинга AI-правок против родительской задачи
-- через task_id.

create table if not exists public.team_api_calls (
  id uuid primary key default gen_random_uuid(),

  timestamp timestamptz not null default now(),

  provider text not null,
  model text not null,

  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  cost_usd numeric not null default 0,

  -- task id из team_tasks. Nullable — для вызовов вне контекста задачи
  -- (например, refinePrompt для уточнения шаблона).
  task_id text,

  success boolean not null default true,
  error text,

  -- Минуты аудио для Whisper-вызовов (биллинг по минутам, не по токенам).
  audio_minutes numeric
);

-- Сортировка журнала по времени.
create index if not exists team_api_calls_timestamp_idx
  on public.team_api_calls (timestamp desc);

-- Получение всех вызовов конкретной задачи (для биллинга AI-правок).
create index if not exists team_api_calls_task_id_idx
  on public.team_api_calls (task_id)
  where task_id is not null;

alter table public.team_api_calls enable row level security;

drop policy if exists "team_api_calls_public_all" on public.team_api_calls;
create policy "team_api_calls_public_all"
  on public.team_api_calls for all
  to anon, authenticated
  using (true) with check (true);

-- ============================================================================
-- 3. team_api_keys — ключи моделей
-- ============================================================================
--
-- Provider — primary key (одна запись на провайдера). Шифрования на уровне БД
-- пока нет (Поток сейчас тоже хранит OPENAI_API_KEY и APIFY_API_TOKEN в env
-- Railway без шифрования — это согласовано для личного инструмента без auth).
-- Если в будущем понадобится — добавим через pgsodium.

create table if not exists public.team_api_keys (
  provider text primary key
    check (provider in ('anthropic', 'openai', 'google')),
  key_value text not null,
  updated_at timestamptz not null default now()
);

drop trigger if exists team_api_keys_set_updated_at on public.team_api_keys;
create trigger team_api_keys_set_updated_at
before update on public.team_api_keys
for each row execute function public.set_updated_at();

alter table public.team_api_keys enable row level security;

drop policy if exists "team_api_keys_public_all" on public.team_api_keys;
create policy "team_api_keys_public_all"
  on public.team_api_keys for all
  to anon, authenticated
  using (true) with check (true);

-- ============================================================================
-- 4. team_settings — пользовательские настройки команды
-- ============================================================================
--
-- Минимально нужно для алерта расходов (key='alert_threshold_usd', value=число).
-- Гибкий key-value, чтобы добавлять новые настройки без миграций.

create table if not exists public.team_settings (
  key text primary key,
  value jsonb,
  updated_at timestamptz not null default now()
);

drop trigger if exists team_settings_set_updated_at on public.team_settings;
create trigger team_settings_set_updated_at
before update on public.team_settings
for each row execute function public.set_updated_at();

alter table public.team_settings enable row level security;

drop policy if exists "team_settings_public_all" on public.team_settings;
create policy "team_settings_public_all"
  on public.team_settings for all
  to anon, authenticated
  using (true) with check (true);

-- ============================================================================
-- 5. STORAGE BUCKETS
-- ============================================================================
--
-- В Supabase бакеты хранятся в служебной таблице storage.buckets, доступной из
-- SQL Editor. INSERT здесь идёт без on-conflict-do-update — если бакет уже
-- существует, просто пропустится (`do nothing`).
--
-- Все три бакета приватные (public = false): для записи и чтения нужен service-role
-- (бэкенд использует SUPABASE_SERVICE_ROLE_KEY). Браузер напрямую не может ни
-- читать, ни писать — все операции с артефактами/промптами идут через
-- backend/src/routes/team/artifacts.js и /prompts.js (см. сессию 4 roadmap).
--
-- Если этот блок упадёт (например, при миграции через клиента, у которого нет прав
-- на storage схему), создай бакеты руками в Supabase Dashboard:
--   Storage → New bucket → имя из списка ниже → Public bucket = OFF → Save.

insert into storage.buckets (id, name, public)
values
  ('team-database', 'team-database', false),
  ('team-prompts',  'team-prompts',  false),
  ('team-config',   'team-config',   false)
on conflict (id) do nothing;
