-- Сессия 1 этапа 2 (по нумерации Claude_team_stage2.md — миграция 0009,
-- по сквозной нумерации проекта — 0013). Безопасность доступа к команде.
--
-- В рамках Сессии 1 «Google OAuth и whitelist» (этап 0, пункт 21):
-- закрываем publicly доступный potok-omega.vercel.app от посторонних.
-- Аутентификация делается через Auth.js v5 + Google OAuth, whitelist email
-- хранится либо в переменной окружения WHITELISTED_EMAIL (fallback), либо
-- здесь в таблице team_settings — чтобы Влад мог сменить email через
-- админку без передеплоя.
--
-- whitelisted_email — текстовый столбец в существующей key-value таблице
-- team_settings. Реально используется одна запись с ключом 'security'
-- (см. backend/src/services/team/whitelistService.js). Это компромисс:
-- ТЗ просит добавить столбец, но table уже была key-value (key TEXT PK,
-- value JSONB). Столбец добавлен идемпотентно (IF NOT EXISTS); запрос
-- whitelist email идёт явно по key='security', не по «первой попавшейся
-- строке», чтобы поведение было детерминированным.

alter table public.team_settings
  add column if not exists whitelisted_email text null;

comment on column public.team_settings.whitelisted_email is
  'Email override для whitelist OAuth, fallback на ENV WHITELISTED_EMAIL. Используется одна запись с key=''security''.';
