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
