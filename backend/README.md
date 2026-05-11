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
