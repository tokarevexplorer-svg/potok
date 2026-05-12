-- Сессия 39 этапа 2 (пункт 20): инфраструктура Telegram.
--
-- Один системный бот (токен из ENV TELEGRAM_SYSTEM_BOT_TOKEN) + N ботов
-- агентов (токены хранятся здесь — каждый агент получает свой бот через
-- BotFather, привязывается через UI карточки сотрудника).
--
-- Очередь team_telegram_queue нужна для тихого часа: входящие нотификации
-- (push готовых задач, ежедневные отчёты, Inbox-события) копятся, утром
-- отправляются дайджестом.

create table if not exists public.team_telegram_bots (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.team_agents(id) on delete cascade,
  bot_token text not null,
  bot_username text,
  -- Сессия 41: Telegram user ID бота (для маршрутизации reply через
  -- reply_to_message.from.id). Заполняется при привязке через getMe().
  telegram_bot_id bigint,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  unique (agent_id)
);

comment on table public.team_telegram_bots is
  'Связь агентов с Telegram-ботами. Один агент = один бот (UNIQUE на agent_id).';

create index if not exists idx_team_telegram_bots_status
  on public.team_telegram_bots(status);

create table if not exists public.team_telegram_queue (
  id uuid primary key default gen_random_uuid(),
  bot_token text not null,
  chat_id text not null,
  message_text text not null,
  reply_markup jsonb,
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  source_type text,
  source_id text,
  agent_id text,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed'))
);

comment on table public.team_telegram_queue is
  'Очередь Telegram-сообщений. Накапливает во время тихого часа, отправляет утром дайджестом.';

create index if not exists idx_telegram_queue_status_queued
  on public.team_telegram_queue(status) where status = 'queued';

-- Настройки Telegram в team_settings — добавляем дефолтные значения.
-- Тип записи: key (text PK) + value (jsonb).
insert into public.team_settings (key, value) values
  ('telegram_enabled', 'false'::jsonb),
  ('telegram_chat_id', '""'::jsonb),
  ('telegram_daily_report_time', '"19:00"'::jsonb),
  ('telegram_quiet_hours', '{"start_hour": 22, "end_hour": 9, "timezone": "Europe/Moscow"}'::jsonb)
on conflict (key) do nothing;
