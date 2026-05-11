-- «Тестовый режим без авторизации» (dev mode).
--
-- Зачем: автоматизированные проверки через Playwright не могут пройти Google
-- OAuth без участия Влада. Этот режим позволяет временно (до 24 часов)
-- отключить редирект на /auth/signin для /blog/team/* — Playwright делает
-- свои проверки, потом флаг автоматически становится невалидным.
--
-- Хранение: одна служебная строка team_settings с key='dev_mode'.
-- Семантика «активно»: dev_mode_until не null И > now(). Auto-disable —
-- декларативно через сравнение timestamp'ов, никакого крон-джоба не нужно.
--
-- dev_mode_auto_disable_hours — выбор пользователя при включении (1/4/12/24),
-- хранится только чтобы UI помнил последнее значение и подставлял по
-- умолчанию при следующем включении. На сам гейт не влияет.
--
-- Безопасность:
--   * Toggle защищён: endpoint POST /api/team/admin/dev-mode требует валидной
--     сессии whitelisted-пользователя. Синтезированный JWT (из proxy в dev
--     mode) для этого пути НЕ принимается — иначе атакующий мог бы продлевать
--     режим самостоятельно после первого включения.
--   * Жёсткие лимиты расходов ($5/день, $1/задача из Сессии 2) продолжают
--     работать и при включённом dev mode — деньги защищены автономно.

alter table public.team_settings
  add column if not exists dev_mode_until timestamptz,
  add column if not exists dev_mode_auto_disable_hours integer;

comment on column public.team_settings.dev_mode_until is
  'Время автоотключения dev mode. Если null или < now() — режим неактивен. Максимум +24 часа от момента включения.';
comment on column public.team_settings.dev_mode_auto_disable_hours is
  'Выбранный пользователем интервал автоотключения в часах (1/4/12/24). Хранится для UI, на сам гейт не влияет.';
