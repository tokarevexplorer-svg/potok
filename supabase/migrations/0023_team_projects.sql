-- Сессия 16 этапа 2 (по нумерации CLAUDE.md — миграция 0018, по сквозной
-- нумерации проекта — 0023). Проекты как навигационные теги для задач.
--
-- Цель пункта 14 (этап 3): на дашборде хочется фильтровать задачи не только
-- по сотруднику и статусу, но и по «теме» — например, «Большая стирка»,
-- «Спецвыпуски про Петербург», «Контентный план апрель». Проекты — простой
-- ярлык, не структура: нет иерархии, нет дедлайнов, нет own-членов.
--
-- Поля минимальны:
--   * id          — text-PK, по умолчанию uuid (но допускаем человекочитаемые
--                   идентификаторы — Влад может задать «april-content» в
--                   будущем, если понадобится stable-slug).
--   * name        — отображаемое имя.
--   * description — одна строка пояснения (не показывается на карточке).
--   * status      — 'active' | 'archived'. Архив скрыт из фильтров, но
--                   задачи в нём не пропадают.
--   * created_at  — timestamptz, для сортировки.
--
-- team_tasks.project_id — soft-ref на team_projects.id (FK ON DELETE SET NULL,
-- чтобы архивация/удаление проекта не дропала задачи). Nullable: задача без
-- проекта = категория «⚪ Без проекта» в фильтре.

create table if not exists public.team_projects (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  description text,
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamptz not null default now()
);

alter table public.team_projects enable row level security;

drop policy if exists "team_projects_public_all" on public.team_projects;
create policy "team_projects_public_all"
  on public.team_projects for all
  to anon, authenticated
  using (true) with check (true);

comment on table public.team_projects is
  'Проекты — навигационные тэги для группировки задач (Сессия 16, пункт 14). Без иерархии, без дедлайнов.';

-- team_tasks.project_id: nullable FK. ON DELETE SET NULL — архивация
-- проекта (через смену status) не трогает FK, а полное удаление (если
-- когда-нибудь случится) обнулит ссылки.
alter table public.team_tasks
  add column if not exists project_id text
    references public.team_projects(id) on delete set null;

create index if not exists idx_team_tasks_project
  on public.team_tasks (project_id)
  where project_id is not null;

comment on column public.team_tasks.project_id is
  'Проект (тег) задачи. NULL = «без проекта». Через ON DELETE SET NULL: удаление проекта обнуляет, не дропает задачу.';
