-- Сессия 9 этапа 2 (по нумерации Claude_team_stage2.md — миграция 0013,
-- по сквозной нумерации проекта — 0017). Реестр агентов команды.
--
-- Цель: превратить аморфных «исполнителей задач» в полноценных агентов с
-- семью «органами»: Identity (display_name, role_title, avatar, biography),
-- Mind (memory в team_agent_memory + наследование Mission/Goals),
-- Hands (database_access, available_tools, allowed_task_templates,
-- orchestration_mode), Voice (тон через biography + Role.md), Clock
-- (autonomy_level), Wallet (default_model), Awareness (автогенерируется
-- в promptBuilder в пункте 12).
--
-- На этой миграции:
--   * Заводим таблицу team_agents и лог team_agent_history.
--   * Привязываем уже существующий team_agent_memory.agent_id (миграция
--     0016) ссылочной целостностью к team_agents.id. Перед добавлением FK
--     чистим осиротевшие записи памяти (тестовые seed-агенты, у которых
--     ещё нет строки в team_agents).
--
-- RLS открытая, как у остальных team_* таблиц — приложение защищено на
-- уровне бэкенда (requireAuth + whitelist). service-role клиент обходит RLS.

create table if not exists public.team_agents (
  id text primary key,                       -- slug-идентификатор: 'scout', 'chief-editor'
  display_name text not null,                -- отображаемое имя: «Разведчик», «Шеф-редактор»
  role_title text,                           -- должность одной строкой: «Аналитик-разведчик»
  department text
    check (department in ('analytics', 'preproduction', 'production')),
  avatar_url text,                           -- URL аватара (Supabase Storage или внешний)
  biography text,                            -- биография в свободной форме
  status text not null default 'active'
    check (status in ('active', 'paused', 'archived')),

  -- Hands: доступы и permissions
  database_access jsonb not null default '[]'::jsonb,
    -- массив объектов: [{ database_id: "uuid", level: "read" | "append" | "create" }]
  available_tools text[] not null default '{}',
    -- массив slug'ов инструментов: ['web-search', 'notebooklm', 'apify']
  allowed_task_templates text[] not null default '{}',
    -- массив slug'ов шаблонов задач, которые агент может выполнять
  orchestration_mode boolean not null default false,
    -- true только для шефа-редактора: расширенные permissions в режиме оркестрации

  -- Clock: автономность
  autonomy_level integer not null default 0
    check (autonomy_level in (0, 1)),
    -- 0 = только по команде Влада, 1 = может предлагать самозадачи

  -- Wallet: модель и бюджеты
  default_model text,                        -- slug модели по умолчанию: 'claude-sonnet-4-20250514'

  -- Метаданные
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_team_agents_status on public.team_agents(status);
create index if not exists idx_team_agents_department on public.team_agents(department);

comment on table public.team_agents is
  'Реестр агентов команды. Семь органов: Identity (display_name, role_title, avatar, biography), Mind (memory в team_agent_memory + наследование Mission/Goals), Hands (database_access, available_tools, allowed_task_templates, orchestration_mode), Voice (тон через biography + Role.md), Clock (autonomy_level), Wallet (default_model), Awareness (автогенерируется в promptBuilder).';

alter table public.team_agents enable row level security;
drop policy if exists "team_agents_public_all" on public.team_agents;
create policy "team_agents_public_all"
  on public.team_agents for all
  to anon, authenticated
  using (true) with check (true);

-- =========================================================================
-- Лог изменений агента
-- =========================================================================

create table if not exists public.team_agent_history (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.team_agents(id) on delete cascade,
  change_type text not null,
    -- 'created', 'role_updated', 'biography_updated', 'model_changed',
    -- 'status_changed', 'tools_changed', 'databases_changed',
    -- 'autonomy_changed', 'seed_rules_added', и т.д.
  old_value text,                            -- предыдущее значение (текст или JSON-строка)
  new_value text,                            -- новое значение
  comment text,                              -- опциональный комментарий Влада «зачем поправил»
  created_at timestamptz not null default now()
);

create index if not exists idx_team_agent_history_agent
  on public.team_agent_history(agent_id);
create index if not exists idx_team_agent_history_created
  on public.team_agent_history(created_at desc);

comment on table public.team_agent_history is
  'Лог изменений агента: правки Role, биографии, модели, статуса. Через 3 месяца позволяет понять «почему агент стал работать иначе».';

alter table public.team_agent_history enable row level security;
drop policy if exists "team_agent_history_public_all" on public.team_agent_history;
create policy "team_agent_history_public_all"
  on public.team_agent_history for all
  to anon, authenticated
  using (true) with check (true);

-- =========================================================================
-- FK: team_agent_memory.agent_id → team_agents.id
-- На Сессии 8 FK не было — таблицы агентов ещё не существовало. Теперь
-- подтягиваем ссылочную целостность с каскадным удалением: если агента
-- архивируют через DELETE, его правила и эпизоды уходят вместе с ним.
-- =========================================================================

-- Сначала удаляем осиротевшие записи памяти, которые ссылаются на
-- несуществующих в team_agents агентов (тестовые seed'ы из Сессии 8).
delete from public.team_agent_memory
where agent_id not in (select id from public.team_agents);

alter table public.team_agent_memory
  drop constraint if exists fk_team_agent_memory_agent;

alter table public.team_agent_memory
  add constraint fk_team_agent_memory_agent
  foreign key (agent_id) references public.team_agents(id) on delete cascade;
