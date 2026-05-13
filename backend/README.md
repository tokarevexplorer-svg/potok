# potok-backend

Бэкенд «Аналитика» на Express. Принимает `videoId`, дёргает Apify Instagram Scraper, раскладывает данные по полям и обновляет строку в Supabase.

## Запуск локально

1. Установи Node.js ≥ 20 (проверить: `node -v`).
2. В папке `backend/`:
   ```
   & "C:\Program Files\nodejs\npm.cmd" install
   ```
3. Скопируй `.env.example` → `.env` и заполни ключи (Apify токен + Supabase URL и service role key).
4. Старт:
   ```
   & "C:\Program Files\nodejs\npm.cmd" run dev
   ```
   Сервер поднимется на `http://localhost:3001`. Health-чек: `GET /health`.

## Эндпоинты

- `GET /health` — жив ли сервер.
- `POST /api/videos/process` — `{ "videoId": "<uuid>" }`. Отвечает `202 accepted` сразу и обрабатывает в фоне.

## Структура

```
src/
  index.js            — точка входа
  app.js              — настройка express, CORS, роуты
  config/env.js       — валидация переменных окружения
  routes/videos.js    — роуты /api/videos/*
  services/
    apifyService.js   — вызов Apify, маппинг полей
    supabaseService.js — обновление строки videos (service role)
    videoProcessor.js — оркестратор: Apify → Supabase
```

## Деплой

Railway. Переменные окружения — скопировать из `.env`. `PORT` Railway подставит сам.

## Переменные окружения для авторизации (Сессия 1 этапа 2)

С Сессии 1 этапа 2 все маршруты `/api/team/*` защищены `requireAuth` middleware
(см. `src/middleware/requireAuth.js`). Бэкенд проверяет HS256-JWT, подписанный
тем же `NEXTAUTH_SECRET`, что и фронт. На Railway нужны:

- `NEXTAUTH_SECRET` — должен совпадать с переменной на Vercel. Без него
  все `/api/team/*` отвечают 500.
- `WHITELISTED_EMAIL` — fallback для whitelist email, если в
  `team_settings.whitelisted_email` (запись `key='security'`) нет
  значения. Достаточно одного email в нижнем регистре.

Маршруты `/health`, `/api/videos/*`, `/api/thumbnails/*` остаются открытыми
(они вызываются автоматическими процессами Vercel/Railway, не из браузера).

## Telegram (Сессии 39–42 этапа 2, пункт 20)

Инфраструктура: один **системный бот** (общие уведомления, объявления о
составе команды, ответы на webhook) + N **ботов агентов** (по одному на
каждого активного агента — отчёты, реакции на done-задачи). Все боты сидят
в одном **общем рабочем чате**.

### ENV-переменные

- `TELEGRAM_SYSTEM_BOT_TOKEN` — токен системного бота от @BotFather.
  Если не задан, ВСЕ Telegram-функции тихо выключаются — бэкенд работает
  без Telegram, никаких ошибок в логах.
- `TELEGRAM_WEBHOOK_SECRET` — произвольная строка (рекомендация:
  `openssl rand -hex 32`). Telegram присылает её в заголовке
  `X-Telegram-Bot-Api-Secret-Token` при каждом обращении к
  `/api/team/telegram/webhook/:tokenHash` — бэкенд проверяет совпадение.
  Без секрета webhook возвращает 401.
- `FRONTEND_PUBLIC_URL` — адрес фронта для генерации ссылок в сообщениях
  (`https://potok-omega.vercel.app` по умолчанию).

`chat_id` общего чата, время ежедневного отчёта, тихий час и тумблер
«Telegram включён» хранятся в `team_settings` и редактируются через
Админку (`/blog/team/admin`, блок «Telegram»). Токены ботов агентов —
в таблице `team_telegram_bots`, привязываются через карточку сотрудника.

### Регистрация webhook'ов

После заведения ботов в Админке → блок «Telegram» → кнопка
«Зарегистрировать вебхуки» (передать `base_url` = публичный URL Railway).
Webhook URL имеет формат
`<base_url>/api/team/telegram/webhook/<tokenHash(botToken)>` — это нужно
чтобы один общий обработчик мог различить, от какого бота пришёл апдейт,
не светя сам токен в URL.

### Интеграционный тест

```
npm run test:telegram
```

8 проверок: отправка от системного и агентского бота, очередь во время
тихого часа, flushQueue, защита от агента без бота, пропуск paused-агента
в ежедневном отчёте, дублирование Inbox в Telegram, urgent обходит тихий
час. Тесты, требующие сети, автоматически помечаются `SKIP`, если в ENV
нет `TELEGRAM_SYSTEM_BOT_TOKEN` или Telegram выключен в Админке.
