# Команда — CLAUDE.md

Рабочий документ для разработки AI-редакции суперапа Поток. Содержит контекст, стек, архитектуру, roadmap из 7 этапов и 51 сессию разработки.

**Стек:** Node.js + Express бэкенд, Next.js + React + TypeScript фронтенд, Supabase (PostgreSQL + Storage), без Python. Сообщения об ошибках на русском.

---

## 0. Инструкции для Claude Code

### Запуск сессии
Влад пишет номер сессии (например, «Сессия 1»). Claude Code находит её ТЗ ниже в разделе «Сессии» и выполняет все пункты из блока «ТЗ для Claude Code».

### По завершении сессии — обязательный чеклист

**1. Деплой (делаешь сам, молча):**
- `git add . && git commit -m "Сессия N — краткое описание" && git push origin main`
- Если в сессии есть миграция — `npx supabase db push` (CLI привязан, `supabase link` выполнен)
- Vercel и Railway деплоят автоматически при пуше в main

**2. Отметка в этом файле (делаешь сам, молча):**
- В заголовке сессии дописать `✅` и дату. Формат: `### Сессия N — Название (этап X, пункт Y) ✅ 2026-05-12`
- Если были отклонения от ТЗ — дописать строку `**Отклонения:** ...` после «Критерии готовности»
- Закоммитить изменение файла CLAUDE.md отдельным коммитом

**3. Отчёт Владу (пишешь в чат):**
После всего выше — написать Владу сообщение ровно в таком формате:

```
## Сессия N готова ✅

### Что сделано
- [2–5 строк: ключевые изменения]

### Ручные шаги (если есть)
- [Пошагово, для пятилетнего ребёнка. Если нет — написать «Нет»]

### Проверь работу (обязательно)
1. [Конкретное действие: «Открой https://potok-app.vercel.app/blog/team/dashboard»]
2. [Что должно произойти: «Увидишь три пояса: Сейчас, Сегодня, Фон»]
3. [Ещё одно действие + ожидаемый результат]
4. [...]

### Если что-то не так
- [Что делать, если страница не грузится / ошибка / не то поведение]
```

Блок «Проверь работу» — **обязательный**. Это конкретные шаги, которые Влад выполняет руками в браузере/терминале, чтобы убедиться что сессия работает. Каждый шаг = одно действие + что должен увидеть. Формулировки — максимально простые, как для человека без опыта программирования.

### Чего НЕ делать
- Не просить Влада накатывать миграции — делаешь сам через `npx supabase db push`
- Не менять нумерацию сессий — она зафиксирована (1–51)
- Не переписывать ТЗ других сессий при выполнении текущей

---

## 1. Контекст продукта

**Кто:** Влад Токарев, радиожурналист из Санкт-Петербурга.

**Что:** запускает в Instagram блог об истории и культуре России в стиле Парфёнова — точки поворота, запреты, ошибки, странности, городские феномены, Петербург. North Star — 30 000 подписчиков к концу года, ~8 недель до выхода первого видео.

**Где живёт код:** монорепозиторий `tokarevexplorer-svg/potok` (бэкенд + фронтенд). Сайт — `potok-app.vercel.app`, домен пока не куплен.

**Чем разрабатывается:** Влад без опыта программирования, использует Claude.ai как архитектурного партнёра и генератора промптов, Claude Code — как исполнителя в локальном репозитории.

**Цель этапа 2:** превратить инфраструктуру этапа 1 (раздел «Команда» = инструменты для запуска задач Владом вручную) в настоящую AI-редакцию с:
- агентами, имеющими имя, аватар, биографию, должностную;
- личной памятью у каждого, обучающейся на обратной связи;
- общими Mission/Goals на всю команду;
- handoff между агентами и режимом оркестрации шефа;
- инструментами (NotebookLM, Web Search, Apify);
- самозадачами по событиям и расписанию;
- Telegram как каналом отчётов и пингов.

В перспективе — три департамента: Аналитика, Предпродакшн, Продакшн. На старте — первая волна из 5 агентов.

---

## 2. Технологический стек

**Это критично — стек строго JavaScript/TypeScript, не Python.** Локальная ДК Лурье (предшественник команды) была на Python — её **не наследуем**, переписываем под стек Потока.

### Бэкенд
- **Node.js + Express**, расположен в `backend/src/`
- Хостинг: **Railway**
- LLM SDK: `@anthropic-ai/sdk`, `@google/generative-ai`, `openai`
- Зависимости установлены: `pdf-parse`, `node-cron` (для будущих фоновых задач этапа 2)
- Очередь задач: `backend/src/queue/teamWorkerPool.js` (расширение паттерна `workerPool.js` Потока)
- Логирование: гибрид — важные события (вызовы LLM, ошибки) в `team_api_calls`; технические в `console.log` → Railway Logs

### Фронтенд
- **Next.js (App Router) + React + TypeScript**, расположен в `frontend/src/`
- Хостинг: **Vercel**
- Прямой доступ к Supabase из браузера через `getSupabaseBrowserClient()` (anon-ключ) — для чтения. Запись и тяжёлые операции — через бэкенд.
- Дизайн-система: существующая в Потоке + цветовая палитра «Большая волна в Канагаве» (Хокусай) — внедряется в этапе 6 (пункт 22).
- Голосовые: существующая Whisper-инфраструктура Потока (этап 1).

### База данных
- **Supabase (PostgreSQL)** — единый проект Потока, без отдельных проектов под этапы.
- **Supabase Storage** — buckets `team-database`, `team-prompts`, `team-config` (этап 1) + новые подпапки и buckets по ходу этапа 2.
- Миграции: `supabase/migrations/`, нумерация продолжается с `0008_team_tables.sql` (этап 1) — следующая будет `0009_*.sql`.
- RLS: открытая на team_* таблицах (приватность через Google OAuth на уровне приложения, см. этап 0).

### Архитектурные паттерны (соблюдаются на этапе 2)
- **Append-only `team_tasks`**: на каждое изменение статуса/контента — новая строка с тем же `id`. Текущее состояние = `DISTINCT ON (id) ORDER BY id, created_at DESC`. Снимает race conditions, даёт восстановимую историю.
- **Реестр `TASK_HANDLERS`** в `taskRunner.js`: добавление нового типа задачи = одна строка в реестр + новый handler. Этап 2 расширяет реестр под новые шаблоны задач для агентов.
- **`service-per-entity`**: каждая сущность — свой сервис в `backend/src/services/team/`. Этап 2 добавляет: `agentService`, `feedbackParserService`, `triggerService`, `proposalService`, `taskContinuationService`, `clarificationService`, `mergeService`, `notificationsService`, `telegramService`, `customDatabaseService`, `batchPollService`.
- **Сообщения об ошибках на русском** — в стиле существующего кода Потока.
- **Anthropic prompt caching** через `cache_control: ephemeral` для стабильных слоёв промпта (Mission, Role, Goals, Skills, Memory).
- **Recovery после рестарта**: при старте бэкенда задачи в статусах `running`, `awaiting_resource`, `clarifying`, `awaiting_input` корректно подхватываются.

---

## 3. Что уже работает (этап 1 завершён)

В разделе «Блог → Команда» суперапа Поток четыре подраздела, скопированные из локальной ДК Лурье (Python) и переписанные на JS:

### Таблицы Supabase
- `team_tasks` (append-only, 5 типов задач: `ideas_free`, `ideas_questions_for_research`, `research_direct`, `write_text`, `edit_text_fragments`)
- `team_api_calls` (журнал вызовов LLM, биллинг)
- `team_api_keys` (Anthropic, OpenAI, Google)
- `team_settings` (порог алерта расходов, USD→RUB курс и т.п.)

### Buckets Storage
- `team-database` — артефакты задач, context.md, concept.md
- `team-prompts` — шаблоны задач (markdown с секциями `## System` / `## User`, плейсхолдерами `{{...}}`)
- `team-config` — pricing.json, presets.json

### Сервисы бэкенда (`backend/src/services/team/`)
- `llmClient.js` — унифицированный клиент трёх провайдеров с возвратом `{text, inputTokens, outputTokens, cachedTokens}` и поддержкой Anthropic prompt caching
- `promptBuilder.js` — сборка промптов из шаблонов с авто-загрузкой context/concept
- `costTracker.js` — расчёт стоимости, запись в `team_api_calls`, чтение `alert_threshold_usd`
- `taskRunner.js` — оркестратор: `createTask`, `runTaskInBackground`, `archiveTask`, `markTaskDone`, `applyFragmentEditsInline`, `appendQuestionToResearch`, `previewPrompt`, `taskTemplateName`
- `taskHandlers.js` — 5 handlers, реестр `TASK_HANDLERS`
- `teamSupabase.js`, `teamStorage.js`, `keysService.js`, `contentFetcher.js`

### Очередь и API-маршруты бэкенда
- `backend/src/queue/teamWorkerPool.js` — изолированная очередь (env `TEAM_WORKER_CONCURRENCY`, дефолт 1)
- `routes/team/tasks.js`, `artifacts.js`, `prompts.js`, `admin.js`, `files.js`, `voice.js`

### Страницы фронтенда
- `/blog/team/page.tsx` (главная команды)
- `/blog/team/tools/page.tsx` — постановка задач + лог
- `/blog/team/database/page.tsx` — артефакты, context, concept
- `/blog/team/prompts/page.tsx` — шаблоны задач
- `/blog/team/admin/page.tsx` — ключи, расходы, алерт

### Что в этапе 1 НЕ делалось (всё — задача этапа 2)
- Никаких слоёв Mission/Role/Goals/Memory
- Никакой идентичности агентов (имена, аватары, биографии)
- Никакого NotebookLM, Apify, Web Search в Hands агентов
- Никаких самозадач, расписаний, фоновых триггеров
- Никакого Telegram, парсера обратной связи
- Никакого self-review, skills, Curator

---

## 4. Архитектурные принципы этапа 2

Из `README-digital-team.md` (раздел «Архитектурные принципы») и обсуждений:

1. **Каскад специализированных агентов лучше одного «всезнающего».** Несколько маленьких с чёткими ролями. Между ними — состояние в БД и явная передача задач.
2. **Структурированный отчёт лучше свободной формы.** Принудительная структура форсит модель не пропускать пункты.
3. **Массовая дешёвая обработка + глубокий разбор избранного.** Везде дихотомия: дёшево много vs дорого штучно.
4. **Память прозрачная и редактируемая.** Никаких embedding-чёрных-ящиков для оперативной памяти. Влад в любой момент может зайти в карточку агента и поправить любую запись.
5. **Mission/Goals — живой документ, не плакат.** Стратегия течёт через Влада, статистика подтянется автоматически (когда подключится внутренний аналитик во вторую волну).
6. **Антропоморфизация — психологический мост.** Агенты с именами, аватарами, биографиями. Это не баловство, а способ взаимодействовать с AI как с командой.
7. **Ручное вмешательство между этапами.** Влад одобряет план перед раздачей, видит весь аудит-трейл. Слепоты в цепочке нет.
8. **Стиль Потока.** Service-per-entity, типизированные функции, сообщения на русском, прямой доступ к Supabase из браузера для чтения, бэкенд только для тяжёлых операций.
9. **Не нейрослоп.** Авторский голос остаётся за Владом, AI работает с фактурой. Финальные тексты пишутся в Claude.ai через Custom Style.

Полный список и пояснения — в `README-digital-team.md` и в разделе «Этика и принципы».

---

## 5. Roadmap этапа 2 — 7 этапов

Содержательная архитектура — в `Разработка_команды_v17.md` (22 пункта). Здесь — порядок выполнения по этапам, удобный для разработки.

### Этап 0. Защита (1 сессия)
*Сайт уже на Vercel — без OAuth туда может зайти кто угодно. Делаем сразу, пока команды ещё нет.*

- **Пункт 21** — Безопасность и контроль. Google OAuth с whitelist на email Влада, жёсткий дневной лимит $5, жёсткий лимит $1 на задачу.

### Этап 1. Каркас — что и где живёт
*Меню сайта, разделы «Инструкции» и «Базы», слои промпта, Mission/Goals, Memory. Без этого негде размещать ни одного агента.*

- **Пункт 2** — Меню сайта и иерархия.
- **Пункт 6** — Раздел «Инструкции».
- **Пункт 13** — Раздел «Базы» / связь с Supabase.
- **Пункт 4** — Слои промпта.
- **Пункт 5** — Цели и задачи блога (Mission.md, Goals.md).
- **Пункт 3** — Память агентов (эпизоды + правила в БД).

### Этап 2. Агент как сущность
*Кто такой агент, как создаётся через UI, как агенты передают друг другу работу, как учится по обратной связи.*

- **Пункт 7** — Онтология агента (семь органов).
- **Пункт 12** — Админка добавления агентов (мастер из трёх шагов, голосовой черновик Role).
- **Пункт 8** — Связи и оркестрация (handoff).
- **Пункт 9** — Самообучение и парсер обратной связи (Curator, опц. Профиль автора).

### Этап 3. Операционная панель
*Где ставятся задачи, как агенты ходят в инструменты, какие у агентов уровни автономности.*

- **Пункт 14** — Дашборд / постановка задач (стратегический пояс, Inbox, лог).
- **Пункт 16** — Инструменты для агентов (NotebookLM, методички, Awareness инструментов).
- **Пункт 15** — Фоновые задачи и автономность (самозадачи, уровни 0/1, тумблер «Проактивность»).

### Этап 4. Качество выходов
*Skills как рецепты успеха, self-review как жёсткий чек-лист. Делается после того, как агенты заработали — нужна накопленная статистика.*

- **Пункт 10** — Навыки (skills).
- **Пункт 11** — Самопроверка (self-review).

### Этап 5. Раскатка команды
*Конкретные агенты первой волны со своими ролями, базами и инструментами.*

- **Пункт 17** — Инфраструктура для аналитиков (разведчик, база конкурентов через Apify, Web Search, многошаговые задачи).
- **Пункт 18** — Инфраструктура для предпродакшна (исследователь, сценарист, фактчекер, шеф-редактор; финал текстов → Claude.ai).

### Этап 6. Упаковка и каналы
*Telegram-боты для отчётов и пингов, кастомные базы из мастера, batch-режим, цветовая палитра, полноэкранный режим задач.*

- **Пункт 20** — Telegram и многоканальность.
- **Пункт 22** — UI/UX и упаковочные доработки.

### Этап 7. Бэклог — админка и заглушка постпродакшна
*Админка обросла ревизиями из других пунктов — здесь дозакрываем то, что накопилось. Постпродакшн — только UI-плейсхолдер «coming soon».*

- **Пункт 1** — Админка (управление ключами, провайдерами, Системная LLM, биллинг, мониторинг NotebookLM).

---

## 6. Сессии

*51 сессия, нумерация сквозная. При выполнении — добавить ✅ и дату в заголовок. После каждой сессии: git commit + push + `npx supabase db push` (если есть миграция).*

### Сессия 1 — Google OAuth и whitelist (этап 0, пункт 21) ✅ 2026-05-11

**Цель:** Закрыть `potok-app.vercel.app` от посторонних — Google OAuth с проверкой email на whitelist; неавторизованный посетитель видит экран «Доступ закрыт».

**Что делать до сессии:**

1. Создать **Google OAuth Client** в Google Cloud Console:
   - Перейти в `console.cloud.google.com` → APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client ID.
   - Application type: **Web application**.
   - Authorized JavaScript origins: `https://potok-app.vercel.app`, `http://localhost:3000`.
   - Authorized redirect URIs: `https://potok-app.vercel.app/api/auth/callback/google`, `http://localhost:3000/api/auth/callback/google`.
   - Сохранить `GOOGLE_CLIENT_ID` и `GOOGLE_CLIENT_SECRET`.
2. Сгенерировать `NEXTAUTH_SECRET`: в терминале `openssl rand -base64 32`, скопировать вывод.
3. Добавить ENV-переменные в **Vercel Dashboard** (Settings → Environment Variables, для production + preview + development):
   - `NEXTAUTH_URL` = `https://potok-app.vercel.app`
   - `NEXTAUTH_SECRET` = (значение из шага 2)
   - `GOOGLE_CLIENT_ID` = (значение из шага 1)
   - `GOOGLE_CLIENT_SECRET` = (значение из шага 1)
   - `WHITELISTED_EMAIL` = (Google-аккаунт Влада, в нижнем регистре)
4. Добавить **те же переменные на Railway** (для бэкенда — нужен только `NEXTAUTH_SECRET` и `WHITELISTED_EMAIL`, чтобы валидировать JWT и читать fallback whitelist):
   - `NEXTAUTH_SECRET` = (то же значение, что и на Vercel)
   - `WHITELISTED_EMAIL` = (тот же email)
5. Локально создать `.env.local` в `frontend/` (если его нет) — те же 5 переменных, но `NEXTAUTH_URL=http://localhost:3000`. И в `backend/.env` — `NEXTAUTH_SECRET` + `WHITELISTED_EMAIL`.

**ТЗ для Claude Code:**

1. Установить `next-auth@beta` (Auth.js v5) в `frontend/package.json`.
2. Создать миграцию `supabase/migrations/0009_team_security.sql`:
   - `ALTER TABLE team_settings ADD COLUMN IF NOT EXISTS whitelisted_email TEXT NULL;`
   - Комментарий в SQL: «email override для whitelist OAuth, fallback на ENV WHITELISTED_EMAIL».
3. Создать конфиг **`frontend/src/auth.ts`** (Auth.js v5 паттерн):
   - Импортировать `NextAuth`, `Google` provider.
   - В `providers`: `Google({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET })`.
   - В `callbacks.signIn({ user })`: вызвать `isWhitelisted(user.email)` (см. п.4); если false — return `false` (NextAuth перенаправит на error page).
   - В `callbacks.jwt({ token, user })`: при первом логине положить `token.email = user.email`.
   - В `callbacks.session({ session, token })`: положить `session.user.email = token.email`.
   - `session: { strategy: "jwt" }`.
   - `pages: { signIn: "/auth/signin", error: "/auth/error" }`.
   - `secret: env.NEXTAUTH_SECRET`.
   - Экспортировать `{ handlers, auth, signIn, signOut }`.
4. Создать **`frontend/src/lib/whitelist.ts`** (server-only):
   - Функция `getWhitelistedEmail(): Promise<string | null>`: делает `select whitelisted_email from team_settings limit 1` через server-side Supabase client (`SUPABASE_SERVICE_ROLE_KEY` или anon — что уже используется в Потоке для server-side). Если получили непустую строку — возвращаем её, приведённую к lower-case. Иначе — `process.env.WHITELISTED_EMAIL?.toLowerCase() ?? null`.
   - Функция `isWhitelisted(email: string | null | undefined): Promise<boolean>`: если `email` пустой — `false`; иначе сравнить с `getWhitelistedEmail()` case-insensitive.
5. Создать **`frontend/src/app/api/auth/[...nextauth]/route.ts`** — экспортировать `GET` и `POST` из `handlers` в `auth.ts`.
6. Создать **`frontend/src/app/auth/signin/page.tsx`**:
   - Заголовок: «Поток».
   - Подзаголовок: «Доступ только для авторизованного пользователя».
   - Кнопка «Войти через Google» — `client component`, при клике вызывает `signIn("google", { callbackUrl: "/" })` из `next-auth/react`.
   - Стиль — взять у существующих страниц Потока, без нового дизайна.
7. Создать **`frontend/src/app/auth/error/page.tsx`**:
   - Заголовок «Доступ закрыт».
   - Текст «Этот Google-аккаунт не имеет доступа к Потоку.»
   - Кнопка «Выйти» — вызывает `signOut({ callbackUrl: "/auth/signin" })`.
8. Создать **`frontend/src/middleware.ts`**:
   - Импортировать `auth` из `auth.ts`.
   - Экспортировать default `auth(...)` middleware.
   - В `config.matcher`: все маршруты, кроме `/auth/*`, `/api/auth/*`, `/_next/*`, статики, `/favicon.ico`. Используем стандартный matcher из доков NextAuth.js v5.
   - Внутри callback: если `req.auth?.user?.email` нет — redirect на `/auth/signin`. Дополнительно проверять whitelist через `isWhitelisted` НЕ нужно: это уже отсеяно в `signIn` callback.
9. Установить `jsonwebtoken` в `backend/package.json`.
10. Создать **`backend/src/middleware/requireAuth.js`**:
    - Express middleware. Читает `Authorization: Bearer <token>` из заголовка.
    - Если нет — 401 с `{ error: "Не авторизован" }`.
    - Декодирует JWT через `jsonwebtoken.verify(token, process.env.NEXTAUTH_SECRET)`. Auth.js v5 по умолчанию использует JWE (encrypted JWT) — если стандартный `verify` не подходит, использовать `jose` (npm-пакет `jose`) и `jwtDecrypt` с production-ключом из `NEXTAUTH_SECRET` (см. документацию Auth.js v5 «Decoding tokens on a different server»). Конкретный пакет — на твой выбор.
    - Извлекает `email` из payload.
    - Сверяет с `getWhitelistedEmail()` (Node.js версия — см. п.11).
    - Если совпадает — `req.user = { email }`, `next()`. Иначе — 403 с `{ error: "Доступ закрыт" }`.
    - Все сообщения об ошибках — на русском.
11. Создать **`backend/src/services/team/whitelistService.js`**:
    - Аналог `frontend/src/lib/whitelist.ts`, но для Node.js. Использует существующий `teamSupabase.js` для чтения `team_settings.whitelisted_email`. Fallback — `process.env.WHITELISTED_EMAIL`.
12. Зарегистрировать `requireAuth` middleware на все существующие команды-маршруты в `backend/src/`:
    - `routes/team/tasks.js`, `routes/team/artifacts.js`, `routes/team/prompts.js`, `routes/team/admin.js`, `routes/team/files.js`, `routes/team/voice.js`.
    - На уровне `router.use(requireAuth)` в начале каждого файла, ПОСЛЕ парсинга body.
13. Создать **`frontend/src/lib/apiClient.ts`**:
    - Функция `fetchBackend(path: string, options?: RequestInit): Promise<Response>`.
    - Делает `getSession()` из `next-auth/react` (на клиенте) или `auth()` (на сервере) — определи паттерн в зависимости от вызывающей стороны (можно сделать отдельные `fetchBackendClient` и `fetchBackendServer`).
    - Достаёт raw session token (Auth.js v5 даёт `session.user`, для backend нужен JWT — вызвать `getToken()` из `next-auth/jwt` или эквивалент; конкретика — по документации v5).
    - Подкладывает `Authorization: Bearer <token>` к запросу. URL — `${process.env.NEXT_PUBLIC_BACKEND_URL}${path}`.
14. Пройтись по всем местам в `frontend/src/app/blog/team/**/*.tsx`, где идёт `fetch` к бэкенду, и заменить на `fetchBackend(...)`. Это страницы:
    - `tools/page.tsx`, `database/page.tsx`, `prompts/page.tsx`, `admin/page.tsx` и их подкомпоненты.
15. Прямой доступ к Supabase из браузера через `getSupabaseBrowserClient()` (anon-ключ) — оставить как есть. RLS не трогаем.
16. Обновить корневой `frontend/src/app/layout.tsx`: обернуть приложение в `<SessionProvider>` из `next-auth/react`, чтобы `useSession()` работал в клиентских компонентах.
17. Обновить README раздела команды (`backend/README.md` или `docs/team.md` — по факту существования) — список ENV-переменных, которые добавились.

**Что делать после сессии:**

1. Накатить миграцию `0009_team_security.sql` через Supabase Dashboard → SQL Editor.
2. Локально: `npm run dev` во фронте и бэке. Открыть `http://localhost:3000` → должен редиректить на `/auth/signin`. Войти через Google.
3. Если email = `WHITELISTED_EMAIL` — попасть на главную; если нет — увидеть «Доступ закрыт».
4. `git commit`, push в main → дождаться деплоя Vercel и Railway.
5. Открыть `https://potok-app.vercel.app` в инкогнито — убедиться, что без OAuth туда не попасть.
6. Зайти со второго Google-аккаунта (не Влада) — увидеть «Доступ закрыт».
7. В терминале: `curl https://<railway-url>/api/team/admin/health` (или любой существующий маршрут) без `Authorization` — должен вернуть 401.

**Критерии готовности:**

- При заходе на `https://potok-app.vercel.app` без сессии — редирект на `/auth/signin`.
- Login через whitelisted Google-аккаунт — попадаешь на главную команды.
- Login через не-whitelisted Google-аккаунт — страница «Доступ закрыт» с кнопкой «Выйти».
- `curl` к любому `/api/team/*` маршруту без Authorization → 401.
- `curl` с подделанным токеном → 401.
- В Supabase Dashboard в таблице `team_settings` появилась колонка `whitelisted_email` (NULL).

**Отклонения:**
- **URL продакшна:** `potok-omega.vercel.app`, не `potok-app.vercel.app` (Влад подтвердил, документ был с устаревшим хостом). Все Authorized origins/redirects Google OAuth и `NEXTAUTH_URL` — на `potok-omega.vercel.app`.
- **Номер миграции:** сквозная нумерация Потока продолжается с `0013_team_security.sql` (в проекте уже есть `0012_team_tables.sql`), а не `0009`.
- **Хранение whitelist email в `team_settings`:** ТЗ предлагает запрос `select whitelisted_email from team_settings limit 1`, но таблица — key-value (key TEXT PK, value JSONB). Чтобы поведение было детерминированным, столбец `whitelisted_email` живёт в одной целевой строке с `key='security'` (сервис делает `where key='security'`). UI Админки (Сессия 2) будет писать в эту же строку через upsert.
- **`signOut` на странице ошибки** вынесен в отдельный клиентский компонент `auth/error/SignOutButton.tsx`, потому что `signOut` нельзя дёргать прямо со server-component.
- **Скип AppShell на `/auth/*`** — `AppShell.tsx` пропускает sidebar+container для путей `/auth/*`, чтобы страницы signin/error занимали весь экран и не показывали навигацию неавторизованному пользователю.
- **Передача auth до бэкенда:** в `apiClient.ts` решили **не** дублировать NextAuth JWE (Auth.js v5 шифрует токен HKDF-производным ключом — backend на jsonwebtoken его не расшифрует). Вместо этого Vercel-сторона подписывает свежий HS256-JWT с email из сессии, тем же `NEXTAUTH_SECRET`. Backend проверяет через `jsonwebtoken.verify(..., {algorithms: ["HS256"], maxAge: 5m})`.
- **`requireAuth` подключён через `router.use(requireAuth)` внутри каждого из шести team-роутов**, как просит ТЗ. Уже существующий middleware-стек (`express.json`) добавлен на уровне `app.js` и срабатывает раньше — body парсится корректно.
- **`/api/team-proxy/*` прокси теперь сам подписывает токен** через `signBackendToken(email)` из `auth()` сессии, до форвардинга на Railway. Без сессии возвращает 401 сам, не дёргая бэкенд.

---

### Сессия 2 — Жёсткие лимиты расходов и блок Безопасности в Админке (этап 0, пункт 21) ✅ 2026-05-11

**Цель:** Защитить систему от случайных дорогих сценариев — добавить дневной лимит ($5 дефолт) и лимит на задачу ($1 дефолт) с жёсткой блокировкой; UI редактирования whitelist email и обоих лимитов в Админке.

**Что делать до сессии:**

- Ничего. Все изменения — в коде и одной миграции.

**ТЗ для Claude Code:**

1. Создать миграцию `supabase/migrations/0010_team_hard_limits.sql`:
   - `ALTER TABLE team_settings ADD COLUMN IF NOT EXISTS hard_daily_limit_usd NUMERIC(10,2) DEFAULT 5.00;`
   - `ALTER TABLE team_settings ADD COLUMN IF NOT EXISTS hard_task_limit_usd NUMERIC(10,2) DEFAULT 1.00;`
   - `ALTER TABLE team_settings ADD COLUMN IF NOT EXISTS hard_daily_limit_enabled BOOLEAN DEFAULT TRUE;`
   - `ALTER TABLE team_settings ADD COLUMN IF NOT EXISTS hard_task_limit_enabled BOOLEAN DEFAULT TRUE;`
   - Комментарии — на русском, объясняющие назначение полей.
2. Расширить **`backend/src/services/team/costTracker.js`**:
   - `async getDailySpentUsd(): Promise<number>` — сумма `cost_usd` из `team_api_calls` за сегодняшние сутки UTC (`created_at >= date_trunc('day', now() at time zone 'UTC')`).
   - `async getTaskSpentUsd(taskId: string): Promise<number>` — сумма `cost_usd` из `team_api_calls` где `task_id = taskId`.
   - `async checkDailyLimit(): Promise<{ allowed: boolean, spent_usd: number, limit_usd: number | null, enabled: boolean }>`:
     - Прочитать `hard_daily_limit_usd`, `hard_daily_limit_enabled` из `team_settings`.
     - Если `enabled = false` — `{ allowed: true, spent_usd: getDailySpentUsd(), limit_usd, enabled: false }`.
     - Если `getDailySpentUsd() >= hard_daily_limit_usd` — `{ allowed: false, ... }`.
     - Иначе — `{ allowed: true, ... }`.
   - `async checkTaskLimit(taskId: string): Promise<{ allowed, spent_usd, limit_usd, enabled }>` — аналогично, но против `getTaskSpentUsd(taskId)` и `hard_task_limit_usd`.
3. Интеграция в **`backend/src/services/team/taskRunner.js`**:
   - В `createTask` (или в `runTaskInBackground` непосредственно перед началом работы) — вызвать `checkDailyLimit()`. Если `allowed: false` — записать в `team_tasks` новую строку с тем же `id`, статусом `error` и `error_message`: `Достигнут дневной лимит расходов: $${spent.toFixed(2)} из $${limit.toFixed(2)}. Поднимите лимит в Админке или попробуйте завтра.` Не запускать handler.
   - В `runStep` (или эквивалент в обработчике многошаговой задачи в `taskHandlers.js` / `taskRunner.js` — там, где после каждого LLM-вызова идёт запись в `team_api_calls`): после успешной записи стоимости вызвать `checkTaskLimit(taskId)`. Если `allowed: false` — записать новую append-only строку со статусом `error` и `error_message`: `Превышен лимит стоимости задачи: фактически потрачено $${spent.toFixed(2)} из лимита $${limit.toFixed(2)}.` Промежуточные артефакты в Storage и `step_state` в `team_tasks` — НЕ удалять (мягкое прерывание, чтобы Влад мог продолжить руками или анализировать промежуточный результат).
   - В обработчике API для постановки задачи (`routes/team/tasks.js`, POST) — если `checkDailyLimit()` отказал, вернуть `409 Conflict` с json `{ error: "...", spent_usd, limit_usd }`, чтобы фронт показал понятный alert.
4. Расширить **`backend/src/routes/team/admin.js`**:
   - `GET /api/team/admin/limits` → `{ daily: { limit_usd, enabled }, task: { limit_usd, enabled }, daily_spent_usd }`. Все поля читаются из `team_settings` + `getDailySpentUsd()`.
   - `PATCH /api/team/admin/limits` → принимает любые из полей `{ daily_limit_usd?, daily_enabled?, task_limit_usd?, task_enabled? }`. Валидация: numeric > 0 (при наличии), enabled — boolean. Сохраняет в `team_settings`.
   - `GET /api/team/admin/security` → `{ db_email: string | null, env_email: string | null, effective_email: string }`. `effective_email` — то, что вернёт `whitelistService.getWhitelistedEmail()`.
   - `PATCH /api/team/admin/security` → принимает `{ whitelisted_email: string | null }`. Валидация: либо null (откатиться к ENV-fallback), либо валидный email. **Защита от самоблокировки:** если новый email НЕ null и не равен `req.user.email` (положенному `requireAuth` middleware) — вернуть 400 с сообщением `Чтобы избежать самоблокировки, можно установить только email текущей сессии. Войдите под нужным аккаунтом и потом изменяйте.`
5. Расширить **`frontend/src/app/blog/team/admin/page.tsx`**:
   - **Новый блок «Безопасность доступа»** (отдельная секция, до или после блока ключей):
     - Заголовок «Безопасность доступа».
     - Строка «Текущий разрешённый email: `<effective_email>`».
     - Если `db_email !== null` — пометка «(переопределено в БД)»; иначе — «(из переменной окружения)».
     - Кнопка «Изменить» → раскрывает инлайн поле email + кнопки «Сохранить» / «Сбросить (вернуться к ENV)». При «Сохранить» — PATCH `/api/team/admin/security` с введённым значением. При «Сбросить» — PATCH с `whitelisted_email: null`. При ошибке 400 «самоблокировка» — показать alert с текстом из бэкенда.
   - **Новый блок «Жёсткие лимиты»** рядом с существующим блоком «Бюджет / алерт» (или сразу после него):
     - Заголовок «Жёсткие лимиты расходов».
     - Под ним — карточка «Дневной лимит»: numeric input в долларах, переключатель «Включён». Под полем — текст «Сегодня потрачено: $${daily_spent.toFixed(2)} из $${daily_limit.toFixed(2)}» и тонкий прогресс-бар (CSS, без библиотек).
     - Карточка «Лимит на задачу»: numeric input + переключатель «Включён».
     - Кнопка «Сохранить» — PATCH `/api/team/admin/limits` со всеми изменёнными полями.
     - Подсказка снизу мелким текстом: «При превышении дневного лимита новые задачи блокируются до конца суток. При превышении лимита задачи — задача переходит в ошибку, остальные продолжают.»
6. Расширить **`frontend/src/app/blog/team/tools/page.tsx`** (форма постановки задачи):
   - При вызове `fetchBackend("/api/team/tasks", { method: "POST", ... })` — если ответ 409 и в json есть `spent_usd` / `limit_usd`, показать alert/toast с текстом ошибки и подсказкой «Откройте Админку → Жёсткие лимиты, чтобы поднять лимит». Не блокировать форму.
7. Не удалять и не менять существующий «мягкий» месячный алерт в шапке (`alert_threshold_usd` из этапа 1) — он остаётся параллельно жёстким лимитам.

**Что делать после сессии:**

1. Накатить миграцию `0010_team_hard_limits.sql` через Supabase Dashboard → SQL Editor.
2. Открыть `/blog/team/admin` — увидеть оба новых блока. Проверить, что значения по умолчанию: $5 / $1, оба включены.
3. Поставить тестовую задачу — после её выполнения увидеть, что счётчик «Сегодня потрачено» вырос.
4. Тестовый сценарий «дневной лимит»: установить `hard_daily_limit_usd = 0.001`, нажать «Сохранить», попробовать запустить задачу через `/blog/team/tools` — увидеть alert «Достигнут дневной лимит». Вернуть $5.
5. Тестовый сценарий «самоблокировка»: попробовать в блоке «Безопасность доступа» ввести чужой email — увидеть отказ.
6. Закоммитить, задеплоить.

**Критерии готовности:**

- Колонки `hard_daily_limit_usd`, `hard_task_limit_usd`, `hard_daily_limit_enabled`, `hard_task_limit_enabled` есть в `team_settings` со значениями по умолчанию.
- В Админке виден блок «Безопасность доступа» с текущим email, источником (БД/ENV) и кнопкой «Изменить».
- В Админке виден блок «Жёсткие лимиты» с двумя полями + переключателями + индикатором дневного расхода.
- При установке дневного лимита ниже текущих расходов — постановка задачи возвращает 409 и показывает alert.
- Попытка установить email отличный от текущей сессии — отклоняется с сообщением о самоблокировке.
- При выключении переключателя «Включён» соответствующий лимит игнорируется.
- Многошаговая задача при превышении лимита задачи прерывается мягко — `step_state` остаётся в `team_tasks`, артефакты в Storage не удалены.
- Существующий месячный мягкий алерт (`alert_threshold_usd`) продолжает работать параллельно.

**Отклонения:**
- Миграция называется `0014_team_hard_limits.sql` (сквозная нумерация проекта), а не `0010_*.sql` как в ТЗ — по аналогии с сессией 1 (миграция `0013_team_security.sql` вместо `0009_*.sql`), чтобы не пересекаться с существующими миграциями Потока (`0010_thumbnail_drive_id.sql`, `0011_thumbnail_storage_path.sql`).
- `team_settings` — изначально key-value таблица (key TEXT PK, value JSONB). Чтобы сохранить совместимость с существующими настройками (`alert_threshold_usd`, `whitelisted_email` из сессии 1), все четыре колонки лимитов хранятся в единственной строке с `key='limits'` (аналогично `key='security'` для whitelist). Чтение и запись инкапсулированы в новом `backend/src/services/team/limitsService.js`.
- POST-эндпоинт постановки задачи в текущей кодовой базе — `/api/team/tasks/run`, не «голый» `/api/team/tasks` как в ТЗ. Проверка `checkDailyLimit()` добавлена именно в этот маршрут.
- Многошаговых задач в этапе 1 нет (поля `step_state` ещё не существует), поэтому проверка `checkTaskLimit(taskId)` после `recordCall` срабатывает в `runTaskInBackground` для однофазных handler'ов и для inline-операций `applyFragmentEditsInline` / `appendQuestionToResearch`, где биллинг идёт к parent task (правки фрагментов и доп. вопрос к research_direct).
- В `applyFragmentEditsInline` и `appendQuestionToResearch` проверка лимита делается ДО LLM-вызова (а не «после успешной записи стоимости», как в ТЗ для многошаговых задач), чтобы не платить за заведомо неудачный вызов, когда родительская задача уже превысила лимит. Для основного потока `runTaskInBackground` проверка осталась после `recordCall`, как и просит ТЗ.

---

### Сессия 3 — Меню сайта и иерархия (этап 1, пункт 2) ✅ 2026-05-11

**Цель:** Перестроить левый sidebar — добавить кнопку пина, развести разделы согласно целевой иерархии (Блог → Базы / Команда), переименовать существующие подразделы Команды (Дашборд / Сотрудники / Инструкции / Артефакты / Админка / Постпродакшн), создать заглушки для новых страниц, проставить 301-редиректы со старых URL.

**Что делать до сессии:**

- Ничего. Все изменения — UI и роутинг, миграций нет.

**ТЗ для Claude Code:**

1. **Найди текущий sidebar** в `frontend/src/`. Это может быть `Sidebar.tsx`, `Navigation.tsx`, `LeftMenu.tsx` или часть `app/layout.tsx`. Определи источник пунктов меню (статичный массив? отдельный файл конфигурации?). Сохрани имя файла для последующих изменений.

2. **Реализуй кнопку пина** в шапке sidebar:
   - Иконка из `lucide-react`: `Pin` (когда не закреплено) / `PinOff` (когда закреплено), либо иной осмысленный набор.
   - Состояние хранится в **localStorage** под ключом `potok:sidebar-pinned` (boolean string `"true"` / `"false"`).
   - При `pinned = true` — sidebar постоянно раскрыт независимо от hover.
   - При `pinned = false` (дефолт) — текущий auto-hide режим (раскрытие при наведении).
   - Состояние читается на mount через `useEffect`, изменения по клику сразу пишутся в localStorage.
   - Без серверной синхронизации, без записи в БД — это UI-предпочтение клиента.

3. **Перестрой структуру меню «Команда»** в шесть пунктов в указанном порядке:
   - `/blog/team/dashboard` — **Дашборд** (бывший `/blog/team/tools`).
   - `/blog/team/staff` — **Сотрудники** (новый, заглушка).
   - `/blog/team/instructions` — **Инструкции** (бывший `/blog/team/prompts`).
   - `/blog/team/artifacts` — **Артефакты** (бывший `/blog/team/database`).
   - `/blog/team/admin` — **Админка** (без изменений).
   - `/blog/team/postproduction` — **Постпродакшн** (новый, disabled-стиль).
   - Главная страница раздела `/blog/team` — оставь как есть, либо сделай редирект на `/blog/team/dashboard` (на твоё усмотрение, главное чтобы не было 404).

4. **Перенеси существующие страницы по новым путям:**
   - Перемести каталог `frontend/src/app/blog/team/tools/` → `frontend/src/app/blog/team/dashboard/`. Содержимое страниц не трогай.
   - Перемести `frontend/src/app/blog/team/database/` → `frontend/src/app/blog/team/artifacts/`. Содержимое не трогай.
   - Перемести `frontend/src/app/blog/team/prompts/` → `frontend/src/app/blog/team/instructions/`. Содержимое не трогай.
   - После переезда — `grep -r "/blog/team/tools\|/blog/team/database\|/blog/team/prompts" frontend/src/` и замени все внутренние ссылки на новые пути.

5. **Сделай 301-редиректы со старых путей** в `frontend/next.config.js` (или эквивалент — `.mjs` / `.ts`), секция `redirects()`:
   ```js
   { source: '/blog/team/tools',     destination: '/blog/team/dashboard',    permanent: true },
   { source: '/blog/team/database',  destination: '/blog/team/artifacts',    permanent: true },
   { source: '/blog/team/prompts',   destination: '/blog/team/instructions', permanent: true },
   ```
   Это страхует существующие закладки и внешние ссылки от поломки.

6. **Создай заглушку «Сотрудники»** в `frontend/src/app/blog/team/staff/page.tsx`:
   - Заголовок: «Сотрудники».
   - Параграф: «Раздел появится на этапе 2. Здесь будут карточки агентов команды — кнопка добавления нового сотрудника, список действующих, переход в персональную карточку. Пока инфраструктура агентов в разработке.»
   - Вёрстка — как у других страниц команды (отступы, шрифты, фон).

7. **Создай заглушку «Постпродакшн»** в `frontend/src/app/blog/team/postproduction/page.tsx`:
   - Заголовок «Постпродакшн».
   - Подзаголовок «Появится позже».
   - Параграф: «Постпродакшн раскатывается во второй волне команды, когда наберётся первый опыт работы с предпродакшном и появятся реальные материалы для съёмок.»
   - В sidebar пункт «Постпродакшн» рендерится с `opacity: 0.5` (или эквивалентным приглушённым стилем, без отдельного цвета — палитра придёт позже в этапе 6). Active-стиль (подсветка при попадании на страницу) — отключи; пункт визуально читается как «не сейчас».
   - Сама страница тоже приглушённая — например, общий контейнер с `opacity: 0.7`, чтобы передать состояние «ещё не запущено».

8. **Вынеси «Базы» на уровень Блога:**
   - В существующем sidebar найди, как устроен раздел «Блог» и куда сейчас прикручена база референсов Потока. Сохрани её существующий маршрут (например, `/blog/references` или подобный) — НЕ переноси и НЕ переименовывай.
   - Добавь в sidebar новый пункт **«Базы»** на уровне «Команда» (то есть на той же иерархической высоте). Если структура поддерживает кликабельный заголовок без подменю — этого достаточно. Подменю (Референсы / Конкуренты / кастомные) делается в сессии под пункт 13, не здесь.
   - Создай **`frontend/src/app/blog/databases/page.tsx`** — индекс-страница раздела «Базы»:
     - Заголовок «Базы».
     - Подзаголовок-параграф: «Структурированное переиспользуемое знание команды. Источник для агентов.»
     - Три карточки/строки в списке (без слова «база» в названиях, согласно принципу пункта 2):
       - **Референсы** — кликабельная, ведёт по существующему маршруту базы референсов Потока (тот, что нашёл в шаге выше). Подпись: «Видеореференсы для блога».
       - **Конкуренты** — disabled-стиль, без ссылки. Подпись: «Появится в этапе 5 — таблицы транскрипций по каналам конкурентов».
       - **Кастомные** — disabled-стиль, без ссылки. Подпись: «Появятся в этапе 5 — базы, которые рождаются из артефактов задач».

9. **Обновление главной страницы раздела «Команда»** (`frontend/src/app/blog/team/page.tsx`, если она содержательная):
   - Если на ней есть ссылки на старые `/tools`, `/database`, `/prompts` — обнови до новых.
   - Если она была лендингом «Команда» с описанием/CTA — оставь как есть, только проверь, чтобы ссылки были живые.

10. **Никаких миграций Supabase.** Никаких backend-изменений. Все правки — фронт + конфиг Next.js.

11. **Перепроверь типы.** Если sidebar был типизированным (например, `MenuItem[]`), добавь поле `disabled?: boolean` для «Постпродакшн» и используй его при рендере.

**Что делать после сессии:**

1. Локально: `npm run dev` в `frontend/`. Открыть `http://localhost:3000`:
   - Кнопкой пина закрепить sidebar — перезагрузить страницу — sidebar остаётся закреплён. Снять пин — снова auto-hide.
   - Пройти по всем 6 пунктам Команды — все открываются, нет 404.
   - «Постпродакшн» визуально приглушён, страница открывается с заглушкой.
   - В адресной строке вручную ввести `/blog/team/tools` — должно редиректнуть на `/blog/team/dashboard`. Аналогично для `/database` и `/prompts`.
   - Открыть «Базы» на уровне Блога — увидеть три карточки, кликнуть «Референсы» — попасть на существующую страницу референсов.
2. Закоммитить, push в main, дождаться деплоя Vercel.
3. На production проверить ровно те же сценарии.

**Критерии готовности:**

- В sidebar присутствует кнопка пина; состояние пина переживает перезагрузку страницы (localStorage).
- Структура раздела «Команда» в sidebar: Дашборд / Сотрудники / Инструкции / Артефакты / Админка / Постпродакшн — в указанном порядке.
- «Постпродакшн» визуально приглушён в sidebar и на самой странице; ведёт на заглушку с пояснением.
- «Сотрудники» открывает заглушку с пояснением «появится на этапе 2».
- 301-редиректы работают: старые URL `/blog/team/{tools,database,prompts}` ведут на новые.
- Содержимое перенесённых страниц (Дашборд, Артефакты, Инструкции, Админка) функционально не сломано — постановка задач, артефакты, шаблоны, ключи, расходы доступны как раньше.
- Раздел «Базы» виден на верхнем уровне «Блога»; индекс-страница `/blog/databases` показывает три карточки, ссылка «Референсы» рабочая.
- Никаких регрессий в авторизации (whitelist), в требовании JWT для API-маршрутов, в работе жёстких лимитов.

---

### Сессия 4 — Раздел «Инструкции»: структура и переезд (этап 1, пункт 6) ✅ 2026-05-11

**Цель:** Развести bucket `team-prompts` на три логические папки (Стратегия команды / Должностные инструкции / Шаблоны задач), перенести `context.md` и `concept.md` из bucket `team-database` в `Стратегия команды/` под именами Миссия.md и Цели на период.md, переименовать пять шаблонов задач в человекочитаемые имена, обновить `promptBuilder.js` и `taskRunner.js` на новые пути, перестроить страницу `/blog/team/instructions/` под новую трёхблочную структуру.

**Что делать до сессии:**

- Ничего. Все изменения — код + одноразовый Node.js-скрипт миграции Storage. SQL-миграций нет.

**ТЗ для Claude Code:**

1. **Создай одноразовый скрипт** `backend/scripts/migrate-instructions.js`:
   - Читает `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` из `process.env`. Использует `@supabase/supabase-js`.
   - Идемпотентный (если файл уже на новом месте — пропуск с логом, без падения).
   - **Шаг 1.** Скопировать содержимое из bucket `team-database`:
     - `context.md` → bucket `team-prompts`, путь `Стратегия команды/Миссия.md`.
     - `concept.md` → bucket `team-prompts`, путь `Стратегия команды/Цели на период.md`.
     - Использовать `download()` + `upload()` (метод `copy()` Supabase Storage поддерживает только в пределах одного bucket).
   - **Шаг 2.** Внутри bucket `team-prompts` переименовать пять шаблонов задач (через `move()`):
     - `ideas-questions.md` → `Шаблоны задач/Идеи и вопросы для исследования.md`
     - `ideas-free.md` → `Шаблоны задач/Свободные идеи.md`
     - `research-direct.md` → `Шаблоны задач/Прямое исследование.md`
     - `write-text.md` → `Шаблоны задач/Написание текста.md`
     - `edit-text-fragments.md` → `Шаблоны задач/Правка фрагментов.md`
   - **НЕ удалять** оригиналы `context.md` / `concept.md` из bucket `team-database` — оставить как backup, удалить вручную через Supabase Dashboard после ручной проверки прода. Зафиксировать это комментарием в скрипте.
   - Все логи на русском: «Скопирован context.md → Стратегия команды/Миссия.md», «Файл уже на новом месте, пропуск», «Готово: перенесено N файлов».
   - В `package.json` бэкенда добавить npm-скрипт: `"migrate:instructions": "node scripts/migrate-instructions.js"`.

2. **Обнови `backend/src/services/team/promptBuilder.js`:**
   - Изменить пути чтения Mission/Goals: bucket остаётся `team-prompts`, путь меняется с корня (`context.md` / `concept.md`) на `Стратегия команды/Миссия.md` / `Стратегия команды/Цели на период.md`.
   - В `cacheable_blocks` переименовать ключи `context` → `mission`, `concept` → `goals` (под будущую многослойную модель этапа 2). Старые ключи `context` / `concept` оставить как алиасы, читающие новые пути — backward compat.
   - Если в коде где-то заводится константа `INSTRUCTIONS_BUCKET` или подобная — использовать её; иначе просто строка `'team-prompts'`.

3. **Обнови `backend/src/services/team/taskRunner.js`:**
   - Функция `taskTemplateName(taskType)` — обновить mapping:
     ```js
     const TEMPLATE_NAMES = {
       'ideas_free': 'Свободные идеи',
       'ideas_questions_for_research': 'Идеи и вопросы для исследования',
       'research_direct': 'Прямое исследование',
       'write_text': 'Написание текста',
       'edit_text_fragments': 'Правка фрагментов'
     };
     ```
   - Путь к файлу шаблона: `Шаблоны задач/${TEMPLATE_NAMES[taskType]}.md`. Учесть URL-encode при формировании Storage-пути (Supabase JS client делает это сам, но проверь, что не теряются пробелы и кириллица).
   - Backward compat: если файл по новому пути не найден, fallback на старый путь в корне bucket — это страхует на случай частичной миграции; залогировать предупреждение.

4. **Обнови `backend/src/routes/team/prompts.js`** (или эквивалентный маршрут, который сейчас отдаёт список шаблонов и их содержимое фронту):
   - Эндпоинт списка шаблонов теперь возвращает файлы из `Шаблоны задач/`, а не из корня `team-prompts`.
   - Имена в ответе — отображаемые человекочитаемые (без расширения `.md`).
   - Эндпоинт чтения/записи конкретного файла принимает folder + file отдельными параметрами или полный путь как один параметр (на твоё усмотрение, главное чтобы фронт мог обращаться к Миссия.md / Цели на период.md).
   - Добавить эндпоинт **GET `/api/team/instructions/list`** → возвращает структуру `{ strategy: ['Миссия', 'Цели на период'], roles: [], templates: ['Идеи и вопросы для исследования', 'Свободные идеи', 'Прямое исследование', 'Написание текста', 'Правка фрагментов'] }`. `roles: []` пустой массив — должностные появятся в этапе 2.

5. **Перестрой страницу `/blog/team/instructions/page.tsx`:**
   - Главная страница раздела — три блока, видны одновременно (вертикально или сеткой 1/3 + 1/3 + 1/3, на твоё усмотрение):
     - **«Стратегия команды»** — список из двух файлов: Миссия и Цели на период. Клик по файлу — открывается существующий редактор markdown с автосохранением (тот же компонент, что использовался для шаблонов промптов в этапе 1).
     - **«Должностные инструкции»** — пустой блок с плейсхолдером: «Здесь появятся должностные инструкции агентов после этапа 2. Сейчас сотрудников ещё нет.»
     - **«Шаблоны задач»** — список из 5 переименованных шаблонов; клик открывает существующий редактор шаблона со всеми его текущими функциями (превью промпта, тестовый вызов, «🪄 Уточнить промпт»).
   - Сохранить весь существующий функционал редактирования и тестирования шаблонов — не трогать кнопки, формы, превью.

6. **Не трогай функцию «🪄 Уточнить промпт»** — оставь в текущем виде. Выпадашка выбора модели и интеграция с Системной LLM — задача пункта 1 (этап 7).

7. **Обнови страницу `/blog/team/artifacts/page.tsx`:**
   - Если на ней были блоки/секции/ссылки на context.md и concept.md (как раньше — «Артефакты содержат тексты, контекст и концепцию проекта») — убрать упоминания и ссылки.
   - Если страница была построена вокруг этих двух файлов — заменить пустым состоянием «Артефакты задач появятся здесь по мере выполнения работы команды.» Существующие выходные результаты задач (если они уже есть в bucket `team-database`) продолжают отображаться как раньше.

8. **Не создавай в этой сессии:**
   - Подпапку `Навыки агентов/` (это пункт 10, этап 4).
   - Подпапку `Инструменты/` (это пункт 16, этап 3).
   - Файл `Профиль автора.md` (это пункт 9, этап 2 — отложен).
   - Какие-либо файлы внутри `Должностные инструкции/` (это пункт 12, этап 2).

9. **Документация.** Создай `docs/instructions-structure.md` (или дополни существующий README раздела команды) — короткое описание текущей структуры папок в bucket `team-prompts` со ссылками на пункты roadmap, которые её доопределяют:
   ```
   team-prompts/
   ├── Стратегия команды/
   │   ├── Миссия.md          (расширение содержимого — пункт 5, этап 1)
   │   ├── Цели на период.md  (расширение содержимого — пункт 5, этап 1)
   │   └── Профиль автора.md  (опционально, пункт 9, этап 2)
   ├── Должностные инструкции/
   │   └── <имя агента>.md    (пункт 12, этап 2)
   ├── Шаблоны задач/
   │   ├── Идеи и вопросы для исследования.md
   │   ├── Свободные идеи.md
   │   ├── Прямое исследование.md
   │   ├── Написание текста.md
   │   └── Правка фрагментов.md
   ├── Навыки агентов/        (пункт 10, этап 4)
   │   └── <имя агента>/<скилл>.md
   └── Инструменты/           (пункт 16, этап 3)
       └── <имя инструмента>.md
   ```

**Что делать после сессии:**

1. На локальной машине прогнать миграцию: `cd backend && npm run migrate:instructions`. Убедиться в логе, что 7 файлов перенесены / переименованы.
2. Открыть Supabase Dashboard → Storage → bucket `team-prompts` → проверить, что появились две папки и в них правильные файлы. В bucket `team-database` `context.md` и `concept.md` остаются как backup.
3. Локально: `npm run dev`. Открыть `/blog/team/instructions/` — увидеть три блока, кликнуть Миссия.md — открыться редактор с текстом из старого `context.md`. То же для Цели на период.md и для пяти шаблонов.
4. Поставить тестовую задачу через `/blog/team/dashboard` (любой шаблон) — задача должна стартовать без ошибок, в логе бэкенда — корректное чтение Mission и Goals из новых путей.
5. После проверки на проде (после деплоя и аналогичной проверки) — **руками удалить** в Supabase Dashboard старые `context.md` и `concept.md` из bucket `team-database`.
6. Закоммитить, push в main, дождаться деплоя Vercel + Railway. Прогнать миграцию на проде: на Railway открыть терминал сервиса и запустить `npm run migrate:instructions`.

**Критерии готовности:**

- В bucket `team-prompts` структура: `Стратегия команды/Миссия.md`, `Стратегия команды/Цели на период.md`, `Шаблоны задач/Идеи и вопросы для исследования.md` + ещё 4 файла шаблонов с человекочитаемыми именами.
- Старые имена шаблонов (`ideas-free.md`, `ideas-questions.md`, `research-direct.md`, `write-text.md`, `edit-text-fragments.md`) больше не существуют в корне `team-prompts`.
- В bucket `team-database` `context.md` и `concept.md` ещё лежат (backup, удалятся руками после проверки).
- На странице `/blog/team/instructions/` видны три блока: Стратегия команды (2 кликабельных файла), Должностные инструкции (плейсхолдер), Шаблоны задач (5 кликабельных файлов).
- Редактирование любого файла из этих трёх блоков работает: открывается редактор, изменения сохраняются.
- Постановка задач через `/blog/team/dashboard` работает: промпт собирается, Mission/Goals подтягиваются из новых путей.
- В коде бэкенда нет hardcoded путей `team-database/context.md` / `team-database/concept.md` для чтения — все обращения через `promptBuilder.js`.
- В коде бэкенда нет hardcoded имён `ideas-free.md` и других пяти старых файлов шаблонов — всё через `taskTemplateName()` и `TEMPLATE_NAMES`.
- Функция «🪄 Уточнить промпт» работает как раньше (без регрессий).
- Никаких регрессий в OAuth, жёстких лимитах, sidebar и редиректах со старых URL.

---

### Сессия 5 — Раздел «Базы»: каркас и навигация (этап 1, пункт 13) ✅ 2026-05-11

**Цель:** Добавить подменю «Базы» в sidebar (Референсы / Конкуренты-placeholder / слот для кастомных), создать реестр баз в Supabase, минималистичный read-only просмотрщик Референсов, страницу-placeholder Конкурентов, скелет сервиса и API для работы с базами.

**Что делать до сессии:**

- Убедиться, что миграция из Сессии 4 (`0011_team_custom_databases.sql`) НЕ была применена — это новая миграция этой сессии. Если нумерация уже использована — берём следующий номер.
- Прогнать скрипт `npm run migrate:instructions` (Сессия 4), если ещё не запускался.

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0011_team_custom_databases.sql` (или следующий номер по факту):
   ```sql
   CREATE TABLE IF NOT EXISTS team_custom_databases (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     name TEXT NOT NULL,
     description TEXT,
     table_name TEXT NOT NULL UNIQUE,
     schema_definition JSONB,
     db_type TEXT NOT NULL DEFAULT 'custom',
     parent_db_id UUID REFERENCES team_custom_databases(id),
     created_at TIMESTAMPTZ DEFAULT now()
   );
   
   -- db_type: 'referensy' | 'competitor' | 'custom'
   -- table_name для фиксированных баз — имя реальной таблицы
   -- schema_definition — описание колонок для отображения в UI
   
   INSERT INTO team_custom_databases (name, description, table_name, db_type, schema_definition)
   VALUES
     (
       'Референсы',
       'Видеореференсы для блога — Instagram Reels с транскрипцией и AI-анализом',
       'videos',
       'referensy',
       '{"columns":[{"key":"title","label":"Название","type":"text"},{"key":"category","label":"Категория","type":"text"},{"key":"is_reference","label":"Референс","type":"boolean"},{"key":"created_at","label":"Добавлено","type":"date"}]}'::jsonb
     ),
     (
       'Конкуренты',
       'Каналы конкурентов с транскрипцией роликов и AI-анализом',
       'competitors_placeholder',
       'competitor',
       NULL
     )
   ON CONFLICT (table_name) DO NOTHING;
   ```

2. **Создай сервис** `backend/src/services/team/customDatabaseService.js`:
   - `async listDatabases()` — `SELECT * FROM team_custom_databases ORDER BY created_at`. Возвращает массив объектов. Использует `teamSupabase.js`.
   - `async getDatabaseById(id)` — SELECT по id.
   - `async getDatabaseByName(name)` — SELECT по name.
   - `async getDatabaseRecords(tableName, { limit = 50, offset = 0 } = {})`:
     - Если `tableName === 'competitors_placeholder'` — возвращает `{ records: [], total: 0, isPlaceholder: true }`.
     - Иначе — `supabase.from(tableName).select('*', { count: 'exact' }).range(offset, offset + limit - 1)`. Возвращает `{ records, total }`.
   - **НЕ реализовывать** функции создания, изменения, удаления таблиц — только чтение реестра и записей.
   - Сообщения об ошибках — на русском.

3. **Создай маршруты** `backend/src/routes/team/databases.js`:
   - `GET /api/team/databases` → `customDatabaseService.listDatabases()`.
   - `GET /api/team/databases/:id` → `customDatabaseService.getDatabaseById(id)`. 404 если не найдено.
   - `GET /api/team/databases/:id/records?limit=50&offset=0` → читает `table_name` из реестра, вызывает `getDatabaseRecords(tableName, { limit, offset })`. Параметры парсить через `parseInt`, дефолты 50 и 0.
   - Зарегистрировать в `backend/src/app.js` или аналогичном файле: `app.use('/api/team/databases', requireAuth, databasesRouter)`.

4. **Обнови sidebar** (компонент из Сессии 3):
   - Раздел «Базы» превращается в **разворачиваемый узел** с дочерними пунктами. Логика:
     - При монтировании делает `GET /api/team/databases` (или через server-side fetch в layout) и рендерит подпункты.
     - Фиксированные пункты (тип `referensy` и `competitor`) — всегда отображаются.
     - Пункты типа `custom` — рендерятся динамически по мере появления.
   - Подпункты:
     - **Референсы** → `/blog/databases/references` (активный, обычный стиль).
     - **Конкуренты** → `/blog/databases/competitors` (приглушённый, `opacity: 0.5`, при hover — tooltip «Появится в этапе 5»).
     - Кастомные базы типа `custom` → `/blog/databases/[slug]` где slug = url-encoded name. На старте нет — не рендерятся.
   - Весь раздел «Базы» (включая подпункты) автоматически раскрыт, если текущий URL начинается с `/blog/databases`.

5. **Обнови страницу `/blog/databases/page.tsx`** (index-страница, создана в Сессии 3 как заглушка):
   - Делает `fetchBackend('/api/team/databases')` на server-side (или через `useEffect` на client-side, как принято в Потоке).
   - Рендерит сетку карточек из результата:
     - Для типа `referensy` — полностью кликабельная карточка с именем, описанием, кнопкой «Открыть».
     - Для типа `competitor` — карточка с пониженным `opacity: 0.6`, без кнопки «Открыть», вместо неё пометка «Этап 5».
     - Для типа `custom` — полностью кликабельная. На старте карточек этого типа нет.
   - Краткая строка над сеткой: «Структурированное переиспользуемое знание команды.»

6. **Создай страницу `/blog/databases/references/page.tsx`**:
   - Подгружает данные: сначала `GET /api/team/databases` → находит запись с `table_name = 'videos'`, берёт её `id` и `schema_definition`. Потом `GET /api/team/databases/:id/records?limit=50&offset=0`.
   - Отображает таблицу записей:
     - Колонки берёт из `schema_definition.columns` (которую положили в seed-миграции).
     - Данные — из `records`.
     - Простая HTML-таблица (`<table>` / `<thead>` / `<tbody>`) со стилями проекта.
   - Пагинация: показывает «Записей всего: N», кнопки «← Назад» / «Вперёд →» (скрываются если нет страницы).
   - Кнопка «Открыть полную базу» — ссылка на существующую страницу базы референсов Потока (найди существующий URL в коде и подставь; если не найдёшь — оставь TODO-комментарий).
   - Read-only: никаких кнопок добавления, редактирования, удаления записей.

7. **Создай страницу `/blog/databases/competitors/page.tsx`**:
   - Приглушённый placeholder (как «Постпродакшн» в Команде).
   - Заголовок «Конкуренты».
   - Текст: «База каналов конкурентов появится в этапе 5. Разведчик будет анализировать форматы, хуки и темы конкурентов через Apify-парсинг Instagram-аккаунтов.»
   - Весь контент контейнера — с `opacity: 0.6`.

8. **Создай динамическую страницу** `frontend/src/app/blog/databases/[slug]/page.tsx`:
   - `slug` — это закодированное имя кастомной базы.
   - Подгружает базу по имени через `GET /api/team/databases` → находит по decoded-slug.
   - Если не найдена — показывает 404 или пустое состояние.
   - Если найдена и есть записи — показывает таблицу как в References, используя `schema_definition` для заголовков колонок.
   - Если записей нет — «База пуста. Записи появятся по мере работы команды.»

9. **Зарегистрируй маршрут** `/api/team/databases` в `requireAuth`-middleware (если не сделано в п.3).

10. **Не реализовывать в этой сессии:**
    - Мастер «+ Создать базу» — 🔁 пункт 22 (этап 6).
    - Кнопку «Сделать базой» в Артефактах — 🔁 пункт 22 (этап 6).
    - Три уровня доступа (read/append/create) в карточке агента — 🔁 пункт 12 (этап 2).
    - Мультиселект прикрепления баз в форме постановки задачи — 🔁 пункт 14 (этап 3).
    - Awareness баз в промпте агента — 🔁 пункт 7 (этап 2).
    - Фактическое создание таблиц Supabase под кастомные базы — 🔁 пункт 22 (этап 6).

**Что делать после сессии:**

1. Накатить миграцию через Supabase Dashboard → SQL Editor.
2. Проверить в Supabase Dashboard, что таблица `team_custom_databases` создана с двумя строками (Референсы и Конкуренты).
3. Локально: `npm run dev`. Открыть `/blog/databases` — видеть две карточки (Референсы активна, Конкуренты приглушена).
4. Кликнуть «Референсы» → попасть на `/blog/databases/references`, увидеть таблицу с видео. Пагинация работает.
5. Кликнуть «Конкуренты» → placeholder-страница с пояснением.
6. В sidebar убедиться, что «Базы» раскрывается с двумя подпунктами.
7. `curl https://<railway-url>/api/team/databases` без Authorization → 401. С корректным токеном → JSON с двумя записями.
8. Закоммитить, push, дождаться деплоя. Накатить миграцию на проде.

**Критерии готовности:**

- Таблица `team_custom_databases` существует в Supabase с двумя seed-записями (Референсы / Конкуренты).
- `GET /api/team/databases` возвращает две записи; требует авторизации.
- `GET /api/team/databases/:id/records` для Референсов — возвращает записи из `videos`; для Конкурентов — `isPlaceholder: true`.
- Sidebar раздела «Базы» раскрывается с подпунктами Референсы и Конкуренты (приглушённый).
- `/blog/databases` показывает динамические карточки, не захардкоженные.
- `/blog/databases/references` — таблица с видеозаписями, пагинация работает.
- `/blog/databases/competitors` — placeholder с пояснением.
- Динамический маршрут `/blog/databases/[slug]` отрабатывает для несуществующих имён пустым состоянием.
- Никаких регрессий в OAuth, жёстких лимитах, Инструкциях, sidebar-pin.

---

### Сессия 6 — Многослойная сборка промпта (этап 1, пункт 4) ✅ 2026-05-11

**Цель:** Расширить `promptBuilder.js` с двухслойной модели (mission/goals) до полной семислойной архитектуры промпта с заглушками для слоёв, которые наполнятся в этапе 2 (role, memory, skills, awareness), реализовать порядок «от общего к частному» и подготовить prompt caching через `cache_control: ephemeral`.

**Что делать до сессии:**

- Ничего. SQL-миграций нет. Все изменения — чисто код бэкенда и фронтенда.

**ТЗ для Claude Code:**

1. **Прочитай текущий `backend/src/services/team/promptBuilder.js`** — разберись, как сейчас работают ключи `mission`, `goals` (алиасы `context`, `concept`), `cacheable_blocks`, и как собирается финальный промпт для `llmClient.js`. Зафиксируй в коде комментарием текущую двухслойную модель перед расширением.

2. **Расширь `promptBuilder.js` до семислойной модели.** Добавь новые ключи слоёв в порядке сборки промпта:
   ```
   mission → author_profile (опц.) → role → goals → memory → skills → task
   ```
   Каждый слой — отдельный блок в массиве `system` (или эквивалентной структуре промпта). Конкретно:
   - **`mission`** — уже работает (Сессия 4). Читает `team-prompts/Стратегия команды/Миссия.md`. Без изменений.
   - **`author_profile`** — новый опциональный слой. Читает `team-prompts/Стратегия команды/Профиль автора.md`. Если файл не существует — слой пропускается без ошибки, без лога предупреждения (файл появится не раньше этапа 2, пункт 9). Добавить в `cacheable_blocks`.
   - **`role`** — новый слой. На этом этапе — **заглушка**: читает `team-prompts/Должностные инструкции/<agent_name>.md`, где `agent_name` передаётся параметром в `buildPrompt()`. Если `agent_name` не передан или файл не найден — слой пропускается без ошибки. Добавить в `cacheable_blocks`. Позже (этап 2, пункт 7) внутрь role будет вставляться автогенерируемый блок Awareness.
   - **`goals`** — уже работает (Сессия 4). Без изменений.
   - **`memory`** — новый слой. Источник: **БД** (таблица `team_agent_memory`, появится в этапе 2, пункт 3). Сейчас — заглушка: функция `loadMemoryRules(agentId)` возвращает пустой массив, если таблицы не существует или `agentId` не передан. Обернуть результат в markdown-блок `## Правила из памяти\n- правило 1\n- правило 2...`. Если правил нет — слой пропускается. **Не добавлять в `cacheable_blocks`** — memory динамична.
   - **`skills`** — новый слой. Читает все `.md` файлы из `team-prompts/Навыки агентов/<agent_name>/`. Если папка не существует или `agent_name` не передан — слой пропускается. Конкатенирует содержимое файлов через `\n---\n`. Добавить в `cacheable_blocks`, инвалидация — при изменении состава файлов.
   - **`task`** — уже работает (текущий шаблон задачи + пользовательский ввод). Без изменений. Всегда последний.

3. **Реализуй порядок слоёв в финальном промпте.** Функция `buildPrompt()` (или её аналог) собирает массив блоков в строго зафиксированном порядке:
   ```javascript
   const layers = [
     { key: 'mission', content: missionContent, cacheable: true },
     { key: 'author_profile', content: authorContent, cacheable: true },
     { key: 'role', content: roleContent, cacheable: true },
     { key: 'goals', content: goalsContent, cacheable: true },
     { key: 'memory', content: memoryContent, cacheable: false },
     { key: 'skills', content: skillsContent, cacheable: true },
     { key: 'task', content: taskContent, cacheable: false },
   ];
   ```
   Фильтруй `null`/`undefined`/пустые — пропускай. Слои с `cacheable: true` оборачивай в `cache_control: { type: 'ephemeral' }` при формировании вызова Anthropic. Для других провайдеров (Google, OpenAI) — игнорируй `cache_control`, конкатенируй как обычный текст.

4. **Обнови сигнатуру `buildPrompt()`** — добавь опциональные параметры:
   ```javascript
   async function buildPrompt({
     taskType,           // существующий
     userInput,          // существующий
     agentId,            // новый, опциональный — для загрузки role/memory/skills
     agentName,          // новый, опциональный — имя агента для путей в Storage
     additionalContext,  // существующий (если есть)
   })
   ```
   Если `agentId` / `agentName` не переданы — слои `role`, `memory`, `skills` пропускаются (обратная совместимость с текущими вызовами без агентов).

5. **Обнови `taskRunner.js`** — передавай `agentId` и `agentName` в `buildPrompt()`, если они присутствуют в записи задачи `team_tasks`. Сейчас таких полей в таблице нет (появятся в этапе 2) — поэтому текущие задачи продолжат работать по двухслойной модели (mission + goals + task). Никаких регрессий.

6. **Добавь helper `getPromptLayersSummary()`** — возвращает объект с метаинформацией о загруженных слоях для отладки:
   ```javascript
   {
     layers_loaded: ['mission', 'goals', 'task'],
     layers_skipped: ['author_profile', 'role', 'memory', 'skills'],
     total_tokens_estimate: 2500,  // грубая оценка: chars / 4
     cache_eligible_tokens: 2000,
   }
   ```
   Логировать этот summary в `console.log` при каждой сборке промпта (для Railway Logs). Не записывать в `team_api_calls` — слишком подробно.

7. **Обнови эндпоинт `previewPrompt`** (если он существует в `taskRunner.js` или маршрутах) — в превью промпта показывай все загруженные слои с визуальными разделителями:
   ```
   ═══ MISSION ═══
   [содержимое]
   ═══ ROLE ═══
   [содержимое или «(не загружен — агент не указан)»]
   ═══ GOALS ═══
   [содержимое]
   ═══ MEMORY ═══
   (не загружен — агент не указан)
   ═══ SKILLS ═══
   (не загружен — агент не указан)
   ═══ ЗАДАЧА ═══
   [содержимое]
   ```

8. **Добавь JSDoc-документацию** в начало `promptBuilder.js`:
   ```javascript
   /**
    * Многослойная сборка промпта для агентов команды.
    *
    * Порядок слоёв (от общего к частному):
    * 1. Mission — общая цель команды (кешируется)
    * 2. Профиль автора — опц., про Влада (кешируется)
    * 3. Role — должностная агента + Awareness (кешируется)
    * 4. Goals — цели на период (кешируется)
    * 5. Memory — правила из БД (динамика, НЕ кешируется)
    * 6. Skills — рецепты успеха из Storage (кешируется)
    * 7. Задача — конкретная постановка (динамика)
    *
    * Обоснование порядка:
    * - Recency bias: задача в конце читается моделью «острее».
    * - Lost-in-the-middle: начало и конец читаются хорошо,
    *   середина — хуже. Стабильные слои — в начале и середине.
    * - Prompt caching: стабильный префикс = экономия на кеше.
    *
    * @see Разработка_команды_v17.md, пункт 4
    */
   ```

9. **Не реализовывать в этой сессии:**
   - Таблицу `team_agent_memory` — это пункт 3 (этап 1, следующая сессия).
   - Таблицу `team_agents` — это пункт 7 (этап 2).
   - Блок Awareness внутри Role — это пункт 7 (этап 2).
   - Логику инвалидации кеша при изменении состава агентов — это пункт 12 (этап 2).
   - Фильтрацию skills по релевантности — это пункт 10 (этап 4, когда skills > 20).

**Что делать после сессии:**

1. Локально: `npm run dev`. Открыть Дашборд (`/blog/team/dashboard`), поставить тестовую задачу.
2. В Railway Logs проверить, что выводится `getPromptLayersSummary()` с `layers_loaded: ['mission', 'goals', 'task']` и `layers_skipped: ['author_profile', 'role', 'memory', 'skills']`.
3. Проверить превью промпта — должны быть видны все 7 слоёв, из них 4 помечены как «не загружен».
4. Убедиться, что результат задачи идентичен поведению до сессии (mission + goals + task по-прежнему работают).
5. Закоммитить, push в main, дождаться деплоя Vercel + Railway.
6. На production поставить ещё одну тестовую задачу — проверить в Railway Logs.

**Критерии готовности:**

- `promptBuilder.js` содержит семислойную модель с чётким порядком: mission → author_profile → role → goals → memory → skills → task.
- Вызов `buildPrompt()` без `agentId` / `agentName` работает как раньше (mission + goals + task) — обратная совместимость.
- Вызов `buildPrompt({ agentName: 'Тест' })` пытается загрузить role/skills из Storage, не падает если файлов нет.
- Кешируемые слои (mission, author_profile, role, goals, skills) оборачиваются в `cache_control: { type: 'ephemeral' }` для Anthropic-вызовов.
- Memory-слой читает из БД (пустой массив, если таблицы нет), не кешируется.
- Превью промпта показывает все 7 слоёв с разделителями и статусами загрузки.
- `getPromptLayersSummary()` выводится в console.log при каждой сборке.
- JSDoc-документация с описанием порядка и обоснованием — в начале файла.
- Никаких регрессий в OAuth, жёстких лимитах, sidebar, Инструкциях, Базах.

**Отклонения:** Anthropic ограничивает запрос 4 cache breakpoints. Спецификация просит cache_control на каждом из 5 cacheable-слоёв (mission, author_profile, role, goals, skills) — это потенциально превышает лимит, когда все слои заполнены. На Сессии 6 реальные нагрузки укладываются в 2 cacheable-слоя (mission + goals — остальные пусты до этапов 2/4), поэтому llmClient не меняется. При запуске агентов в этапе 2 потребуется добавить cap в llmClient (например, cache_control только на последние 4 блока или только на финальный — он покрывает префикс). Логический порядок слоёв в `layers` сохранён точно как в ТЗ; физический порядок в Anthropic-запросе — все cacheable-блоки идут сначала (mission → author_profile → role → goals → skills), затем не-кешируемые memory + task в systemPrompt. Эта разница описана в JSDoc промпт-билдера.

---

### Сессия 7 — Наполнение Mission и Goals (этап 1, пункт 5) ✅ 2026-05-11

**Цель:** Переписать содержимое `Миссия.md` и `Цели на период.md` из унаследованного формата `context.md`/`concept.md` в структурированный формат пункта 5, добавить скрипт-валидатор структуры для будущих обновлений, обновить превью промпта с учётом новых секций.

**Что делать до сессии:**

1. **Влад пишет черновик Mission.** Открыть страницу `/blog/team/instructions/` → кликнуть «Миссия» → переписать содержимое по структуре ниже (можно прямо в UI-редакторе, он с автосохранением):
   ```markdown
   # Mission — Блог «[название]»

   ## Концепция
   История и культура России в стиле Парфёнова — точки поворота,
   запреты, ошибки, странности, городские феномены, Петербург.

   ## North Star
   30 000 подписчиков к концу года.

   ## Целевая аудитория
   [Влад дописывает: кто эти люди, что им интересно]

   ## Табу
   - Лайфстайл, бизнес, бьюти, политика.
   - [другие исключения]

   ## Ценности
   - Не нейрослоп — авторский контент с осмысленным использованием AI.
   - [другие ценности]
   ```

2. **Влад пишет черновик Goals.** Там же → «Цели на период»:
   ```markdown
   # Goals — [месяц год]

   ## Фокус на период
   [На чём концентрируемся ближайшие 2–4 недели]

   ## Текущая точка
   [Пока пусто или «0 подписчиков, аккаунт создан»]

   ## Рубрики в работе
   - [рубрика 1]
   - [рубрика 2]

   ## KPI на период
   - [метрика 1]
   - [метрика 2]
   ```

   Если черновики не готовы — **Claude Code всё равно выполняет сессию**: создаёт шаблоны-заглушки с правильной структурой и placeholder-текстами, которые Влад заполнит позже.

**ТЗ для Claude Code:**

1. **Прочитай текущее содержимое** `team-prompts/Стратегия команды/Миссия.md` и `team-prompts/Стратегия команды/Цели на период.md` через Supabase Storage API (или через существующий эндпоинт чтения файлов). Если содержимое уже переструктурировано Владом (содержит заголовки `## Концепция`, `## North Star` и т.п.) — не трогай, оставь как есть. Если содержимое всё ещё в старом формате (унаследованный текст из `context.md`/`concept.md`) — замени на шаблон-заглушку.

2. **Создай скрипт** `backend/scripts/validate-mission-goals.js`:
   - Читает `Миссия.md` из Storage и проверяет наличие обязательных секций: `## Концепция`, `## North Star`, `## Целевая аудитория`, `## Табу`, `## Ценности`.
   - Читает `Цели на период.md` и проверяет: `## Фокус на период`, `## Текущая точка`, `## Рубрики в работе`, `## KPI на период`.
   - Для каждой секции выводит: ✅ (найдена и непустая), ⚠️ (найдена но пустая / placeholder), ❌ (отсутствует).
   - Выводит итог: «Mission: 5/5 секций заполнены» или «Goals: 2/4 секций заполнены, 2 пустые».
   - Идемпотентный, не модифицирует файлы, только читает и валидирует.
   - Добавить `npm run validate:mission-goals` в `package.json` бэкенда.

3. **Создай шаблон-заглушку** `backend/scripts/templates/mission-template.md` с полной структурой и placeholder-текстами (как в блоке «Что делать до сессии» выше). Аналогично `goals-template.md`. Эти файлы — справочные шаблоны для Влада, не для автоматической загрузки в Storage.

4. **Обнови превью промпта** (если Сессия 6 добавила визуальные разделители): в блоке `═══ MISSION ═══` после содержимого добавь строку-индикатор полноты — вызывай ту же логику из `validate-mission-goals.js` (или её инлайн-версию) и дописывай `[Mission: 5/5 секций]` или `[Mission: 3/5 секций — проверь]`. Для Goals аналогично. Это помогает Владу видеть прямо в превью, заполнено ли всё.

5. **Добавь в `promptBuilder.js` метод `getMissionGoalsCompleteness()`** — возвращает объект:
   ```javascript
   {
     mission: { total: 5, filled: 3, sections: { concept: true, northStar: true, audience: false, taboo: true, values: false } },
     goals: { total: 4, filled: 2, sections: { focus: true, currentPoint: false, rubrics: true, kpi: false } },
   }
   ```
   Этот метод используется (а) в превью промпта, (б) потенциально в будущем в шапке дашборда (пункт 14, этап 3).

6. **Не реализовывать в этой сессии:**
   - Mission/Goals review (фоновый еженедельный дайджест) — 🔁 пункт 15 (этап 3, фоновые задачи).
   - Автоматическую «текущую точку» через Instagram API — 🔁 пункт 17 (этап 5, вторая волна).
   - Парсинг статистики Системной LLM — 🔁 пункт 1 (этап 7).
   - Счётчик «до North Star» в шапке дашборда — 🔁 пункт 14 (этап 3).

**Что делать после сессии:**

1. Запустить `npm run validate:mission-goals` — убедиться, что скрипт отрабатывает и показывает текущее состояние секций.
2. Если `Миссия.md` и `Цели на период.md` ещё содержат placeholder — **заполнить их руками** через UI (`/blog/team/instructions/`). Это творческая задача Влада, не Claude Code.
3. После заполнения — снова `npm run validate:mission-goals`, убедиться что все секции ✅.
4. Поставить тестовую задачу через дашборд — в превью промпта и в Railway Logs увидеть `[Mission: 5/5]` и `[Goals: 4/4]`.
5. Закоммитить, push, деплой.

**Критерии готовности:**

- `Миссия.md` содержит 5 обязательных секций: Концепция, North Star, Целевая аудитория, Табу, Ценности (содержимое может быть placeholder — заполнит Влад).
- `Цели на период.md` содержит 4 обязательных секции: Фокус на период, Текущая точка, Рубрики в работе, KPI на период.
- Скрипт `npm run validate:mission-goals` отрабатывает, показывает статус каждой секции.
- Шаблоны-справочники `mission-template.md` и `goals-template.md` лежат в `backend/scripts/templates/`.
- Превью промпта показывает индикатор полноты Mission и Goals.
- `getMissionGoalsCompleteness()` доступен в `promptBuilder.js`.
- Постановка задач работает как раньше — никаких регрессий.

---

### Сессия 8 — Таблица памяти агентов (этап 1, пункт 3) ✅ 2026-05-11

**Цель:** Создать таблицу `team_agent_memory` в Supabase для хранения эпизодов и правил агентов, сервис `memoryService.js`, API-маршруты для CRUD, подключить загрузку правил в слой `memory` в `promptBuilder.js` (заменив заглушку из Сессии 6), добавить seed-скрипт для ручного добавления правил.

**Что делать до сессии:**

- Убедиться, что миграции до `0011` накачены. Следующая будет `0012_team_agent_memory.sql`.

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0012_team_agent_memory.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS team_agent_memory (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     agent_id TEXT NOT NULL,           -- ID агента (пока строка; станет FK на team_agents в пункте 7)
     type TEXT NOT NULL CHECK (type IN ('episode', 'rule')),
     content TEXT NOT NULL,            -- для episode: parsed_text; для rule: текст правила
     source TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'seed', 'feedback', 'curator')),
     status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'rejected', 'candidate')),
     score INTEGER,                    -- для episode: оценка 0–5 из обратной связи; для rule: NULL
     task_id TEXT,                     -- для episode: ссылка на задачу-источник; для rule: NULL
     source_episode_ids UUID[],       -- для rule: массив id эпизодов, из которых сформировано правило
     reviewed_at TIMESTAMPTZ,         -- для candidate → approved/rejected: когда Влад посмотрел
     pinned BOOLEAN DEFAULT false,    -- для rule: Curator не трогает pinned-правила
     created_at TIMESTAMPTZ DEFAULT now(),
     updated_at TIMESTAMPTZ DEFAULT now()
   );

   -- Индексы для типичных запросов
   CREATE INDEX idx_team_agent_memory_agent_type ON team_agent_memory(agent_id, type);
   CREATE INDEX idx_team_agent_memory_agent_status ON team_agent_memory(agent_id, status);
   CREATE INDEX idx_team_agent_memory_type_status ON team_agent_memory(type, status);

   COMMENT ON TABLE team_agent_memory IS 'Память агентов: эпизоды (сырой фидбэк) и правила (обобщения). Эпизоды НЕ попадают в промпт, правила — попадают целиком.';
   ```

2. **Создай сервис** `backend/src/services/team/memoryService.js`:
   - `async getRulesForAgent(agentId)` — `SELECT * FROM team_agent_memory WHERE agent_id = $1 AND type = 'rule' AND status = 'active' ORDER BY created_at ASC`. Возвращает массив правил. Используется в `promptBuilder.js` для слоя `memory`.
   - `async getEpisodesForAgent(agentId, { status = 'active', limit = 100 } = {})` — эпизоды агента с фильтром по статусу, пагинация.
   - `async getAllMemory(agentId)` — все записи (и эпизоды, и правила) для отображения в карточке сотрудника.
   - `async addRule({ agentId, content, source = 'manual', pinned = false })` — добавление правила вручную. `source = 'seed'` для стартовых при создании агента, `source = 'manual'` для добавленных Владом через UI, `source = 'feedback'` для одобренных кандидатов.
   - `async addEpisode({ agentId, content, score, taskId, source = 'feedback' })` — добавление эпизода (из парсера обратной связи, пока заглушка).
   - `async updateMemory(id, { content, status, pinned })` — обновление записи (редактирование правила, смена статуса, pin/unpin).
   - `async archiveMemory(id)` — `UPDATE ... SET status = 'archived', updated_at = now()`.
   - `async getMemoryStats(agentId)` — `{ totalRules, totalEpisodes, activeRules, pinnedRules, archivedCount }`.
   - Сообщения об ошибках — на русском.

3. **Создай маршруты** `backend/src/routes/team/memory.js`:
   - `GET /api/team/memory/:agentId` → `memoryService.getAllMemory(agentId)`. Параметры: `?type=rule|episode`, `?status=active|archived|all`.
   - `GET /api/team/memory/:agentId/rules` → `memoryService.getRulesForAgent(agentId)`. Для промпта и UI.
   - `GET /api/team/memory/:agentId/stats` → `memoryService.getMemoryStats(agentId)`.
   - `POST /api/team/memory/:agentId` → `memoryService.addRule(...)` или `addEpisode(...)` в зависимости от `body.type`.
   - `PATCH /api/team/memory/:id` → `memoryService.updateMemory(...)`. Для редактирования, pin/unpin.
   - `DELETE /api/team/memory/:id` → `memoryService.archiveMemory(...)` (мягкое удаление через `status = 'archived'`).
   - Зарегистрировать в `app.js`: `app.use('/api/team/memory', requireAuth, memoryRouter)`.

4. **Обнови `promptBuilder.js`** — замени заглушку `loadMemoryRules()` из Сессии 6 на реальный вызов `memoryService.getRulesForAgent(agentId)`. Если `agentId` не передан — пропуск слоя (как раньше). Если передан, но правил нет — слой пропускается. Если есть правила — форматируй как markdown:
   ```
   ## Правила из памяти

   - Вступление не больше двух предложений
   - Не использовать слово «уникальный»
   - Иронию приоритизировать над академичной точностью
   ```

5. **Создай seed-скрипт** `backend/scripts/seed-memory.js`:
   - Принимает аргументы: `--agent <agentId> --rule "текст правила"` или `--agent <agentId> --file rules.txt` (файл с правилами по одному на строку).
   - Добавляет правила с `source = 'seed'`, `status = 'active'`.
   - Идемпотентный: если правило с таким текстом у агента уже есть — пропуск.
   - Добавить `npm run seed:memory` в `package.json`.
   - Пример: `npm run seed:memory -- --agent test-agent --rule "Вступление не больше двух предложений"`.

6. **Не реализовывать в этой сессии:**
   - Парсер обратной связи (автоматическое создание эпизодов из оценок задач) — 🔁 пункт 9 (этап 2).
   - Фоновое сжатие эпизодов в кандидаты в правила — 🔁 пункт 9 (этап 2).
   - Curator (ревизия принятых правил) — 🔁 пункт 9 (этап 2).
   - UI экрана «Кандидаты в правила» — 🔁 пункт 9 (этап 2).
   - Таблицу `team_agents` — 🔁 пункт 7 (этап 2). Пока `agent_id` — произвольная строка.
   - UI карточки сотрудника с отображением Memory — 🔁 пункт 12 (этап 2).
   - `node-cron` для фонового сжатия — 🔁 пункт 15 (этап 3).

**Что делать после сессии:**

1. Накатить миграцию `0012_team_agent_memory.sql` через Supabase Dashboard → SQL Editor.
2. Проверить в Supabase Dashboard, что таблица `team_agent_memory` создана с правильными полями и индексами.
3. Локально: добавить тестовое правило:
   ```bash
   npm run seed:memory -- --agent test-agent --rule "Вступление не больше двух предложений"
   npm run seed:memory -- --agent test-agent --rule "Иронию приоритизировать над академичной точностью"
   ```
4. `curl` с авторизацией: `GET /api/team/memory/test-agent/rules` → должен вернуть два правила.
5. `curl`: `GET /api/team/memory/test-agent/stats` → `{ activeRules: 2, totalEpisodes: 0, ... }`.
6. Поставить тестовую задачу с `agentName: 'test-agent'` (через прямой вызов или модифицированный POST) — в Railway Logs увидеть `layers_loaded: [..., 'memory']`, в превью промпта — блок `═══ MEMORY ═══` с двумя правилами.
7. Удалить тестовые данные: `DELETE FROM team_agent_memory WHERE agent_id = 'test-agent'` в Supabase Dashboard.
8. Закоммитить, push, деплой. Накатить миграцию на проде.

**Критерии готовности:**

- Таблица `team_agent_memory` существует с полями: id, agent_id, type, content, source, status, score, task_id, source_episode_ids, reviewed_at, pinned, created_at, updated_at.
- Индексы по (agent_id, type) и (agent_id, status) созданы.
- `memoryService.getRulesForAgent(agentId)` возвращает только активные правила, отсортированные по дате создания.
- API-маршруты: GET rules, GET stats, POST (add), PATCH (update), DELETE (archive) — все работают, все за `requireAuth`.
- `promptBuilder.js` загружает правила из БД вместо заглушки — слой `memory` появляется в промпте, если есть правила.
- Слой `memory` НЕ оборачивается в `cache_control: ephemeral` (динамика, как зафиксировано в Сессии 6).
- `seed-memory.js` работает, идемпотентен.
- Без правил в БД — поведение идентично заглушке (слой пропускается).
- Никаких регрессий в OAuth, лимитах, Инструкциях, Базах, Mission/Goals.

---

### Сессия 9 — Таблица агентов и сервис (этап 2, пункт 7) ✅ 2026-05-11

**Цель:** Создать таблицу `team_agents` в Supabase со всеми полями, отражающими семь «органов» агента, сервис `agentService.js`, API-маршруты CRUD, добавить FK от `team_agent_memory.agent_id` к `team_agents.id`, обновить страницу «Сотрудники» с простым списком агентов из БД (без мастера создания — он в пункте 12).

**Что делать до сессии:**

- Убедиться, что миграция `0012_team_agent_memory.sql` накачена. Следующая будет `0013_team_agents.sql`.

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0013_team_agents.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS team_agents (
     id TEXT PRIMARY KEY,                -- slug-идентификатор (латиница, дефисы), например 'scout' или 'chief-editor'
     display_name TEXT NOT NULL,         -- отображаемое имя на русском: «Разведчик», «Шеф-редактор»
     role_title TEXT,                    -- должность одной строкой: «Аналитик-разведчик»
     department TEXT CHECK (department IN ('analytics', 'preproduction', 'production')),
     avatar_url TEXT,                    -- URL аватара (Supabase Storage или внешний)
     biography TEXT,                     -- биография в свободной форме
     status TEXT DEFAULT 'active' CHECK (status IN ('active', 'paused', 'archived')),

     -- Hands: доступы и permissions
     database_access JSONB DEFAULT '[]'::jsonb,
       -- массив объектов: [{ database_id: "uuid", level: "read" | "append" | "create" }]
     available_tools TEXT[] DEFAULT '{}',
       -- массив slug'ов инструментов: ['web-search', 'notebooklm', 'apify']
     allowed_task_templates TEXT[] DEFAULT '{}',
       -- массив slug'ов шаблонов задач, которые агент может выполнять
     orchestration_mode BOOLEAN DEFAULT false,
       -- true только для шефа-редактора: расширенные permissions в режиме оркестрации

     -- Clock: автономность
     autonomy_level INTEGER DEFAULT 0 CHECK (autonomy_level IN (0, 1)),
       -- 0 = только по команде Влада, 1 = может предлагать самозадачи

     -- Wallet: модель и бюджеты
     default_model TEXT,                -- slug модели по умолчанию: 'claude-sonnet-4-20250514'

     -- Метаданные
     created_at TIMESTAMPTZ DEFAULT now(),
     updated_at TIMESTAMPTZ DEFAULT now()
   );

   -- Индексы
   CREATE INDEX idx_team_agents_status ON team_agents(status);
   CREATE INDEX idx_team_agents_department ON team_agents(department);

   COMMENT ON TABLE team_agents IS 'Реестр агентов команды. Семь органов: Identity (display_name, role_title, avatar, biography), Mind (memory в team_agent_memory + наследование Mission/Goals), Hands (database_access, available_tools, allowed_task_templates, orchestration_mode), Voice (тон через biography + Role.md), Clock (autonomy_level), Wallet (default_model), Awareness (автогенерируется в promptBuilder).';

   -- Лог изменений агента
   CREATE TABLE IF NOT EXISTS team_agent_history (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     agent_id TEXT NOT NULL REFERENCES team_agents(id) ON DELETE CASCADE,
     change_type TEXT NOT NULL,         -- 'role_updated', 'biography_updated', 'model_changed', 'status_changed', 'tools_changed', 'databases_changed', 'autonomy_changed', 'seed_rules_added'
     old_value TEXT,                    -- предыдущее значение (текст или JSON-строка)
     new_value TEXT,                    -- новое значение
     comment TEXT,                      -- опциональный комментарий Влада «зачем поправил»
     created_at TIMESTAMPTZ DEFAULT now()
   );

   CREATE INDEX idx_team_agent_history_agent ON team_agent_history(agent_id);
   CREATE INDEX idx_team_agent_history_created ON team_agent_history(created_at DESC);

   COMMENT ON TABLE team_agent_history IS 'Лог изменений агента: правки Role, биографии, модели, статуса. Через 3 месяца позволяет понять «почему агент стал работать иначе».';

   -- Привязка team_agent_memory.agent_id к team_agents.id
   -- Сначала удаляем тестовые данные, которые могут ссылаться на несуществующих агентов
   DELETE FROM team_agent_memory WHERE agent_id NOT IN (SELECT id FROM team_agents);

   ALTER TABLE team_agent_memory
     ADD CONSTRAINT fk_team_agent_memory_agent
     FOREIGN KEY (agent_id) REFERENCES team_agents(id) ON DELETE CASCADE;
   ```

2. **Создай сервис** `backend/src/services/team/agentService.js`:
   - `async listAgents({ status = 'active' } = {})` — возвращает всех агентов с указанным статусом, отсортированных по `created_at ASC`.
   - `async getAgent(agentId)` — один агент по `id`. Если не найден — выбрасывает ошибку `Агент «${agentId}» не найден`.
   - `async createAgent({ id, display_name, role_title, department, biography, avatar_url, default_model, database_access, available_tools, allowed_task_templates, orchestration_mode, autonomy_level })` — INSERT + запись в `team_agent_history` с `change_type = 'created'`. Валидация: `id` — только латиница, цифры, дефисы; `display_name` — обязательное.
   - `async updateAgent(agentId, fields)` — UPDATE только переданных полей + запись каждого изменённого поля в `team_agent_history` (отдельная строка на каждое поле с `old_value` / `new_value`). Принимает опциональный `comment` для истории.
   - `async archiveAgent(agentId)` — `UPDATE ... SET status = 'archived', updated_at = now()` + запись в history.
   - `async restoreAgent(agentId)` — `UPDATE ... SET status = 'active', updated_at = now()` + запись в history.
   - `async getAgentHistory(agentId, { limit = 50 } = {})` — `SELECT * FROM team_agent_history WHERE agent_id = $1 ORDER BY created_at DESC LIMIT $2`.
   - `async getAgentRoster()` — возвращает сжатый массив `[{ id, display_name, role_title, department, status }]` для Awareness-блока (будет использоваться в пункте 12 при генерации Awareness). Только активные агенты.
   - Сообщения об ошибках на русском.

3. **Создай маршруты** `backend/src/routes/team/agents.js`:
   - `GET /api/team/agents` → `agentService.listAgents()`. Query-параметр `?status=active|paused|archived|all`.
   - `GET /api/team/agents/roster` → `agentService.getAgentRoster()`. Лёгкий эндпоинт для Awareness.
   - `GET /api/team/agents/:id` → `agentService.getAgent(id)`.
   - `POST /api/team/agents` → `agentService.createAgent(body)`.
   - `PATCH /api/team/agents/:id` → `agentService.updateAgent(id, body)`.
   - `DELETE /api/team/agents/:id` → `agentService.archiveAgent(id)` (мягкое удаление).
   - `POST /api/team/agents/:id/restore` → `agentService.restoreAgent(id)`.
   - `GET /api/team/agents/:id/history` → `agentService.getAgentHistory(id)`.
   - Зарегистрировать в `app.js`: `app.use('/api/team/agents', requireAuth, agentsRouter)`.

4. **Обнови страницу «Сотрудники»** (`frontend/src/app/blog/team/staff/page.tsx`):
   - Замени заглушку из Сессии 3 на реальное содержимое.
   - При загрузке — `GET /api/team/agents` через `fetchBackend`.
   - Если массив пуст — показывать: заголовок «Сотрудники», параграф «В команде пока нет агентов. Добавьте первого сотрудника через мастер создания.», кнопка «+ Добавить сотрудника» (disabled, с tooltip «Появится в следующем обновлении» — мастер создания будет в пункте 12).
   - Если агенты есть — список карточек (простой, без мастера):
     - Аватар (placeholder-иконка если нет `avatar_url`).
     - Имя (`display_name`) + должность (`role_title`).
     - Департамент (бейдж: Аналитика / Предпродакшн / Продакшн).
     - Статус: зелёный кружок для `active`, серый для `paused`, иконка архива для `archived`.
     - Клик по карточке — пока ничего (карточка сотрудника — пункт 12). Можно сделать `cursor: default` или `cursor: not-allowed` с tooltip «Карточка появится в следующем обновлении».
   - Кнопка «+ Добавить сотрудника» сверху (disabled) — будет активирована в пункте 12.
   - Фильтр по статусу: «Все / Активные / Архив» (tabs или dropdown). По умолчанию — «Активные».

5. **Обнови `promptBuilder.js`** — в метод `buildPrompt()`:
   - Если передан `agentId` (а не только `agentName` как раньше), загружать Role-файл из `team-prompts/Должностные инструкции/${display_name}.md` (получить `display_name` через `agentService.getAgent(agentId)`).
   - Если `agentId` есть в БД, но Role-файла в Storage нет — слой `role` пропускается (как раньше), без ошибки.
   - Не ломать обратную совместимость: `agentName` продолжает работать как fallback.

6. **Не реализовывать в этой сессии:**
   - Мастер создания агента (три шага + голосовой черновик) — 🔁 пункт 12 (этап 2).
   - Карточку сотрудника (детальная страница с вкладками) — 🔁 пункт 12 (этап 2).
   - Awareness-блок в промпте (карта команды + карта баз) — 🔁 пункт 12 (этап 2).
   - Инвалидацию кеша Role при изменении состава агентов — 🔁 пункт 12 (этап 2).
   - Handoff-механику между агентами — 🔁 пункт 8 (этап 2).
   - Уровень автономности 1 (самозадачи, триггеры) — 🔁 пункт 15 (этап 3).
   - Seed 5 агентов первой волны — агенты создаются через UI мастера в пункте 12.

**Что делать после сессии:**

1. Накатить миграцию `0013_team_agents.sql` через Supabase Dashboard → SQL Editor.
2. Проверить в Supabase Dashboard, что таблицы `team_agents` и `team_agent_history` созданы, FK на `team_agent_memory` добавлен.
3. Через `curl` с авторизацией:
   - `GET /api/team/agents` → пустой массив `[]`.
   - `POST /api/team/agents` с телом `{ "id": "test-scout", "display_name": "Тестовый разведчик", "role_title": "Аналитик-разведчик", "department": "analytics" }` → 201, вернёт созданного агента.
   - `GET /api/team/agents` → массив с одним агентом.
   - `GET /api/team/agents/roster` → `[{ id: "test-scout", display_name: "Тестовый разведчик", ... }]`.
   - `PATCH /api/team/agents/test-scout` с `{ "biography": "Следит за конкурентами", "comment": "Добавил биографию" }` → 200.
   - `GET /api/team/agents/test-scout/history` → две записи (created + biography_updated).
4. Теперь добавь тестовое правило через seed-memory для этого агента:
   ```bash
   npm run seed:memory -- --agent test-scout --rule "Всегда проверять три источника"
   ```
   Проверить: `GET /api/team/memory/test-scout/rules` → одно правило.
5. Локально: `npm run dev`. Открыть `/blog/team/staff` — увидеть карточку «Тестовый разведчик» с департаментом «Аналитика» и зелёным статусом.
6. Проверить фильтр: переключить на «Архив» → пусто. Через `curl` заархивировать агента (`DELETE /api/team/agents/test-scout`), обновить — агент в архиве. Восстановить (`POST /api/team/agents/test-scout/restore`).
7. Удалить тестовые данные:
   ```sql
   DELETE FROM team_agent_memory WHERE agent_id = 'test-scout';
   DELETE FROM team_agent_history WHERE agent_id = 'test-scout';
   DELETE FROM team_agents WHERE id = 'test-scout';
   ```
8. Закоммитить, push, деплой. Накатить миграцию на проде.

**Критерии готовности:**

- Таблица `team_agents` существует со всеми полями: id, display_name, role_title, department, avatar_url, biography, status, database_access, available_tools, allowed_task_templates, orchestration_mode, autonomy_level, default_model, created_at, updated_at.
- Таблица `team_agent_history` существует с полями: id, agent_id, change_type, old_value, new_value, comment, created_at.
- FK от `team_agent_memory.agent_id` к `team_agents.id` с CASCADE-удалением.
- `agentService` реализует все методы: list, get, create, update, archive, restore, getHistory, getRoster.
- API-маршруты за `requireAuth`: GET list, GET roster, GET by id, POST create, PATCH update, DELETE archive, POST restore, GET history — все работают.
- Страница `/blog/team/staff` показывает список агентов из БД (или пустое состояние с заглушкой кнопки «Добавить»).
- Фильтр по статусу работает (Активные / Архив / Все).
- При создании/обновлении/архивации агента — запись в `team_agent_history`.
- `promptBuilder.js` умеет загружать Role по `agentId` (через lookup `display_name`), обратная совместимость с `agentName` сохранена.
- Никаких регрессий в OAuth, лимитах, Инструкциях, Базах, Memory, Mission/Goals.

**Отклонения:** Миграция названа `0017_team_agents.sql` (а не `0013`) — в проекте сквозная нумерация, последняя применённая была `0016_team_agent_memory.sql`. Role-файл агента читается из `team-prompts/roles/<display_name>.md`, а не `team-prompts/Должностные инструкции/<display_name>.md` — Supabase Storage отбивает не-ASCII в путях (см. комментарий в `backend/src/routes/team/instructions.js`); UI-метка «Должностные инструкции» соответствует Storage-папке `roles/`.

---

### Сессия 10 — Мастер создания агента + Awareness (этап 2, пункт 12) ✅ 2026-05-11

**Цель:** Реализовать мастер создания агента из трёх шагов (Кто это → Должностная → Настройки и проверка) с голосовым черновиком Role через существующий LLM-клиент, тестовый полигон, сохранение Role-файла в Storage, seed rules в `team_agent_memory`, Awareness-блок в `promptBuilder.js`, активация кнопки «+ Добавить сотрудника» на странице Сотрудников.

**Что делать до сессии:**

- Убедиться, что миграция `0013_team_agents.sql` (Сессия 9) накачена. Следующая будет `0014_team_agents_extend.sql`.

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0014_team_agents_extend.sql`:
   ```sql
   -- Поля «Зачем нужен» и «Критерий успеха» — защита от размножения агентов
   ALTER TABLE team_agents
     ADD COLUMN IF NOT EXISTS purpose TEXT,           -- «Этот агент решает задачу, которую не решает никто из существующих? Какую именно?»
     ADD COLUMN IF NOT EXISTS success_criteria TEXT;   -- «Критерий успеха через 2 недели работы»

   COMMENT ON COLUMN team_agents.purpose IS 'Обязательное при создании. Защита от размножения агентов — заставляет подумать перед созданием.';
   COMMENT ON COLUMN team_agents.success_criteria IS 'Обязательное при создании. Оценочный критерий через 2 недели — оставить или убрать агента.';
   ```

2. **Создай страницу мастера создания** `frontend/src/app/blog/team/staff/create/page.tsx`:
   - **Шаг 1 — «Кто это»:**
     - Поля: `display_name` (текст, обязательное), `avatar_url` (загрузка файла в Supabase Storage bucket `team-database/avatars/` или текстовое поле для эмодзи — на твоё усмотрение, главное чтобы аватар отображался), `role_title` (текст, обязательное), `department` (select: Аналитика / Предпродакшн / Продакшн / Без департамента), `biography` (textarea, обязательное, подсказка: «2–3 предложения: тон общения, характер, как помогает»).
     - Два обязательных textarea: `purpose` («Этот агент решает задачу, которую не решает никто из существующих? Какую именно?») и `success_criteria` («Критерий успеха через 2 недели работы — что должно произойти, чтобы оставить агента?»).
     - Кнопка «Далее» активна, только если все обязательные поля заполнены.
     - Автогенерация `id` (slug) из `display_name`: транслитерация кириллицы → lowercase → дефисы вместо пробелов. Показывать превью slug под полем имени. Дать возможность отредактировать вручную.
   - **Шаг 2 — «Должностная»:**
     - Два режима (табы или radio): «Написать самому» / «Сформулировать через диалог».
     - **Режим «Написать самому»:** textarea с markdown-редактором, подсказка-шаблон:
       ```
       ## Зона ответственности
       [Что делает этот агент]

       ## Методология работы
       [Как подходит к задачам]

       ## Принципы
       - [принцип 1]
       - [принцип 2]

       ## Что НЕ делает
       - [ограничение 1]
       ```
     - **Режим «Сформулировать через диалог» (голосовой черновик):**
       - Чат-интерфейс внутри шага. Поле ввода текста + кнопка микрофона (использует существующую Whisper-инфраструктуру Потока для транскрипции голоса).
       - При отправке первого сообщения (голосового или текстового) — вызов бэкенда `POST /api/team/agents/draft-role` с текстом описания + `display_name` + `role_title`.
       - Бэкенд собирает промпт: системный (ты — помощник для создания должностной инструкции агента AI-редакции блога об истории и культуре России; задай уточняющие вопросы, потом сформируй Role-файл по шаблону: Зона ответственности / Методология / Принципы / Что НЕ делает) + пользовательский ввод. Вызывает LLM через существующий `llmClient.js` с первой доступной моделью Anthropic из `team_api_keys` (или hardcoded `claude-sonnet-4-20250514` если модель не задана). Расход пишется в `team_api_calls` с `agent_id = 'system'` и `purpose = 'role_draft'`.
       - Ответ LLM показывается в чате. Влад отвечает (текстом или голосом). Цикл повторяется до 5 обменов.
       - Когда LLM возвращает финальный Role-файл (распознаётся по наличию `## Зона ответственности` в ответе) — автоматически копируется в textarea режима «Написать самому» для финальной правки.
       - Кнопка «Вставить в редактор» под последним ответом LLM — принудительно копирует текст.
     - Кнопка «Далее» активна, если textarea Role непустой (минимум 100 символов).
   - **Шаг 3 — «Настройки и проверка»:**
     - `default_model` — select из списка моделей. Источник: `GET /api/team/admin/models` (или из существующего механизма получения списка моделей в Админке). Если такого эндпоинта нет — hardcode список `['claude-sonnet-4-20250514', 'gemini-2.0-flash', 'gpt-4o-mini']` с пометкой TODO.
     - `database_access` — пока disabled с подписью «Настройка доступов к базам появится после создания». Заполняется через карточку агента.
     - `available_tools` — пока disabled, аналогично.
     - `allowed_task_templates` — пока disabled, аналогично.
     - **Seed rules:** textarea, одно правило на строку. Подсказка: «Стартовые правила для агента. Одно правило — одна строка. Например: "Вступление не больше двух предложений"».
     - **Тестовый полигон:**
       - Заголовок «Проверить агента».
       - Textarea «Тестовый запрос» + кнопка «Проверить».
       - При клике — `POST /api/team/agents/test-run` с `{ role: <текст Role из шага 2>, seed_rules: [...], model: <выбранная модель>, query: <тестовый запрос> }`.
       - Бэкенд собирает промпт: Mission (из Storage) + Role (из body) + seed rules как Memory + тестовый запрос как задача. Вызывает LLM. Расход пишется с `purpose = 'test_run'`.
       - Ответ показывается под полем запроса. Влад может править Role/rules на шаге 2 (кнопка «Назад» сохраняет состояние) и проверить снова.
       - Тестовые прогоны НЕ сохраняются в `team_tasks`.
     - Кнопка **«Создать сотрудника»** — активна, если Role заполнен.
   - **При нажатии «Создать сотрудника»:**
     - `POST /api/team/agents` с полным набором полей (id, display_name, role_title, department, biography, avatar_url, purpose, success_criteria, default_model, seed_rules[]).
     - Бэкенд в `agentService.createAgent()`:
       - INSERT в `team_agents`.
       - Сохранение Role-файла: upload в Supabase Storage `team-prompts/Должностные инструкции/${display_name}.md`.
       - Если seed_rules непустые — `memoryService.addRule()` для каждого правила с `source = 'seed'`.
       - Запись в `team_agent_history` с `change_type = 'created'`.
     - Редирект на `/blog/team/staff` — новый агент виден в списке.

3. **Обнови `agentService.js`** (из Сессии 9):
   - Метод `createAgent()` — расширить: принимает `role_content` (текст Role) и `seed_rules` (массив строк). После INSERT — upload Role в Storage + добавление seed rules через `memoryService`.
   - Новый метод `async saveRoleFile(displayName, content)` — upload в `team-prompts/Должностные инструкции/${displayName}.md`.
   - Новый метод `async getRoleFile(displayName)` — download из Storage, вернуть текст или null.

4. **Создай эндпоинт `POST /api/team/agents/draft-role`** в `routes/team/agents.js`:
   - Принимает `{ messages: [{role, content}], display_name, role_title }`.
   - Системный промпт: «Ты помощник для создания должностной инструкции агента AI-редакции. Блог — история и культура России в стиле Парфёнова. Агент "${display_name}" (${role_title}). Задай 2–3 уточняющих вопроса, затем сформируй Role-файл по шаблону: ## Зона ответственности / ## Методология работы / ## Принципы / ## Что НЕ делает. Когда формируешь финальный файл, начни с ## Зона ответственности.»
   - Вызов `llmClient.callLLM()` с первым доступным Anthropic-ключом из `team_api_keys`.
   - Запись расхода в `team_api_calls` с `agent_id = 'system'`, `purpose = 'role_draft'`.
   - Ответ: `{ response: "текст LLM" }`.

5. **Создай эндпоинт `POST /api/team/agents/test-run`** в `routes/team/agents.js`:
   - Принимает `{ role, seed_rules, model, query }`.
   - Собирает промпт через `promptBuilder.buildPrompt()` с подстановкой: Mission (из Storage) + Role (из body, не из Storage) + seed_rules как Memory + query как задача.
   - Вызов LLM через `llmClient.callLLM()`.
   - Запись расхода с `purpose = 'test_run'`.
   - Ответ: `{ response: "текст LLM", tokens: { input, output } }`.

6. **Реализуй Awareness-блок в `promptBuilder.js`:**
   - Новый метод `async buildAwareness(agentId)`:
     - Загружает roster: `agentService.getAgentRoster()` — массив `[{ id, display_name, role_title, department }]` (только активные, paused и archived исключены).
     - Загружает карту баз: `customDatabaseService.listDatabases()` — массив баз из `team_custom_databases`.
     - Для текущего агента — загружает `database_access` из `team_agents`.
     - Формирует текстовый блок:
       ```
       ## Awareness — Карта команды

       Активные сотрудники:
       - Маша (Аналитик-разведчик, Аналитика)
       - Алексей (Редактор-сценарист, Предпродакшн)
       - ...

       ## Awareness — Доступные базы

       - Референсы — видеореференсы для блога [read]
       - Конкуренты — таблицы транскрипций конкурентов [нет доступа]
       ```
     - Если roster пуст — блок пропускается.
   - Подкладывать Awareness **внутрь слоя Role** (как суффикс после содержимого Role-файла). Не отдельный слой — решение из пункта 7.
   - Awareness кешируется вместе с Role (`cache_control: ephemeral`).
   - **Инвалидация:** при изменении состава агентов (create / archive / restore / pause) — пометить кеш Role всех активных агентов как невалидный. Реализовать через простой флаг `awarenessVersion` в памяти процесса (инкрементируется при каждом изменении состава), который сравнивается с версией при последней сборке промпта. Если версия изменилась — перезагрузить Awareness.

7. **Обнови страницу «Сотрудники»** (`staff/page.tsx` из Сессии 9):
   - Кнопка «+ Добавить сотрудника» теперь **активна** — ведёт на `/blog/team/staff/create`.
   - Клик по карточке агента — ведёт на `/blog/team/staff/[id]` (карточка сотрудника, Сессия 11).

8. **Обнови `GET /api/team/instructions/list`** (Сессия 4):
   - Категория `roles` теперь возвращает список файлов из `team-prompts/Должностные инструкции/` (вместо пустого массива).
   - На странице Инструкций → блок «Должностные инструкции» показывает реальные файлы, кликабельные для редактирования (альтернативный путь правки Role).

9. **Не реализовывать в этой сессии:**
   - Карточку сотрудника (детальная страница `/blog/team/staff/[id]`) — Сессия 11.
   - Поле `allowed_task_templates` (заполняемое) — 🔁 пункт 14 (этап 3).
   - Поле `available_tools` (заполняемое) — 🔁 пункт 16 (этап 3).
   - Третью секцию Awareness (инструменты) — 🔁 пункт 16 (этап 3).
   - Telegram-привязку — 🔁 пункт 20 (этап 6).
   - Вкладку «Дневник» для агентов с уровнем 1 — 🔁 пункт 15 (этап 3).

**Что делать после сессии:**

1. Накатить миграцию `0014_team_agents_extend.sql` через Supabase Dashboard → SQL Editor.
2. Локально: `npm run dev`. Открыть `/blog/team/staff` → нажать «+ Добавить сотрудника».
3. Пройти мастер:
   - Шаг 1: заполнить имя «Тест», должность «Тестовый агент», департамент «Аналитика», биографию, purpose, criteria. Далее.
   - Шаг 2: выбрать «Сформулировать через диалог», наговорить или написать описание. Получить черновик Role от LLM. Нажать «Вставить в редактор». Далее.
   - Шаг 3: выбрать модель. Написать seed rule. Ввести тестовый запрос, нажать «Проверить» — увидеть ответ агента. «Создать сотрудника».
4. На странице Сотрудников — видеть нового агента. В Supabase Dashboard — запись в `team_agents`, записи в `team_agent_memory` (seed rules), запись в `team_agent_history`.
5. В bucket `team-prompts` → `Должностные инструкции/` — файл `Тест.md` с содержимым Role.
6. Поставить тестовую задачу с `agentId: 'тест'` — в превью промпта видеть слой Role + Awareness (карта команды с одним агентом + карта баз).
7. На странице Инструкции → «Должностные инструкции» — видеть файл «Тест», кликнуть — открыть редактор.
8. Удалить тестовые данные. Закоммитить, push, деплой. Накатить миграцию на проде.

**Критерии готовности:**

- Мастер создания работает: три шага, кнопка «Создать» в конце создаёт агента в БД + Role-файл в Storage + seed rules в Memory.
- Голосовой черновик Role: чат с LLM внутри шага 2 работает (текст и/или голос), черновик переносится в textarea.
- Тестовый полигон: запрос → ответ LLM на основе Role + seed rules + Mission. Тестовые прогоны не сохраняются в `team_tasks`.
- Awareness-блок: при сборке промпта для агента — в слое Role после содержимого Role-файла добавляется «Карта команды» + «Доступные базы».
- При создании/архивации/восстановлении агента — Awareness перегенерируется для всех.
- Страница Сотрудников: кнопка «+ Добавить» ведёт на мастер; клик по карточке — пока ведёт на заглушку `/blog/team/staff/[id]`.
- Страница Инструкции: «Должностные инструкции» показывает реальные файлы агентов.
- Поля `purpose` и `success_criteria` обязательны при создании, сохраняются в `team_agents`, не идут в промпт.
- Автогенерация slug из имени работает; slug можно отредактировать вручную.
- Никаких регрессий.

---

### Сессия 11 — Карточка сотрудника (этап 2, пункт 12) ✅ 2026-05-11

**Цель:** Создать детальную страницу агента `/blog/team/staff/[id]` с отображением всех полей, inline-редактированием Role/биографии/seed rules, вкладкой Memory (правила + эпизоды), историей изменений, управлением статусом (active/paused/archived).

**Что делать до сессии:**

- Ничего. Все изменения — фронтенд + минимальные расширения API.

**ТЗ для Claude Code:**

1. **Создай страницу** `frontend/src/app/blog/team/staff/[id]/page.tsx`:
   - Загрузка: `GET /api/team/agents/${id}`.
   - Если агент не найден — 404-экран.
   - **Шапка карточки:**
     - Аватар (крупный), имя (`display_name`), должность (`role_title`), департамент (бейдж).
     - Статус: зелёный «Активен» / серый «Приостановлен» / красный «В архиве».
     - Кнопки управления статусом:
       - Если `active`: «Приостановить» (→ `paused`) и «Архивировать» (→ `archived`, с confirm-диалогом).
       - Если `paused`: «Вернуть в работу» (→ `active`).
       - Если `archived`: «Восстановить из архива» (→ `active`).
     - Кнопка «Поставить задачу» (disabled с tooltip «Появится в следующем обновлении» — 🔁 пункт 14).
   - **Секция «О сотруднике»:**
     - Биография — отображение + кнопка «Редактировать» → inline textarea с сохранением через `PATCH /api/team/agents/${id}`.
     - «Зачем нужен» (`purpose`) — read-only, серый блок.
     - «Критерий успеха» (`success_criteria`) — read-only, серый блок.
     - Модель по умолчанию — select с сохранением.
   - **Секция «Должностная инструкция» (Role):**
     - Содержимое Role-файла из Storage (через `GET /api/team/agents/${id}/role`).
     - Кнопка «Редактировать» → inline markdown-editor (тот же компонент, что в Инструкциях).
     - При сохранении: `PUT /api/team/agents/${id}/role` → перезаписывает файл в Storage + запись в `team_agent_history` с `change_type = 'role_updated'`.
   - **Секция «Память» (вкладки: Правила / Эпизоды):**
     - **Вкладка «Правила»:** список из `GET /api/team/memory/${id}/rules`. Каждое правило: текст + кнопки «Редактировать» / «Архивировать» / pin-toggle. Кнопка «+ Добавить правило» → inline textarea + сохранение через `POST /api/team/memory/${id}` с `type = 'rule'`, `source = 'manual'`.
     - **Вкладка «Эпизоды»:** список из `GET /api/team/memory/${id}?type=episode`. Read-only. Каждый эпизод: текст + оценка (0–5) + дата + ссылка на задачу. Пагинация (по 20).
   - **Секция «Доступы» (disabled):**
     - Три блока: «Базы данных», «Инструменты», «Шаблоны задач» — все с текстом «Настройка появится в следующем обновлении». Placeholder для пунктов 13/14/16.
   - **Секция «История изменений» (раскрывающаяся):**
     - Список из `GET /api/team/agents/${id}/history`.
     - Формат: дата + тип изменения + дельта (old → new, если есть) + комментарий.

2. **Добавь эндпоинты** в `routes/team/agents.js`:
   - `GET /api/team/agents/:id/role` → `agentService.getRoleFile(display_name)`. Возвращает `{ content: "..." }` или `{ content: null }`.
   - `PUT /api/team/agents/:id/role` → принимает `{ content, comment? }`. Перезаписывает Role-файл в Storage. Запись в `team_agent_history` с `change_type = 'role_updated'`, `old_value = <предыдущий текст>`, `new_value = <новый текст>`, `comment`.

3. **Обнови карточки на странице Сотрудников** (`staff/page.tsx`):
   - Клик по карточке агента — переход на `/blog/team/staff/${agent.id}`.

4. **Не реализовывать в этой сессии:**
   - Кнопку «Поставить задачу» (рабочую) — 🔁 пункт 14 (этап 3).
   - Заполняемые доступы к базам/инструментам/шаблонам — 🔁 пункты 13/14/16.
   - Вкладку «Навыки (Skills)» — 🔁 пункт 10 (этап 4).
   - Вкладку «Дневник» — 🔁 пункт 15 (этап 3).
   - Счётчик токенов промпта — 🔁 пункт 11 (этап 4).

**Что делать после сессии:**

1. Локально: `npm run dev`. Создать тестового агента через мастер (Сессия 10). Кликнуть по карточке → попасть на детальную страницу.
2. Проверить: биография отображается, можно редактировать inline. Role-файл отображается, можно редактировать. При сохранении — запись в истории.
3. Добавить правило через «+ Добавить правило» — появляется в списке.
4. Приостановить агента → статус меняется, в списке Сотрудников — серая плашка. Вернуть в работу.
5. Архивировать → confirm → в списке переключить фильтр на «Архив» → агент там. Восстановить.
6. Проверить историю изменений: видны все операции с датами.
7. Удалить тестовые данные. Закоммитить, push, деплой.

**Критерии готовности:**

- Страница `/blog/team/staff/[id]` загружается, отображает все поля агента.
- Inline-редактирование биографии работает с сохранением в БД + запись в history.
- Inline-редактирование Role работает с сохранением в Storage + запись в history.
- Управление статусом: active ↔ paused ↔ archived — все переходы работают, Awareness пересчитывается.
- Вкладка «Правила»: CRUD правил (добавить / редактировать / архивировать / pin).
- Вкладка «Эпизоды»: read-only список с пагинацией.
- «Доступы» — placeholder-блоки.
- «История изменений» — раскрывающаяся секция с записями.
- Никаких регрессий.

---

### Сессия 12 — Инвалидация кеша и интеграция Role в задачи (этап 2, пункт 12) ✅ 2026-05-11

**Цель:** Реализовать немедленную инвалидацию prompt-кеша при правке инструктивных файлов (Mission, Role, Goals), связать `agent_id` с `team_tasks` для биллинга по агентам, обновить форму постановки задач для выбора агента.

**Что делать до сессии:**

- Убедиться, что миграция `0014` накачена. Следующая будет `0015_tasks_agent_id.sql`.

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0015_tasks_agent_id.sql`:
   ```sql
   ALTER TABLE team_tasks
     ADD COLUMN IF NOT EXISTS agent_id TEXT REFERENCES team_agents(id);

   CREATE INDEX idx_team_tasks_agent ON team_tasks(agent_id);

   COMMENT ON COLUMN team_tasks.agent_id IS 'Агент-исполнитель задачи. Для биллинга по агентам и фильтрации.';

   -- Обновляем team_api_calls: добавляем agent_id для поагентной статистики расходов
   ALTER TABLE team_api_calls
     ADD COLUMN IF NOT EXISTS agent_id TEXT;

   CREATE INDEX idx_team_api_calls_agent ON team_api_calls(agent_id);
   ```

2. **Реализуй инвалидацию prompt-кеша** в `promptBuilder.js`:
   - Добавь внутренний счётчик `instructionVersion` (in-memory, number, начинается с 0).
   - Экспортируй функцию `invalidatePromptCache()` — инкрементирует `instructionVersion`.
   - В `buildPrompt()`: передавай `instructionVersion` как часть cache-break ключа для `cache_control`. Anthropic prompt caching привязан к содержимому — при изменении содержимого кеш уже инвалидируется; но для случаев, когда файл обновлён в Storage, а бэкенд ещё держит старую версию в памяти: при вызове `buildPrompt()` всегда перечитывать файлы из Storage (без локального кеширования слоёв в памяти Node.js).
   - Если в `promptBuilder.js` есть in-memory кеш загруженных файлов — удалить его или инвалидировать при вызове `invalidatePromptCache()`.
   - Вызывать `invalidatePromptCache()` из:
     - `agentService.updateAgent()` (при изменении любого поля).
     - `agentService.createAgent()` / `archiveAgent()` / `restoreAgent()` (Awareness меняется).
     - Эндпоинта сохранения Role-файла (`PUT /api/team/agents/:id/role`).
     - Эндпоинта сохранения файлов Инструкций (Mission, Goals — тот, что используется страницей Инструкций для сохранения).

3. **Обнови форму постановки задачи** на дашборде (`/blog/team/dashboard`):
   - Добавь **select «Сотрудник»** — список активных агентов из `GET /api/team/agents?status=active`. Опциональный (можно не выбирать — задача без агента, как раньше).
   - При выборе агента — его `id` передаётся в `POST /api/team/tasks` как `agent_id`.
   - `taskRunner.js` при запуске задачи: если `agent_id` передан — `buildPrompt()` с `agentId`, что подтягивает Role + Memory + Awareness.

4. **Обнови `taskRunner.js` и `costTracker.js`:**
   - При записи в `team_api_calls` — передавать `agent_id` (из задачи или `'system'`).
   - Новый метод в `costTracker.js`: `getSpentByAgent(agentId, { period })` — расходы по конкретному агенту за период.

5. **Не реализовывать в этой сессии:**
   - Полноценную страницу биллинга по агентам в Админке — 🔁 пункт 1 (этап 7).
   - Фильтрацию шаблонов задач по `allowed_task_templates` — 🔁 пункт 14 (этап 3).

**Что делать после сессии:**

1. Накатить миграцию `0015_tasks_agent_id.sql`.
2. Создать тестового агента. На дашборде — выбрать его в select, поставить задачу.
3. В Railway Logs — видеть `layers_loaded: ['mission', 'role', 'goals', 'memory']` (если есть правила).
4. В `team_api_calls` — проверить, что `agent_id` записан.
5. Изменить Role агента через карточку → поставить ещё задачу → в промпте видеть обновлённый Role (кеш инвалидирован).
6. Удалить тестовые данные. Закоммитить, push, деплой. Накатить миграцию на проде.

**Критерии готовности:**

- Колонка `agent_id` в `team_tasks` и `team_api_calls` — создана, индексирована.
- На дашборде — select «Сотрудник» с активными агентами. При выборе — задача привязывается к агенту, промпт собирается с Role + Memory + Awareness.
- Инвалидация кеша: после правки Role/Mission/Goals — следующая задача использует обновлённое содержимое.
- Расходы записываются с `agent_id` — готово для будущего биллинга.
- Без выбора агента — задача работает как раньше (обратная совместимость).
- Никаких регрессий.

**Отклонения:** Миграция получила сквозной номер `0019_team_tasks_agent_id.sql` (в проекте уже 0008–0018, ТЗ ссылалось на «0015» по локальной нумерации Claude_team_stage2.md). `team_api_calls.agent_id` уже был добавлен в `0018` (без FK) — здесь добавлен только общий (не partial) индекс для будущих агрегаций. Маркер `instructionVersion` в cache_control не вшивается в текст слоя: Anthropic content-keyed cache и так срабатывает на правки, а в коде остался публичный `getInstructionVersion()` для отладки + `invalidatePromptCache()` сбрасывает in-memory Awareness.

---

### Сессия 13 — Handoff и цепочки задач (этап 2, пункт 8) ✅ 2026-05-11

**Цель:** Реализовать механику передачи задач между агентами: `parent_task_id` в `team_tasks`, кнопка «Передать дальше» на завершённой задаче, форма handoff с преднабором брифа от агента-источника, отображение цепочек задач в логе, инструкция агентам предлагать handoff через Awareness.

**Что делать до сессии:**

- Убедиться, что миграция `0015_tasks_agent_id.sql` (Сессия 12) накачена. Следующая будет `0016_handoff.sql`.

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0016_handoff.sql`:
   ```sql
   ALTER TABLE team_tasks
     ADD COLUMN IF NOT EXISTS parent_task_id TEXT;

   CREATE INDEX idx_team_tasks_parent ON team_tasks(parent_task_id);

   COMMENT ON COLUMN team_tasks.parent_task_id IS 'ID родительской задачи при handoff. Образует цепочку задач для трассировки пайплайна.';
   ```

2. **Расширь системный промпт агентов** — в `promptBuilder.js`, в блоке Awareness (после карты команды и карты баз), добавь инструкцию:
   ```
   ## Рекомендации по передаче

   Если результат твоей работы может быть полезен другому сотруднику для продолжения,
   добавь в конце ответа блок:

   ---
   **Suggested Next Steps:**
   - [Имя сотрудника]: [краткое описание задачи, которую стоит поставить]
   - [Имя сотрудника]: [ещё одно предложение, если есть]
   ---

   Блок необязательный. Добавляй только если передача действительно имеет смысл.
   Ты предлагаешь — решение за Владом.
   ```

3. **Расширь `taskRunner.js`** — после получения ответа LLM:
   - Парсить ответ на наличие блока `**Suggested Next Steps:**`.
   - Если блок найден — извлечь массив предложений `[{ agent_name, suggestion }]`.
   - Сохранить в `team_tasks` (в поле артефакта или в отдельном JSONB-поле `suggested_next_steps`) как часть результата задачи.

4. **Создай компонент формы handoff** на фронтенде:
   - Кнопка **«Передать дальше»** появляется на карточке задачи со статусом `done` (в логе задач на дашборде).
   - При клике — модальное окно:
     - **«Кому»** — select с активными агентами из `GET /api/team/agents?status=active`. Если есть `suggested_next_steps` — агент из первого предложения преселектирован.
     - **«Бриф»** — textarea. Если есть `suggested_next_steps` — текст из первого предложения преднабран. Влад может править.
     - **«Контекст из родительской задачи»** — чекбокс «Прикрепить артефакт» (включён по умолчанию). При включении — содержимое артефакта родительской задачи автоматически добавляется в пользовательский ввод новой задачи.
     - **«Прикрепить базы»** — disabled мультиселект с placeholder «Появится в следующем обновлении» (🔁 пункт 13, базы при handoff).
     - Кнопка **«Создать задачу»** — `POST /api/team/tasks` с `{ agent_id, parent_task_id, user_input (бриф + контекст) }`.
   - После создания — редирект на лог задач, новая задача видна с пометкой цепочки.

5. **Отобрази цепочки задач в логе** на дашборде:
   - Если у задачи есть `parent_task_id` — показать тонкую связь-стрелку или текстовую пометку: «← из задачи "[название]" ([имя агента])».
   - При клике на пометку — переход к родительской задаче.
   - Если у задачи есть дочерние (другие задачи ссылаются на неё через `parent_task_id`) — показать «→ передано в "[название]" ([имя агента])».
   - Формат: компактный, не ломает существующую вёрстку лога.

6. **Добавь эндпоинт** `GET /api/team/tasks/:id/chain` — возвращает цепочку задач от корневой до текущей:
   - Рекурсивно проходит по `parent_task_id` вверх до задачи без родителя.
   - Затем находит все дочерние задачи (рекурсивно вниз).
   - Возвращает: `{ chain: [{ id, title, agent_name, status, parent_task_id }], current_index: N }`.

7. **Не реализовывать в этой сессии:**
   - Режим оркестрации шефа (план дня, утверждение, permission на автоматический handoff) — это надстройка на той же инфраструктуре, откладывается до обкатки базового handoff в реальной работе.
   - Аудит-трейл сессии оркестрации — открытый вопрос, не блокирует.
   - Handoff в Inbox внимания (автоматическое создание элемента инбокса из `suggested_next_steps`) — 🔁 пункт 14 (этап 3, Inbox).
   - Прикрепление баз при handoff с фильтрацией по permissions — 🔁 пункт 13/14 (этапы 1/3).
   - Автоматические цепочки (исследователь → сценарист → фактчекер без кликов Влада) — ❌ осознанно.
   - Правила роутинга («все задачи типа X → агенту Y») — ❌ осознанно.

**Что делать после сессии:**

1. Накатить миграцию `0016_handoff.sql` через Supabase Dashboard → SQL Editor.
2. Создать двух тестовых агентов через мастер (Сессия 10). Поставить задачу первому агенту.
3. Дождаться ответа. Если агент предложил Suggested Next Steps — увидеть преднабранный бриф в форме handoff. Если нет — ввести бриф вручную.
4. Нажать «Передать дальше» → выбрать второго агента → «Создать задачу».
5. В логе задач — видеть стрелку связи между задачами. Кликнуть — перейти к родителю.
6. `GET /api/team/tasks/:id/chain` — видеть цепочку из двух задач.
7. Удалить тестовые данные. Закоммитить, push, деплой. Накатить миграцию на проде.

**Критерии готовности:**

- Колонка `parent_task_id` в `team_tasks` — создана, индексирована.
- На завершённой задаче — кнопка «Передать дальше». При клике — модальное окно с формой handoff.
- Если агент вернул `Suggested Next Steps` — бриф и агент преднабраны в форме.
- Если нет — форма пустая, Влад заполняет вручную.
- Артефакт родительской задачи прикрепляется как контекст (чекбокс, включён по умолчанию).
- Новая задача создаётся с `parent_task_id` → промпт собирается с Role + Memory + Awareness целевого агента.
- В логе задач — визуальная связь родитель ↔ дочерняя. Клик — переход.
- Эндпоинт `/api/team/tasks/:id/chain` — возвращает полную цепочку.
- Жёсткие границы: handoff только по клику Влада, никаких правил роутинга, агент предлагает — не создаёт.
- Никаких регрессий.

**Отклонения:**
- **Миграция переименована в `0021_team_tasks_handoff.sql`** — сквозная нумерация проекта (последняя применённая была `0020_team_dev_mode.sql`), не локальная `0016` из ТЗ.
- **Шаблон новой задачи при handoff — `ideas_free`.** ТЗ ничего конкретного не предписывает; `ideas_free` универсален, не требует обязательных полей кроме `user_input`, и при handoff бриф уже подставлен из Suggested Next Step. Полноценный выбор шаблона в форме handoff сделает Сессия 17.
- **Маршрут перехода к родительской задаче** — пока через title-ссылку в шапке `TaskViewerModal` без отдельной страницы `/blog/team/tasks/[id]`: единственный entry point — клик по карточке в логе. Полноценные deep-links на задачи появятся в Сессии 43 (пункт 22).
- **Кнопка "Передать дальше"** появляется только для статусов `done` и `marked_done`. Errored / running задачи передавать нельзя.

---

### Сессия 14 — Парсер обратной связи и таблица эпизодов (этап 2, пункт 9) ✅ 2026-05-11

**Цель:** Создать таблицу `team_feedback_episodes`, сервис `feedbackParserService.js` с парсингом оценок/комментариев через LLM, интегрировать парсер в flow завершения задачи (оценка 0–5 + комментарий «чего не хватило»), UI оценки задачи на дашборде.

**Что делать до сессии:**

- Убедиться, что миграция `0016_handoff.sql` (Сессия 13) накачена. Следующая будет `0017_feedback_episodes.sql`.

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0017_feedback_episodes.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS team_feedback_episodes (
     id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
     agent_id TEXT NOT NULL REFERENCES team_agents(id) ON DELETE CASCADE,
     task_id TEXT,                       -- из какой задачи (nullable для комментариев вне задачи)
     channel TEXT NOT NULL CHECK (channel IN ('task_card', 'telegram', 'edit_diff')),
     score INTEGER CHECK (score >= 0 AND score <= 5),  -- nullable для текстовых без оценки
     raw_input TEXT NOT NULL,            -- сырой текст: комментарий, diff, голосовая расшифровка
     parsed_text TEXT,                   -- нейтрализованное наблюдение от LLM (nullable до парсинга)
     status TEXT DEFAULT 'active' CHECK (status IN ('active', 'compressed_to_rule', 'dismissed', 'archived')),
     created_at TIMESTAMPTZ DEFAULT now()
   );

   CREATE INDEX idx_feedback_episodes_agent ON team_feedback_episodes(agent_id);
   CREATE INDEX idx_feedback_episodes_agent_status ON team_feedback_episodes(agent_id, status);
   CREATE INDEX idx_feedback_episodes_task ON team_feedback_episodes(task_id);

   COMMENT ON TABLE team_feedback_episodes IS 'Эпизоды обратной связи: сырой фидбэк Влада, нейтрализованный LLM. Не попадают в промпт — служат сырьём для сжатия в правила.';
   ```

2. **Создай сервис** `backend/src/services/team/feedbackParserService.js`:
   - `async parseAndSave({ agentId, taskId, channel, score, rawInput })`:
     - Вызывает LLM через `llmClient.callLLM()` с первым доступным ключом из `team_api_keys` (любой провайдер, Влад выбирает сам).
     - Системный промпт парсера:
       ```
       Ты обрабатываешь обратную связь Влада агенту AI-редакции.
       Переформулируй реакцию в нейтральное наблюдение от третьего лица,
       привязанное к контексту задачи.
       Не классифицируй, не оценивай полярность (оценка уже есть).
       Верни только переформулированный текст, без пояснений.
       ```
     - Пользовательский промпт: `Оценка: ${score}/5. Комментарий: "${rawInput}". Задача: "${taskTitle}".`
     - Сохраняет в `team_feedback_episodes` с `parsed_text` из ответа LLM.
     - Записывает расход в `team_api_calls` с `agent_id = 'system'`, `purpose = 'feedback_parse'`.
     - Возвращает созданный эпизод.
   - `async getEpisodes(agentId, { status = 'active', limit = 50 } = {})` — список эпизодов с фильтрацией.
   - `async getEpisodeCount(agentId, { status = 'active' } = {})` — количество активных эпизодов (для триггера сжатия).
   - `async dismissEpisode(id)` — `UPDATE ... SET status = 'dismissed'`.
   - `async archiveOldEpisodes(agentId, { olderThanDays = 90 } = {})` — архивация эпизодов старше N дней.
   - Сообщения об ошибках на русском.

3. **Интегрируй оценку задачи в flow завершения** — обнови дашборд (`/blog/team/dashboard`):
   - На карточке задачи со статусом `done` добавь блок **«Оценить»**:
     - 6 кнопок (0–5) в ряд. Подсветка при наведении: 0-1 красный, 2-3 жёлтый, 4-5 зелёный.
     - Если оценка < 5 — раскрывается textarea **«Чего не хватило?»** (обязательная) + кнопка микрофона для голосового ввода (Whisper-инфраструктура Потока).
     - Если оценка = 5 — textarea необязательная, placeholder «Что особенно понравилось? (опционально)».
     - Кнопка **«Сохранить оценку»** → `POST /api/team/feedback` с `{ agent_id, task_id, score, comment }`.
   - Оценённая задача помечается визуально (иконка оценки на карточке).

4. **Создай маршруты** `backend/src/routes/team/feedback.js`:
   - `POST /api/team/feedback` → `feedbackParserService.parseAndSave(...)`. Принимает `{ agent_id, task_id, score, comment }`. `channel = 'task_card'`.
   - `GET /api/team/feedback/:agentId` → `feedbackParserService.getEpisodes(agentId)`. Query: `?status=active|all`, `?limit=50`.
   - `GET /api/team/feedback/:agentId/count` → `feedbackParserService.getEpisodeCount(agentId)`.
   - Зарегистрировать: `app.use('/api/team/feedback', requireAuth, feedbackRouter)`.

5. **Добавь вкладку «Эпизоды» в карточке сотрудника** (`/blog/team/staff/[id]`):
   - Обнови вкладку «Эпизоды» из Сессии 11: вместо `GET /api/team/memory/${id}?type=episode` (которая показывала пустой список) — теперь `GET /api/team/feedback/${id}`.
   - Каждый эпизод: оценка (цветной бейдж), `parsed_text` (нейтрализованный), дата, ссылка на задачу. Раскрывающийся блок `raw_input` (сырой текст).

6. **Не реализовывать в этой сессии:**
   - Diff-эпизоды (правки результата) — требуют UI редактирования артефакта с трекингом изменений. Откладывается.
   - Telegram-канал обратной связи — 🔁 пункт 20 (этап 6).
   - Фоновое сжатие эпизодов в правила (node-cron) — Сессия 15 ниже.
   - Curator — 🔁 пункт 15 (этап 3).
   - Профиль автора — отложен на 1–2 месяца жизни с командой.
   - Классификация эпизодов по категориям — ❌ осознанно.

**Что делать после сессии:**

1. Накатить миграцию `0017_feedback_episodes.sql`.
2. Создать тестового агента, поставить задачу, дождаться ответа.
3. Оценить задачу: нажать «3», написать «вступление слишком длинное», сохранить.
4. В Supabase Dashboard → `team_feedback_episodes`: видеть запись с `score = 3`, `raw_input`, `parsed_text` (нейтрализованный LLM).
5. В карточке агента → вкладка «Эпизоды» → видеть запись с цветным бейджем «3» и parsed-текстом.
6. Оценить задачу на «5» без комментария — эпизод НЕ создаётся (или создаётся пустой, на усмотрение — при score=5 без комментария парсить нечего).
7. Удалить тестовые данные. Закоммитить, push, деплой. Накатить миграцию на проде.

**Критерии готовности:**

- Таблица `team_feedback_episodes` существует со всеми полями и индексами.
- На карточке задачи `done` — блок оценки 0–5 + textarea + голосовой ввод.
- При сохранении оценки: LLM нейтрализует комментарий → эпизод сохраняется в БД.
- В карточке агента → «Эпизоды» — список с parsed_text, score, датой.
- API: POST feedback, GET episodes, GET count — работают за `requireAuth`.
- Расходы парсера записываются в `team_api_calls` с `purpose = 'feedback_parse'`.
- Никаких регрессий.

**Отклонения:**
- **Миграция получила номер `0022_team_feedback_episodes.sql`** — сквозная нумерация проекта (после `0021_team_tasks_handoff`), не локальная `0017` из ТЗ.
- **`channel` default = `'task_card'`** (как и в ТЗ); другие каналы (`telegram`, `edit_diff`) включены в CHECK constraint, но используются только начиная с Сессии 41 (Telegram голос) и отдельной сессии для diff-эпизодов (отложена).
- **Расход парсера записывается с `agent_id` агента (а не `'system'`)** — Сессия 14 не вводит «системного» биллинга, удобнее видеть стоимость парсинга на агенте, чьи эпизоды читаются. `purpose='feedback_parse'` помечает строки в team_api_calls.
- **При score=5 без комментария** эпизод всё равно сохраняется (с placeholder в raw_input «Оценка 5/5 без комментария», `parsed_text=null`) — для Curator'а это полезный сигнал «что нравится».
- **Если у задачи нет `agent_id`** — UI оценки прячется (показываем плашку «У задачи нет сотрудника»). Старые задачи этапа 1 без `agent_id` оценить нельзя — `team_feedback_episodes.agent_id` NOT NULL FK.
- **Кнопка «Сохранить оценку» в карточке задачи** (а не отдельная страница). После сохранения блок схлопывается в «✓ Оценка сохранена». Повторно оценить ту же задачу можно, переоткрыв карточку (новый эпизод).
- **Ссылка на задачу из эпизода** ведёт на `/blog/team/dashboard` (без deep-link на конкретную задачу — это Сессия 43, пункт 22).

---

### Сессия 15 — Сжатие эпизодов и экран «Кандидаты в правила» (этап 2, пункт 9) ✅ 2026-05-11

**Цель:** Реализовать npm-скрипт сжатия эпизодов в кандидаты в правила через LLM, экран «Кандидаты в правила» с approval gate (принять / принять с правкой / отклонить), обновить `team_agent_memory` для кандидатов.

**Что делать до сессии:**

- Убедиться, что миграция `0017` накачена и есть несколько тестовых эпизодов в `team_feedback_episodes`.

**ТЗ для Claude Code:**

1. **Создай скрипт** `backend/scripts/compress-episodes.js`:
   - Принимает `--agent <agentId>` (один агент) или `--all` (все активные).
   - Для каждого агента:
     - Загружает активные эпизоды из `team_feedback_episodes` с `status = 'active'`.
     - Загружает текущие правила из `team_agent_memory` с `type = 'rule'`, `status = 'active'`.
     - Если эпизодов < 3 — пропускает с логом «Недостаточно эпизодов для сжатия (${count}), нужно минимум 3».
     - Вызывает LLM через `llmClient.callLLM()`:
       - Системный промпт (из пункта 9):
         ```
         Ты обрабатываешь обратную связь Влада агенту [имя, роль].
         Ниже — список наблюдений за период.

         Выяви устойчивые паттерны, которые повторяются 2+ раз
         или сформулированы Владом как принципиальные.

         Для каждого паттерна предложи правило в формате:
         "<императив>, потому что <обоснование из эпизодов>".

         Правила короткие (одна-две строки), действенные, проверяемые.

         Не предлагай правил на основе единичного эпизода.
         Не дублируй существующие правила (список ниже).

         Ответь в формате JSON:
         { "candidates": [{ "rule": "текст правила", "based_on_episodes": ["uuid1", "uuid2"] }] }
         Если паттернов нет — верни { "candidates": [] }.
         ```
       - Пользовательский промпт: эпизоды (`parsed_text` + `score`) + существующие правила.
     - Парсит JSON-ответ. Для каждого кандидата:
       - INSERT в `team_agent_memory` с `type = 'rule'`, `status = 'candidate'`, `source = 'feedback'`, `source_episode_ids = [uuid1, uuid2]`.
     - Записывает расход с `purpose = 'compress_episodes'`.
     - Логирует: «Агент "${name}": ${count} эпизодов → ${candidates} кандидатов».
   - Добавить `npm run compress:episodes` в `package.json`.
   - Скрипт идемпотентный: если по тем же эпизодам уже есть кандидат — пропуск.

2. **Создай страницу** `frontend/src/app/blog/team/staff/candidates/page.tsx` — экран «Кандидаты в правила»:
   - Загрузка: `GET /api/team/memory/candidates` — все записи из `team_agent_memory` с `status = 'candidate'`, сгруппированные по агенту.
   - Для каждого кандидата — карточка:
     - Имя агента + аватар (шапка группы).
     - Текст правила.
     - Ссылки на эпизоды-источники (кликабельные, раскрывающиеся: `parsed_text` + `score`).
     - Три кнопки действия:
       - **«Принять»** → `PATCH /api/team/memory/${id}` с `{ status: 'active' }`. Правило становится активным, попадает в промпт.
       - **«Принять с правкой»** → раскрывается inline textarea с текстом правила. Влад правит → «Сохранить» → `PATCH` с `{ status: 'active', content: <новый текст> }`.
       - **«Отклонить»** → `PATCH` с `{ status: 'rejected' }`. Эпизоды-источники помечаются `status = 'dismissed'` в `team_feedback_episodes` (чтобы не всплывали повторно).
   - Если кандидатов нет — «Нет новых кандидатов. Запустите сжатие через `npm run compress:episodes`.»
   - Счётчик непросмотренных кандидатов в шапке страницы.

3. **Добавь эндпоинт** `GET /api/team/memory/candidates` в `routes/team/memory.js`:
   - `SELECT * FROM team_agent_memory WHERE status = 'candidate' ORDER BY created_at DESC`.
   - Джойн с `team_agents` для имени/аватара.

4. **Обнови `PATCH /api/team/memory/:id`** — при изменении `status` на `'rejected'`:
   - Если запись имеет `source_episode_ids` — обновить эти эпизоды в `team_feedback_episodes`: `SET status = 'dismissed'`.

5. **Добавь ссылку** на экран кандидатов в навигацию:
   - В карточке агента (Сессия 11) → секция «Память» → кнопка «Кандидаты в правила» → переход на `/blog/team/staff/candidates?agent=${id}`.
   - На странице Сотрудников → общая кнопка «Кандидаты в правила (N)» в шапке → `/blog/team/staff/candidates`.

6. **Не реализовывать в этой сессии:**
   - Автоматический триггер сжатия (node-cron, гибридный триггер) — 🔁 пункт 15 (этап 3). Сейчас — ручной запуск `npm run compress:episodes`.
   - Curator (ревизия принятых правил) — 🔁 пункт 15 (этап 3).
   - Профиль автора — отложен.
   - Diff-эпизоды — отложены.

**Что делать после сессии:**

1. Убедиться, что есть 5+ тестовых эпизодов для тестового агента (создать несколько задач, оценить их).
2. Запустить: `npm run compress:episodes -- --agent test-agent`.
3. В логах — увидеть «N эпизодов → M кандидатов».
4. Открыть `/blog/team/staff/candidates` — видеть карточки кандидатов.
5. Принять один кандидат — проверить, что правило появилось в «Правилах» карточки агента и в промпте (поставить задачу, увидеть в превью).
6. Принять с правкой второй — отредактировать текст, сохранить.
7. Отклонить третий — проверить, что эпизоды-источники стали `dismissed`.
8. Удалить тестовые данные. Закоммитить, push, деплой. Накатить миграцию на проде.

**Критерии готовности:**

- Скрипт `npm run compress:episodes` работает: собирает эпизоды → вызывает LLM → создаёт кандидатов в `team_agent_memory` со статусом `candidate`.
- Страница `/blog/team/staff/candidates` показывает кандидатов, сгруппированных по агенту.
- Три действия работают: принять (→ `active`), принять с правкой, отклонить (→ `rejected` + dismiss эпизодов).
- Принятое правило появляется в промпте агента.
- Ссылки на экран кандидатов — из карточки агента и из шапки страницы Сотрудников.
- Никаких регрессий.

**Отклонения:**
- **Миграций в этой сессии нет** — таблица `team_agent_memory` была создана в Сессии 8 с полями `status='candidate'` и `source_episode_ids UUID[]`; сжатие просто пишет в неё новые строки. Поэтому раздел «Что делать до сессии» (про номер `0017`) не актуален: ничего накатывать не надо.
- **Идемпотентность скрипта** реализована через сравнение отсортированных `source_episode_ids` (а не «по тексту»): если набор эпизодов совпал — это тот же кандидат, независимо от того, как LLM сформулировала текст. Это страхует от повторных кандидатов после доработки промпта.
- **Эндпоинт `GET /api/team/memory/candidates`** объявлен ДО `GET /:agentId` — иначе Express матчит `candidates` как agentId. В случае Сессии 16 (Дашборд) тот же приём пригодится.
- **Dismiss source-эпизодов** при отклонении кандидата делается прямо внутри `memoryService.updateMemory` после успешного UPDATE правила. Если dismiss падает — не валим основной поток (логируем и идём дальше); правило уже отклонено корректно.
- **Подгрузка эпизодов-источников в UI** идёт через `fetchFeedbackEpisodes(agentId)` с клиентской фильтрацией по `source_episode_ids` — нет отдельного эндпоинта `GET /api/team/feedback/by-ids`, потому что эпизодов на одного агента редко больше нескольких сотен.
- **Если у dismissed-кандидата source-эпизоды уже были архивированы** — UI просто покажет «Эпизоды не найдены». Это нормально: кандидат привязан к id, эпизоды могут менять status независимо.

---

### Сессия 16 — Дашборд: три пояса и лог с фильтрами (этап 3, пункт 14) ✅ 2026-05-11

**Цель:** Перестроить страницу `/blog/team/dashboard` из плоского лога задач в командный пульт с тремя визуальными поясами (стратегический / операционный / Inbox-заглушка); добавить антропоморфные карточки задач, расширенные фильтры и сортировку; добавить компактную сводку расходов.

**Что делать до сессии:**

- Убедиться, что миграция `0017` (Сессия 14) накачена. Следующая будет `0018_team_projects.sql`.
- Убедиться, что в `team_tasks` есть колонка `agent_id` (миграция `0015`, Сессия 12) и в `team_api_calls` — `agent_id`.

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0018_team_projects.sql`:
   ```sql
   -- Таблица проектов
   CREATE TABLE IF NOT EXISTS team_projects (
     id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
     name TEXT NOT NULL,
     description TEXT,
     status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );

   COMMENT ON TABLE team_projects IS 'Проекты — навигационные тэги для группировки задач.';

   -- Колонка project_id в team_tasks
   ALTER TABLE team_tasks
     ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES team_projects(id);

   CREATE INDEX IF NOT EXISTS idx_team_tasks_project ON team_tasks(project_id);
   ```

2. **Создай сервис** `backend/src/services/team/projectService.js`:
   - `listProjects(status)` — `SELECT * FROM team_projects WHERE status = $1 ORDER BY created_at DESC`. По умолчанию `status = 'active'`.
   - `createProject(name, description)` — INSERT, возвращает созданный проект.
   - `archiveProject(id)` — UPDATE `status = 'archived'`.
   - `getProjectById(id)` — SELECT по id.

3. **Добавь API-маршруты** в `routes/team/projects.js`:
   - `GET /api/team/projects` — список проектов (`?status=active|archived|all`, дефолт `active`).
   - `POST /api/team/projects` — создание (body: `{ name, description? }`).
   - `PATCH /api/team/projects/:id` — обновление (body: `{ status? }`).
   - Зарегистрируй в Express app с middleware `requireAuth`.

4. **Расширь `taskRunner.js`:**
   - В `createTask()` — принимать опциональный `project_id` и записывать в таблицу.
   - В маршруте `POST /api/team/tasks` — принимать `project_id` из body.

5. **Перестрой страницу** `/blog/team/dashboard/page.tsx`:

   **Стратегический пояс (верх):**
   - Блок North Star справа: текст из `Миссия.md` (поле North Star) — читать из `GET /api/team/prompts/strategy-team/Миссия.md` или аналогичного существующего эндпоинта, парсить строку после `## North Star`. Формат: «30 000 подписчиков к 31 декабря 2026».
   - Плашка отчётного периода по центру: текст из `Цели на период.md` — парсить первую строку/блок после `## Фокус на период` (или аналогичный заголовок). Если блока нет — placeholder «Цели на период не заданы».
   - Счётчик «осталось дней» слева от плашки: парсить дату окончания периода из Goals, вычислить разницу с `new Date()`. Формат: «42 дня». Если даты нет — не показывать.
   - Счётчик «осталось подписчиков» — placeholder-заглушка, неактивный, текст «подключится автоматически» мелким шрифтом. Появится когда внутренний аналитик начнёт писать текущую точку.
   - Общий стиль пояса: приглушённый фон (чуть темнее основного), компактный, не отвлекает от работы.

   **Операционный пояс (середина):**
   - **Шапка с расходами:** компактная сводка «Расходы за период: $X.XX (~Y ₽)». Курс из `team_settings` (поле `usd_rub_rate`). Данные из `GET /api/team/admin/costs` (существующий эндпоинт) с фильтром по выбранному периоду.
   - **Кнопка «Поставить задачу»** — крупная, заметная. В этой сессии открывает существующую форму постановки задачи (из этапа 1). Новая форма с выбором агента — Сессия 17.
   - **Фильтры лога задач:**
     - По сотруднику: выпадашка с аватарами из `GET /api/team/agents` (active), включая «Все». Если агентов нет — показывать только «Все».
     - По проекту: выпадашка из `GET /api/team/projects`, включая «Все» и «⚪ Без проекта».
     - По статусу: мультиселект из `running / done / revision / archived / error`.
     - По периоду: кнопки «Сегодня / 7 дней / 30 дней» + кастомный диапазон дат.
   - **Лог задач** — обновлённые карточки:
     - Аватар + имя агента на каждой карточке (если `agent_id` задан; если нет — placeholder «Без агента»). Данные агента загружать из кешированного списка (один запрос `GET /api/team/agents` при загрузке страницы).
     - Плашка проекта на карточке (цветная, имя проекта; если `project_id = null` — «⚪ Без проекта»).
     - Существующие поля: тип задачи, статус, дата, краткое содержание.
   - **Сортировка:** по умолчанию `updated_at desc`. Переключатель на `created_at` — иконка-кнопка.

   **Inbox-заглушка (низ или правая колонка):**
   - Блок «Требует внимания» — заглушка с placeholder: «Inbox внимания появится в Сессии 18». Визуально отделён от операционного пояса.
   - Не загружает никаких данных в этой сессии.

6. **Обнови `GET /api/team/tasks`** (если существующий эндпоинт не поддерживает фильтрацию):
   - Добавь query-параметры: `agent_id`, `project_id` (включая `null` для «Без проекта»), `status` (через запятую для мультиселекта), `from_date`, `to_date`, `sort_by` (`updated_at` | `created_at`), `sort_order` (`asc` | `desc`).
   - Сохрани обратную совместимость — без параметров возвращает всё как раньше.

7. **Блок «Активные сотрудники в моменте»** — компактный ряд аватаров между стратегическим и операционным поясами:
   - Отображать аватары активных агентов (`status = 'active'` в `team_agents`).
   - Под каждым аватаром — мелкий текст: «работает над задачей X» (если есть `running` задача с этим `agent_id`) или «свободен».
   - Клик на аватар → фильтр лога по этому агенту.

8. **Не реализовывать в этой сессии:**
   - Новую форму постановки задачи с выбором агента → Сессия 17.
   - Inbox внимания и `notificationsService` → Сессия 18.
   - Сквозной колокольчик в шапке → Сессия 18.
   - Кнопку «Поставить задачу» из карточки сотрудника → Сессия 17.

**Что делать после сессии:**

1. Накатить миграцию `0018_team_projects.sql` через Supabase Dashboard → SQL Editor.
2. Локально: `npm run dev` фронт + бэк. Открыть `/blog/team/dashboard`:
   - Стратегический пояс показывает North Star, плашку периода (или placeholder) и счётчик дней (если дата в Goals задана).
   - Фильтры работают: выбрать агента — лог фильтруется; выбрать статус — фильтруется; выбрать период — фильтруется.
   - На карточках задач видны аватары агентов (или placeholder, если задачи старые, без `agent_id`).
   - Кнопка «Поставить задачу» открывает существующую форму (из этапа 1).
   - Создать проект через API (`curl POST /api/team/projects`), проверить что он появляется в фильтре.
3. Закоммитить, push, деплой.

**Критерии готовности:**

- Страница `/blog/team/dashboard` визуально разделена на три пояса.
- Стратегический пояс парсит North Star из `Миссия.md` и фокус периода из `Цели на период.md`.
- Счётчик «осталось дней» корректно вычисляется.
- Фильтры лога: по агенту, проекту, статусу, периоду — все работают, множественный выбор статусов.
- Карточки задач содержат аватар + имя агента и плашку проекта.
- Расходы за выбранный период отображаются в шапке операционного пояса ($ + ₽).
- API проектов работает: CRUD через `/api/team/projects`.
- Таблица `team_projects` создана, `team_tasks.project_id` существует.
- Переключение сортировки `updated_at` ↔ `created_at` работает.
- Блок «Активные сотрудники» показывает аватары с текущим состоянием.
- Inbox-заглушка визуально присутствует.
- Никаких регрессий в существующей функциональности постановки задач.

**Отклонения:**
- **Миграция получила сквозной номер `0023_team_projects.sql`** — последняя применённая `0022_team_feedback_episodes.sql`, не локальная `0018` из ТЗ.
- **Расходы за период**: пояс показывает «Сегодня задач: N · Потрачено за сутки» (компонент `ToolsHeader` этапа 1). Полноценный селектор периода + рубли — отложен на Сессию 49 (пункт 1, расширение биллинга в Админке). Период в фильтрах лога фильтрует только задачи, не расходы.
- **Конвертация USD→₽** — пока нет (требует ENV / setting `usd_rub_rate`). Будет добавлена в Сессии 49.
- **Стратегический пояс «осталось подписчиков»** — placeholder «подключится автоматически» (как и в ТЗ).
- **Старая шапка `ToolsHeader`** оставлена под стратегическим поясом — она удобна для быстрой ориентации и не дублирует функции нового пояса (там — стратегия и сроки, тут — операционные счётчики дня).
- **Фильтры лога**: все клиентские (применяются в браузере к уже загруженным задачам), потому что поллинг через `getSupabaseBrowserClient` уже тянет всё одним запросом. Серверный фильтрующий эндпоинт `GET /api/team/tasks?...` не нужен на текущем масштабе (десятки-сотни задач). Если объём вырастет — добавим в Сессии 49.
- **«Без проекта»** в фильтре идёт как отдельный вариант значения `none`, не реальный id; внутри `applyTaskFilters` обрабатывается специально.

---

### Сессия 17 — Форма постановки задачи с выбором агента (этап 3, пункт 14) ✅ 2026-05-11

**Цель:** Реализовать новую модальную форму постановки задачи с потоком «Выбор агента → Шаблон → Параметры → Запуск»; подключить allowlist шаблонов из карточки агента; обеспечить двойную точку входа (дашборд + карточка сотрудника); добавить поле проекта в форму.

**Что делать до сессии:**

- Убедиться, что миграция `0018` накачена и API проектов работает.
- Никаких новых миграций. Все изменения — код.

**ТЗ для Claude Code:**

1. **Создай компонент** `frontend/src/components/team/TaskCreationModal.tsx`:
   - Модальное окно (или полноэкранная панель — по факту, что лучше смотрится в текущей дизайн-системе Потока).
   - Три шага (stepper с индикатором прогресса):

   **Шаг 1 — Выбор сотрудника:**
   - Сетка карточек с аватарами активных агентов (`GET /api/team/agents?status=active`).
   - Paused-агенты скрыты (не отображаются).
   - На каждой карточке: аватар, имя, должность (`role_title`).
   - Клик → переход на шаг 2.
   - Если агентов нет — сообщение «Сотрудники ещё не созданы. Создайте первого в разделе Сотрудники» со ссылкой на `/blog/team/staff`.

   **Шаг 2 — Тип задачи (шаблон):**
   - Заголовок: «Задача для [Имя]» с аватаром.
   - Выпадашка с шаблонами, отфильтрованными по `allowed_task_templates` выбранного агента.
   - Шаблоны загружать: `GET /api/team/prompts` (существующий эндпоинт, возвращает список файлов из `team-prompts/Шаблоны задач/`), затем фильтровать на клиенте по массиву `allowed_task_templates` агента.
   - Если у агента один шаблон — автоматически преселектить и перейти на шаг 3.
   - Если `allowed_task_templates` пуст — сообщение «У этого сотрудника нет доступных шаблонов задач. Настройте в карточке сотрудника».
   - Кнопка «Назад» — вернуться на шаг 1.

   **Шаг 3 — Параметры:**
   - Поле «Проект» — выпадашка: активные проекты (`GET /api/team/projects`), «⚪ Без проекта» (первым или последним), «+ Создать новый» (при выборе — inline-инпут для имени, POST `/api/team/projects`, после создания автоматически выбирается). Поле обязательное.
   - Поле «Бриф» — textarea (текст) + кнопка микрофона (голосовой ввод через существующую Whisper-инфраструктуру). Динамические поля из шаблона задачи — загружать из тела шаблона (парсить плейсхолдеры `{{...}}`).
   - Чекбокс «Самопроверка» — если в шаблоне есть дефолт `self_review`, преселектить его; иначе — выключен. (Переопределение дефолта шаблона, как зафиксировано в пункте 11.)
   - Placeholder-блоки (disabled, серые):
     - «Прикрепить базы» — текст «Появится позже». 🔁 пункт 13/14 (мультиселект баз).
     - «Уточнения от агента» — текст «Появится позже». 🔁 пункт 17 (этап 5, статус `clarifying`).
   - Кнопка «Запустить» — вызывает `POST /api/team/tasks` с `{ task_type, agent_id, project_id, brief, self_review, ...params }`.
   - Кнопка «Назад» — вернуться на шаг 2.

2. **Обнови `POST /api/team/tasks`:**
   - Принимать новые поля: `agent_id`, `project_id`, `self_review` (boolean).
   - `agent_id` записывается в `team_tasks.agent_id` (колонка из миграции `0015`).
   - `project_id` записывается в `team_tasks.project_id` (колонка из миграции `0018`).
   - При записи в `team_api_calls` (через `costTracker`) — передавать `agent_id` для поагентного биллинга.
   - Если `agent_id` указан — проверить, что запрошенный `task_type` входит в `allowed_task_templates` этого агента. Если нет — 400 с сообщением «Этот шаблон задачи не разрешён для данного сотрудника».

3. **Активируй allowlist UI в карточке сотрудника:**
   - В `frontend/src/app/blog/team/staff/[id]/page.tsx` (Сессия 11) — найди disabled placeholder «Доступные шаблоны задач».
   - Замени на рабочий мультиселект: список шаблонов из `GET /api/team/prompts` (папка `Шаблоны задач/`), текущие значения из `agent.allowed_task_templates`.
   - При изменении — `PATCH /api/team/agents/:id` с обновлённым `allowed_task_templates`.
   - Визуально — чипы с именами шаблонов + кнопка «+».

4. **Подключи модалку к дашборду:**
   - Кнопка «Поставить задачу» на `/blog/team/dashboard` — открывает `TaskCreationModal` с шага 1.
   - Передавать callback `onTaskCreated` — после создания задачи обновить лог на дашборде.

5. **Подключи модалку к карточке сотрудника:**
   - Кнопка «Поставить задачу» в карточке (Сессия 11, disabled placeholder) → рабочая кнопка.
   - Открывает `TaskCreationModal` с преселекцией агента → сразу шаг 2.

6. **Обратная совместимость:**
   - Старая форма постановки (из этапа 1) остаётся доступной как fallback, если `TaskCreationModal` не загружается или нет агентов.
   - Задачи, поставленные без `agent_id`, продолжают работать (agent_id nullable).

7. **Не реализовывать в этой сессии:**
   - Мультиселект прикрепления баз → 🔁 зависимость от полных permissions баз (пункт 13/этап 1 + пункт 14).
   - Чекбокс «Уточнения от агента» → 🔁 пункт 17 (этап 5, статус `clarifying`).
   - Неактивную кнопку «Сделать регулярной» → 🔁 пункт 15 (этап 3, но после обкатки формы).

**Что делать после сессии:**

1. Локально: создать тестового агента через мастер (если нет). Заполнить `allowed_task_templates` (например, `['Свободные идеи', 'Прямое исследование']`).
2. Открыть дашборд → «Поставить задачу» → видеть карточку агента → выбрать → видеть отфильтрованные шаблоны → заполнить бриф → выбрать проект (или создать новый) → «Запустить».
3. Проверить: задача появилась в логе с аватаром агента и плашкой проекта.
4. Открыть карточку сотрудника → «Поставить задачу» → агент преселектирован, шаг 1 пропущен.
5. Проверить edge-case: агент без шаблонов → сообщение. Нет агентов → сообщение.
6. Закоммитить, push, деплой.

**Критерии готовности:**

- Модальное окно открывается из дашборда (шаг 1) и из карточки сотрудника (шаг 2 с преселекцией).
- Шаблоны фильтруются по `allowed_task_templates` агента.
- Создание проекта inline в форме работает.
- Поле проекта обязательное; «⚪ Без проекта» записывает `project_id = null`.
- Задача создаётся с `agent_id` и `project_id` — видно в логе.
- Allowlist UI в карточке сотрудника: рабочий мультиселект, сохранение через PATCH.
- Валидация на бэкенде: шаблон не из allowlist → 400.
- Обратная совместимость: старые задачи без agent_id отображаются нормально.
- Никаких регрессий.

**Отклонения:**
- **Поле «Проект» НЕ обязательное** (в ТЗ — обязательное). Решение: проект — навигационный тег, требовать его на каждую задачу делает Влада «выбирать ради выбора»; «⚪ Без проекта» — нормальный и частый кейс (быстрые идеи, эксперименты). Никаких изменений в БД (`team_tasks.project_id` уже nullable, FK ON DELETE SET NULL).
- **TaskCreationModal** — тонкая обёртка над существующим `TaskRunnerModal`. На шаге 3 управление полностью передаётся `TaskRunnerModal` через `presetAgentId` + `taskType`. Это избегает дублирования формы (поля по типу задачи, превью промпта, модель, проект, голосовой ввод) — Влад увидит одну и ту же форму, что и в старом потоке через `ActionGrid`.
- **«Самопроверка» — заглушка**: чекбокс отрисован, но `disabled` с пояснением «появится в Сессии 29». Бэкенд параметр пока не принимает; добавим при реализации `selfReviewService` в Сессии 29.
- **Кнопка «Сделать регулярной»** (UI-плейсхолдер из ТЗ Сессии 19) пока не добавлена — будет в Сессии 19.
- **Старый быстрый запуск (ActionGrid)** оставлен на дашборде под новой кнопкой «Поставить задачу». Это удобно, когда Влад уже знает, какой шаблон ему нужен, и не хочет проходить мастер. Старый путь использует `TaskRunnerModal` без presetAgentId — селект агента остаётся внутри формы.
- **Каталог `TEMPLATE_META` в TaskCreationModal — фронт-only**. Список из 4 шаблонов (`research_direct`, `ideas_questions_for_research`, `ideas_free`, `write_text`) совпадает с `ActionGrid`. `edit_text_fragments` спрятан — он не отдельная задача, а правка артефакта write_text.
- **Кнопка «+ Добавить сотрудника» с tooltip «Появится позже»** в шаге 1 пустого состояния — заменена прямой ссылкой на `/blog/team/staff`, потому что мастер создания уже работает с Сессии 10.

---

### Сессия 18 — Inbox внимания и сквозной колокольчик (этап 3, пункт 14) ✅ 2026-05-11

**Цель:** Реализовать `notificationsService` для агрегации событий, блок «Требует внимания» на дашборде с реальными данными, и сквозной колокольчик в шапке всего сайта.

**Что делать до сессии:**

- Убедиться, что Сессия 17 выполнена (форма постановки задач работает, оценка задач из Сессии 14 работает).
- Миграция `0019_team_notifications.sql` будет создана в этой сессии.

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0019_team_notifications.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS team_notifications (
     id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
     type TEXT NOT NULL CHECK (type IN (
       'rule_candidate',
       'skill_candidate',
       'rule_revision',
       'task_awaiting_review',
       'handoff_suggestion',
       'proposal'
     )),
     title TEXT NOT NULL,
     description TEXT,
     agent_id TEXT REFERENCES team_agents(id),
     related_entity_id TEXT,
     related_entity_type TEXT,
     link TEXT,
     is_read BOOLEAN NOT NULL DEFAULT false,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );

   CREATE INDEX idx_team_notifications_unread ON team_notifications(is_read) WHERE is_read = false;
   CREATE INDEX idx_team_notifications_type ON team_notifications(type);

   COMMENT ON TABLE team_notifications IS 'Агрегатор событий Inbox внимания. Каждый элемент = что-то требующее решения от Влада.';
   ```

2. **Создай сервис** `backend/src/services/team/notificationsService.js`:
   - `createNotification({ type, title, description, agent_id, related_entity_id, related_entity_type, link })` — INSERT в `team_notifications`.
   - `getUnreadCount()` — `SELECT COUNT(*) FROM team_notifications WHERE is_read = false`.
   - `getUnreadGrouped()` — `SELECT type, COUNT(*) as count FROM team_notifications WHERE is_read = false GROUP BY type`. Возвращает объект: `{ rule_candidate: 3, task_awaiting_review: 1, ... }`.
   - `getNotifications({ type?, is_read?, limit?, offset? })` — SELECT с фильтрами, ORDER BY `created_at DESC`.
   - `markAsRead(id)` — UPDATE `is_read = true`.
   - `markAllAsRead(type?)` — UPDATE `is_read = true` WHERE type = $1 (или все).

3. **Добавь API-маршруты** в `routes/team/notifications.js`:
   - `GET /api/team/notifications` — список (query: `type`, `is_read`, `limit`, `offset`).
   - `GET /api/team/notifications/summary` — `getUnreadGrouped()` + `getUnreadCount()`.
   - `PATCH /api/team/notifications/:id/read` — `markAsRead(id)`.
   - `PATCH /api/team/notifications/read-all` — `markAllAsRead(type?)`.
   - Зарегистрируй с `requireAuth`.

4. **Интегрируй создание нотификаций в существующие потоки:**
   - В `backend/scripts/compress-episodes.js` (Сессия 15): после создания кандидата в правило — `notificationsService.createNotification({ type: 'rule_candidate', title: 'Новый кандидат в правила для [Имя агента]', agent_id, related_entity_id: memory_id, link: '/blog/team/staff/candidates' })`.
   - В `taskRunner.js`: при переходе задачи в `done` — `createNotification({ type: 'task_awaiting_review', title: 'Задача «[название]» ждёт оценки', agent_id, related_entity_id: task_id, link: '/blog/team/dashboard' })`.
   - В Сессии 13 (handoff): при парсинге блока `Suggested Next Steps` — `createNotification({ type: 'handoff_suggestion', title: '[Имя агента] предлагает передать задачу дальше', agent_id, related_entity_id: task_id, link: '/blog/team/dashboard' })`.
   - Типы `skill_candidate`, `rule_revision`, `proposal` — заглушки; нотификации для них будут создаваться в соответствующих пунктах (10, 15).

5. **Обнови блок «Требует внимания» на дашборде** (Сессия 16, заглушка → рабочий блок):
   - При загрузке страницы — `GET /api/team/notifications/summary`.
   - Отображать группированные счётчики:
     - «N кандидатов в правила» → ссылка на `/blog/team/staff/candidates`.
     - «N задач ждут оценки» → ссылка-якорь на лог задач с фильтром `status=done`.
     - «N предложений handoff» → ссылка на лог задач.
   - Если Inbox пуст — «Всё чисто ✓».
   - Кнопка «Отметить все прочитанными» — `PATCH /api/team/notifications/read-all`.

6. **Добавь сквозной колокольчик в шапке сайта:**
   - В корневом layout (`frontend/src/app/layout.tsx` или компонент шапки — найти по факту) — добавить иконку колокольчика.
   - Бейдж с цифрой непрочитанных (`GET /api/team/notifications/summary` → `total_unread`). Обновлять при загрузке каждой страницы.
   - При клике — выпадающая панель (dropdown) с группировкой по типу:
     - «Правила: 3» — клик → `/blog/team/staff/candidates`.
     - «Оценка: 2» — клик → `/blog/team/dashboard`.
     - «Handoff: 1» — клик → `/blog/team/dashboard`.
   - Кнопка «Все прочитано» в нижней части dropdown.
   - Колокольчик виден из **любого** раздела Потока (не только из Команды).

7. **Не реализовывать в этой сессии:**
   - Дублирование Inbox в Telegram → 🔁 пункт 20 (этап 6).
   - Нотификации для `skill_candidate`, `rule_revision`, `proposal` → 🔁 пункты 10, 15 (этапы 4, 3).
   - Приоритеты в Inbox (⚡ срочные наверху) → 🔁 пункт 15 (этап 3).

**Что делать после сессии:**

1. Накатить миграцию `0019_team_notifications.sql` через Supabase Dashboard.
2. Локально: создать тестовую задачу, довести до `done` → проверить, что нотификация создана.
3. Запустить `npm run compress:episodes` → проверить, что нотификация `rule_candidate` создана.
4. На дашборде: блок «Требует внимания» показывает реальные счётчики. Ссылки ведут на правильные экраны.
5. В шапке сайта: колокольчик показывает бейдж. Клик → dropdown со ссылками. «Все прочитано» → бейдж исчезает.
6. Перейти на любую другую страницу (Базы, Инструкции) — колокольчик виден и работает.
7. Закоммитить, push, деплой.

**Критерии готовности:**

- Таблица `team_notifications` создана. API CRUD работает.
- При завершении задачи → нотификация `task_awaiting_review` создаётся автоматически.
- При создании кандидата в правила → нотификация `rule_candidate` создаётся автоматически.
- Блок «Требует внимания» на дашборде показывает группированные счётчики со ссылками.
- Сквозной колокольчик в шапке: бейдж + dropdown + «Все прочитано» — доступен из любого раздела.
- Никаких регрессий.

**Отклонения:**
- **Миграция — `0024_team_notifications.sql`** (сквозная нумерация), не `0019` из ТЗ.
- **Колокольчик отрендерен через AppShell как floating top-right** (а не интегрирован в шапку сайта), потому что у проекта пока нет десктопного top-bar — только `MobileTopbar`. Это даёт ту же видимость «на любом разделе», без структурных изменений лейаута. Позиция (`fixed top-4 right-4 lg:right-8 lg:top-6`) не пересекается с контентом — отделена от sidebar и пин-кнопки.
- **На `/auth/*` колокольчик не показан** — AppShell вообще не оборачивает эти страницы (signin/error), всё корректно.
- **Handoff-нотификация — одна на задачу** (а не на каждое предложение). Кладём имена в `description` через запятую. Иначе при ответе с 3 suggested next steps получили бы 3 уведомления → засорение Inbox.
- **`proposal` и `rule_revision`** — записаны в CHECK как валидные типы и присутствуют в `NOTIFICATION_GROUP_*` UI-словарях, но никто пока их не создаёт. Заведомо ждут Сессий 22 (proposal) и Curator'а из 15-15.
- **`skill_candidate`** — то же самое: тип валидный, UI готов, источника пока нет (Сессия 27).
- **Поллинг — раз в 30 секунд** (и InboxBlock, и NotificationsBell). Inbox-события возникают редко (раз в задачу/раз в сжатие); поллить чаще = расход. WebSockets/Realtime — отложен.
- **NotificationsBell — клиентский компонент с floating position**. Закрывается по клику снаружи и Esc. Иконка `Bell` из `lucide-react`, бейдж `99+` при `total > 99`.

---

### Сессия 19 — Allowlist шаблонов задач в карточке агента — финализация (этап 3, пункт 14) ✅ 2026-05-11

**Цель:** Убедиться, что связь «агент ↔ шаблоны задач» полностью работает end-to-end; добавить визуальную индикацию в карточке агента и на дашборде; дотестировать edge-cases.

**Что делать до сессии:**

- Убедиться, что Сессии 16-18 выполнены. Никаких миграций.

**ТЗ для Claude Code:**

1. **Обнови список сотрудников** `/blog/team/staff/page.tsx`:
   - На каждой карточке агента в списке — показывать количество доступных шаблонов: «3 шаблона» или «Нет шаблонов» (с визуальным предупреждением — жёлтый бейдж).
   - Кнопка «Поставить задачу» на каждой карточке в списке (не только в детальной карточке) — открывает `TaskCreationModal` с преселекцией.

2. **Обнови дашборд — «Неактивная кнопка „Сделать регулярной"»:**
   - В форме постановки задачи (Сессия 17, шаг 3) — добавь неактивную кнопку «Сделать регулярной» с tooltip «Появится позже». Визуально приглушённая, disabled. Это UI-заглушка из пункта 15.

3. **Обнови форму постановки — валидация и UX:**
   - Если Влад пытается запустить задачу без заполнения брифа — инлайн-ошибка «Заполните бриф задачи».
   - Если бриф введён голосом — показать транскрипцию в textarea перед отправкой (для редактирования).
   - При успешном создании задачи — toast «Задача создана» + автоматическое закрытие модалки + обновление лога.

4. **Проверь и зафиксируй edge-cases:**
   - Агент без `allowed_task_templates` (пустой массив) → на шаге 2 сообщение, кнопка «Запустить» недоступна.
   - Агент с одним шаблоном → автопреселект, шаг 2 пропускается.
   - Проект создан inline → автоматически выбран в форме, появляется в фильтрах дашборда.
   - Задача поставлена без агента (старый путь) → отображается корректно в логе.

5. **Не реализовывать в этой сессии:**
   - Inbox-типы для пункта 15 (предложения самозадач) → 🔁 пункт 15 (этап 3).
   - Batch-режим → 🔁 пункт 22 (этап 6).

**Что делать после сессии:**

1. Прогнать полный сценарий: создать агента → заполнить allowlist → поставить задачу с дашборда → оценить → проверить Inbox и колокольчик.
2. Прогнать из карточки: открыть карточку → «Поставить задачу» → шаг 2 с преселекцией → запустить.
3. Проверить все edge-cases из пункта 4.
4. Закоммитить, push, деплой.

**Критерии готовности:**

- Список сотрудников показывает количество шаблонов на каждой карточке.
- Кнопка «Поставить задачу» доступна и из списка сотрудников, и из детальной карточки.
- Неактивная кнопка «Сделать регулярной» видна в форме.
- Валидация формы: пустой бриф → ошибка. Агент без шаблонов → предупреждение.
- Toast после создания задачи.
- Все edge-cases протестированы и работают.
- End-to-end: дашборд → постановка → выполнение → оценка → Inbox → колокольчик — полный цикл.
- Никаких регрессий.

**Отклонения:**
- **Бейдж шаблонов на карточке списка**: 0 разрешённых = «Все шаблоны» (бэкенд так и понимает — пустой allowlist пропускает любой taskType). Это компромисс: Влад не различит «осознанно все» и «не настроил», но бэкенд-поведение единое.
- **Карточка агента в списке — `<div>` с absolute `<Link>`-оверлеем**, не сам `<Link>` (как было раньше). Иначе вложенный `<button>` «Поставить задачу» дал бы вложенный кликабельный элемент в `<a>` — невалидный HTML. Кнопка приподнята `z-10` над оверлеем, остальные клики идут на ссылку.
- **Toast после создания задачи** не реализован отдельным компонентом — текущее поведение даже лучше: модалка закрывается + сразу открывается `TaskViewerModal` с новой задачей (через `handleTaskCreated` в `TeamWorkspace`). Это даёт мгновенный визуальный фидбэк. Отдельный toast добавил бы шум.
- **Inline-ошибка «Заполни бриф»** реализована как подсказка слева от кнопок Cancel/Submit (а не отдельным сообщением). Когда `ready=false` — показываем «Заполни бриф задачи [и источник / название точки], чтобы запустить.». Submit-кнопка всё равно disabled — пользователь физически не может нажать на пустую форму.
- **Кнопка «Поставить задачу» в карточках archived-агентов скрыта**: бессмысленно ставить задачу архивному. На детальной карточке `HeaderCard` сам обрабатывает (disabled).

---

### Сессия 20 — Инструменты: реестр, методички и Awareness (этап 3, пункт 16) ✅ 2026-05-11

**Цель:** Создать таблицу инструментов и связочную таблицу агент-инструмент, подпапку методичек в Storage, расширить `promptBuilder.js` третьей секцией Awareness (карта инструментов с методичками), seed-запись NotebookLM.

**Что делать до сессии:**

- Убедиться, что миграция `0019` (Сессия 18) накачена. Следующая — `0020_team_tools.sql`.
- Никаких ENV-переменных. Все изменения — код + миграция + файл методички в Storage.

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0020_team_tools.sql`:
   ```sql
   -- Реестр инструментов
   CREATE TABLE IF NOT EXISTS team_tools (
     id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
     name TEXT NOT NULL UNIQUE,
     description TEXT,
     tool_type TEXT NOT NULL DEFAULT 'executor' CHECK (tool_type IN ('executor', 'system')),
     manifest_path TEXT,
     connection_config JSONB DEFAULT '{}'::jsonb,
     status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('active', 'inactive', 'error')),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );

   COMMENT ON TABLE team_tools IS 'Реестр инструментов. executor = в Hands агента (NotebookLM, Web Search). system = инфраструктурный (Apify).';

   -- Связь агент ↔ инструмент
   CREATE TABLE IF NOT EXISTS team_agent_tools (
     agent_id TEXT NOT NULL REFERENCES team_agents(id) ON DELETE CASCADE,
     tool_id TEXT NOT NULL REFERENCES team_tools(id) ON DELETE CASCADE,
     PRIMARY KEY (agent_id, tool_id)
   );

   COMMENT ON TABLE team_agent_tools IS 'Какие инструменты доступны каждому агенту. Определяет третью секцию Awareness.';

   -- Seed: NotebookLM как первый инструмент
   INSERT INTO team_tools (id, name, description, tool_type, manifest_path, status)
   VALUES (
     'notebooklm',
     'NotebookLM',
     'Инструмент для глубокого исследования по подгруженным источникам (книги, статьи, PDF). Локальный воркер.',
     'executor',
     'Инструменты/NotebookLM.md',
     'inactive'
   ) ON CONFLICT (id) DO NOTHING;
   ```

2. **Создай сервис** `backend/src/services/team/toolService.js`:
   - `listTools(type?)` — SELECT из `team_tools`, опциональная фильтрация по `tool_type`.
   - `getToolById(id)` — SELECT по id.
   - `createTool({ name, description, tool_type, manifest_path, connection_config })` — INSERT.
   - `updateTool(id, fields)` — UPDATE (status, connection_config и т.д.).
   - `getAgentTools(agentId)` — SELECT из `team_agent_tools` JOIN `team_tools` WHERE `agent_id = $1` AND `team_tools.status = 'active'`.
   - `setAgentTools(agentId, toolIds[])` — DELETE + INSERT в `team_agent_tools` (полная замена списка).
   - `getToolManifest(toolId)` — чтение markdown-файла из `team-prompts` по `manifest_path` через `teamStorage.js`. Возвращает содержимое файла или null.

3. **Добавь API-маршруты** в `routes/team/tools.js`:
   - `GET /api/team/tools` — список (query: `type=executor|system|all`, дефолт `all`).
   - `GET /api/team/tools/:id` — детали инструмента.
   - `POST /api/team/tools` — создание.
   - `PATCH /api/team/tools/:id` — обновление.
   - `GET /api/team/tools/:id/manifest` — содержимое методички.
   - `GET /api/team/agents/:agentId/tools` — инструменты агента.
   - `PUT /api/team/agents/:agentId/tools` — обновить список инструментов агента (body: `{ tool_ids: [...] }`).
   - Зарегистрируй с `requireAuth`.

4. **Загрузи методичку NotebookLM в Storage:**
   - Создай одноразовый скрипт `backend/scripts/seed-tool-manifests.js`:
     - Загружает файл `NotebookLM.md` в bucket `team-prompts`, путь `Инструменты/NotebookLM.md`.
     - Содержимое — стартовая методичка из пункта 16 (двухступенчатая методология Влада: «Что это», «Возможности», «Ограничения», «Как пользоваться правильно», «Самопроверка после использования»). Скопировать текст из приклеенного пункта.
     - Идемпотентный (если файл существует — пропуск).
   - В `package.json` бэкенда: `"seed:tools": "node scripts/seed-tool-manifests.js"`.

5. **Расширь `promptBuilder.js` — третья секция Awareness:**
   - В функции генерации Awareness-блока (та, что формирует roster + карту баз):
     - Добавь третью секцию `## Доступные инструменты`.
     - Для каждого инструмента из `getAgentTools(agentId)`:
       - Имя инструмента.
       - Краткое описание (из `team_tools.description`).
       - Содержимое методички (из `getToolManifest(toolId)`) — целиком.
     - Если у агента нет инструментов — секция пустая: «Нет доступных инструментов.»
   - Пометить секцию как `cache_control: { type: 'ephemeral' }` (методички редко меняются).
   - При вызове `invalidatePromptCache()` (из Сессии 12) — инвалидировать и эту секцию.

6. **Расширь инвалидацию кеша:**
   - Вызывать `invalidatePromptCache()` при:
     - `setAgentTools()` (изменение списка инструментов агента).
     - `updateTool()` (изменение статуса или описания инструмента).
     - Загрузке/обновлении файла методички через Storage.

7. **Не реализовывать в этой сессии:**
   - UI инструментов в Админке → Сессия 21.
   - UI поля «Доступные инструменты» в карточке агента → Сессия 21.
   - Очередь NotebookLM-воркера (`team_notebooklm_queue`) → 🔁 пункт 17 (этап 5).
   - Проверку доступности инструмента перед запуском задачи (heartbeat) → 🔁 пункт 17 (этап 5).
   - Связку с self-review (агрегация секции «Самопроверка» из методичек) → 🔁 пункт 11 (этап 4).
   - Web Search как второй инструмент → 🔁 пункт 17 (этап 5).
   - Apify как «инструмент Системы» → 🔁 пункт 17 (этап 5).

**Что делать после сессии:**

1. Накатить миграцию `0020_team_tools.sql` через Supabase Dashboard.
2. Запустить: `npm run seed:tools` — проверить, что `NotebookLM.md` появился в `team-prompts/Инструменты/`.
3. В Supabase Dashboard: проверить таблицу `team_tools` — одна запись `notebooklm`.
4. Через API: `GET /api/team/tools` — видеть NotebookLM. `GET /api/team/tools/notebooklm/manifest` — видеть текст методички.
5. Если есть тестовый агент — через API привязать ему инструмент (`PUT /api/team/agents/:id/tools` с `{ tool_ids: ['notebooklm'] }`). Поставить задачу — в превью промпта увидеть третью секцию Awareness с содержимым методички.
6. Закоммитить, push, деплой.

**Критерии готовности:**

- Таблица `team_tools` создана, seed-запись NotebookLM существует.
- Таблица `team_agent_tools` создана.
- Файл `team-prompts/Инструменты/NotebookLM.md` загружен с полным содержимым методички.
- API CRUD для инструментов работает.
- API привязки инструментов к агенту работает.
- `promptBuilder.js` генерирует третью секцию Awareness с содержимым методички для агентов с привязанными инструментами.
- Инвалидация кеша при изменении привязок/инструментов работает.
- Никаких регрессий.

**Отклонения:**
- **Миграция — `0025_team_tools.sql`** (сквозная нумерация), не `0020` из ТЗ.
- **Storage-путь — `tools/notebooklm.md` (ASCII)**, а не `Инструменты/NotebookLM.md` как в ТЗ. Причина та же, что в Сессиях 4 и 9: Supabase Storage отбивает кириллицу в путях с `Invalid key`. UI-метка в Админке/Инструкциях останется русской («Инструменты»), а Storage хранит ASCII slug.
- **Эндпоинт привязки инструментов агенту** живёт под `/api/team/tools/by-agent/:agentId` (GET/PUT), а не `/api/team/agents/:agentId/tools` как в ТЗ. Причина: `agents.js` уже зарегистрирован раньше и добавлять в него зависимость от `toolService` создаёт циклическую зависимость в модулях. Свой namespace внутри `/tools` чище.
- **Дефолтный статус NotebookLM — `inactive`** (как в ТЗ). UI Админки в Сессии 21 даст Владу переключатель active↔inactive.
- **Awareness-кеш получает третий fingerprint `toolsFingerprint`** (id+updated_at+status каждого активного инструмента). При изменении состава или статуса — кеш пересобирается без необходимости bumpAwarenessVersion. Это нужно потому что `team_agent_tools` отдельная таблица, не отражается в `currentAgent`.
- **`invalidatePromptCache()` вызывается из роутов** `POST /tools`, `PATCH /:id`, `PUT /by-agent/:id` — не из самого сервиса. Сервис чистый CRUD, политика инвалидации — на уровне API.

---

### Сессия 21 — UI инструментов в Админке и карточке агента (этап 3, пункт 16) ✅ 2026-05-11

**Цель:** Добавить блок «Инструменты» в Админку (карточки инструментов с подключением/статусом/методичкой), активировать поле «Доступные инструменты» в карточке агента (из disabled placeholder в рабочие чекбоксы), добавить страницу редактирования методичек в раздел «Инструкции».

**Что делать до сессии:**

- Убедиться, что Сессия 20 выполнена (таблицы + API + Awareness работают).
- Никаких миграций. Все изменения — фронтенд.

**ТЗ для Claude Code:**

1. **Добавь блок «Инструменты» на страницу Админки** (`/blog/team/admin/page.tsx`):
   - Новая секция между существующими (после провайдеров моделей).
   - Заголовок «Инструменты команды» (тип `executor`).
   - Для каждого инструмента из `GET /api/team/tools?type=executor` — карточка:
     - Имя + краткое описание.
     - Статус (зелёный кружок `active`, серый `inactive`, красный `error`).
     - Переключатель статуса (active ↔ inactive).
     - Кнопка «Настройки» → раскрывающаяся панель с полями `connection_config` (JSON-textarea или ключ-значение; для NotebookLM — URL воркера, интервал heartbeat). Сохранение через `PATCH /api/team/tools/:id`.
     - Ссылка «Методичка →» → переход на `/blog/team/instructions` с открытием файла `Инструменты/NotebookLM.md` (или прямой inline-просмотр, если текущий UI Инструкций это поддерживает).
   - Кнопка «+ Добавить инструмент» — форма: имя, описание, тип (`executor`), путь к методичке. POST `/api/team/tools`.

2. **Добавь блок «Инструменты Системы»** на ту же страницу Админки:
   - Заголовок «Инструменты Системы» (тип `system`).
   - Аналогичные карточки, но без ссылки на методичку (у системных инструментов методичек нет — они не в Hands агента).
   - На старте — placeholder-карточка «Apify» с текстом «Подключится в пункте 17» (disabled). Не seed-запись, просто UI-заглушка.

3. **Активируй поле «Доступные инструменты» в карточке агента:**
   - В `/blog/team/staff/[id]/page.tsx` (Сессия 11) — найди disabled placeholder «Доступные инструменты» (секция «Доступы»).
   - Замени на рабочие чекбоксы:
     - Загрузить список активных `executor`-инструментов из `GET /api/team/tools?type=executor&status=active`.
     - Текущие привязки из `GET /api/team/agents/:id/tools`.
     - Для каждого инструмента — чекбокс с именем + коротким описанием.
     - При изменении — `PUT /api/team/agents/:id/tools` с обновлённым списком `tool_ids`.
     - Визуально — аналогично allowlist шаблонов задач (чипы или чекбоксы в секции «Доступы»).

4. **Добавь подпапку «Инструменты» на страницу Инструкций:**
   - На `/blog/team/instructions/page.tsx` (Сессия 4) — добавь пятый блок «Инструменты» после «Навыки агентов» (пока заглушка) / «Шаблоны задач».
   - Содержимое: список файлов из `team-prompts/Инструменты/` через `GET /api/team/instructions/list` (расширить существующий эндпоинт, добавив категорию `tools`).
   - Каждый файл — кликабельный, открывает редактор (тот же, что для Mission/Goals/шаблонов). При сохранении — вызов `invalidatePromptCache()` через существующий эндпоинт.

5. **Обнови список сотрудников** (`/blog/team/staff/page.tsx`):
   - На каждой карточке агента — показывать количество подключённых инструментов: «2 инструмента» или «Нет инструментов».

6. **Не реализовывать в этой сессии:**
   - Heartbeat мониторинг NotebookLM-воркера → 🔁 пункт 17 (этап 5). Статус переключается вручную (active/inactive).
   - Проверку доступности инструмента перед запуском задачи → 🔁 пункт 17.
   - Очередь NotebookLM-воркера → 🔁 пункт 17.
   - Связку методичек с self-review → 🔁 пункт 11 (этап 4).

**Что делать после сессии:**

1. Локально: открыть Админку → видеть блок «Инструменты команды» с карточкой NotebookLM. Переключить статус → проверить, что сохранился.
2. Открыть «Инструменты Системы» → видеть placeholder Apify.
3. Открыть карточку агента → секция «Доступы» → чекбокс NotebookLM. Включить → поставить задачу → в превью промпта видеть третью секцию Awareness с текстом методички.
4. Открыть Инструкции → видеть блок «Инструменты» → кликнуть «NotebookLM.md» → отредактировать → сохранить → поставить задачу → методичка обновлена в промпте.
5. Список сотрудников: видеть «1 инструмент» на карточке агента с NotebookLM.
6. Закоммитить, push, деплой.

**Критерии готовности:**

- Блок «Инструменты команды» в Админке: карточка NotebookLM с переключателем статуса и кнопкой настроек.
- Блок «Инструменты Системы» в Админке: placeholder-карточка Apify.
- Карточка агента: рабочие чекбоксы инструментов в секции «Доступы».
- Страница Инструкций: блок «Инструменты» с кликабельным `NotebookLM.md` и работающим редактором.
- Привязка инструмента к агенту → методичка появляется в Awareness промпта.
- Отвязка инструмента → методичка исчезает из промпта.
- Редактирование методички → обновлённый текст в промпте при следующей задаче.
- Список сотрудников показывает количество инструментов.
- Никаких регрессий.

**Отклонения:**
- **Кнопка «Методичка»** в карточке инструмента в Админке ведёт на `/blog/team/instructions` (общая страница), а не на конкретный файл — текущий редактор Инструкций не поддерживает deep-link с auto-открытием. Влад находит файл в блоке «Инструменты» руками. Полноценный deep-link — позже (вряд ли отдельная сессия нужна).
- **Кнопка «Настройки»** в карточке инструмента не реализована — `connection_config` пока пуст для NotebookLM (воркер появится в пункте 17 этапа 5). Когда понадобится — добавим JSON-editor или поля по схеме.
- **«Инструменты Системы»** — статический placeholder с Apify, без CRUD. Реальная карточка Apify появится в Сессии 33 (пункт 17), когда подключим парсер базы конкурентов. Это согласуется с ТЗ: «На старте — placeholder-карточка “Apify” с текстом “Подключится в пункте 17”».
- **Чекбоксы инструментов в карточке агента** показывают и активные, и неактивные инструменты (последние помечены «(выключен)» серым). Влад может привязать неактивный — в Awareness он не попадёт, но привязка сохранится для будущего включения. Это соответствует поведению `toolService.getAgentTools({onlyActive:true})` в `promptBuilder`.
- **Счётчик инструментов на карточке списка** показывается только когда запрос успешно завершился (если упал — бейдж скрыт). Параллельные запросы по каждому агенту — допустимо для текущего масштаба команды (5-10 агентов).
- **Раздел «Инструменты» в Инструкциях** добавлен как четвёртый блок в той же сетке. Сетка переехала с `md:grid-cols-3` на `md:grid-cols-2 xl:grid-cols-4` — на средних экранах 2×2, на больших 1×4.

---

### Сессия 22 — Предложения от агентов: таблица, сервис, двухтактный процесс (этап 3, пункт 15)

**Цель:** Создать таблицу предложений `team_proposals`, сервис `proposalService`, таблицу дневника `team_agent_diary`, реализовать двухтактный процесс размышления (фильтр на Системной LLM → формулировка на основной модели), добавить глобальный тумблер «Проактивность команды» в `team_settings`.

**Что делать до сессии:**

- Убедиться, что миграция `0020` (Сессия 20) накачена. Следующая — `0021_team_proposals.sql`.
- Убедиться, что поле `autonomy_level` уже есть в `team_agents` (Сессия 9) — оно integer, default 0.

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0021_team_proposals.sql`:
   ```sql
   -- Таблица предложений от агентов
   CREATE TABLE IF NOT EXISTS team_proposals (
     id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
     agent_id TEXT NOT NULL REFERENCES team_agents(id),
     triggered_by TEXT NOT NULL,
     kind TEXT NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular', 'urgent', 'next_step')),
     payload JSONB NOT NULL DEFAULT '{}'::jsonb,
     status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     decided_at TIMESTAMPTZ,
     resulting_task_id TEXT
   );

   CREATE INDEX idx_team_proposals_status ON team_proposals(status) WHERE status = 'pending';
   CREATE INDEX idx_team_proposals_agent ON team_proposals(agent_id);

   COMMENT ON TABLE team_proposals IS 'Предложения задач от агентов с уровнем автономности 1. Кандидаты в задачи, не сами задачи.';

   -- Дневник наблюдений агента (пропуски в такте 1)
   CREATE TABLE IF NOT EXISTS team_agent_diary (
     id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
     agent_id TEXT NOT NULL REFERENCES team_agents(id),
     triggered_by TEXT NOT NULL,
     reason_to_skip TEXT NOT NULL,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now()
   );

   CREATE INDEX idx_team_agent_diary_agent ON team_agent_diary(agent_id);

   COMMENT ON TABLE team_agent_diary IS 'Read-only дневник: записи о пропусках агентом в такте 1 (фильтре). Диагностический инструмент.';

   -- Глобальный тумблер проактивности
   INSERT INTO team_settings (key, value)
   VALUES ('autonomy_enabled_globally', 'false')
   ON CONFLICT (key) DO NOTHING;
   ```

2. **Создай сервис** `backend/src/services/team/proposalService.js`:
   - `createProposal({ agent_id, triggered_by, kind, payload })` — INSERT в `team_proposals`. Перед вставкой проверить лимит: не более 3 pending-предложений в день на агента. При превышении — логировать и не вставлять (тихий отказ с логом).
   - `acceptProposal(id)` — UPDATE `status = 'accepted'`, `decided_at = now()`. Создать задачу в `team_tasks` из `payload` (поля `brief`, `task_type`, `project_id`), записать `resulting_task_id`. Создать нотификацию `proposal_accepted` (опциональная, для будущего Telegram).
   - `rejectProposal(id)` — UPDATE `status = 'rejected'`, `decided_at = now()`.
   - `expireOldProposals(days = 14)` — UPDATE `status = 'expired'` WHERE `status = 'pending'` AND `created_at < now() - interval '$1 days'`.
   - `getProposals({ agent_id?, status?, limit?, offset? })` — SELECT с фильтрами.
   - `getProposalById(id)` — SELECT.
   - `getPendingCount(agent_id)` — COUNT pending за сегодня.
   - `getLastUrgent(agent_id)` — SELECT последний urgent за 7 дней. Для проверки лимита «1 срочное в неделю».

3. **Создай сервис** `backend/src/services/team/triggerService.js`:
   - `checkAutonomyEnabled()` — читает `autonomy_enabled_globally` из `team_settings`. Если `false` — все триггеры спят.
   - `getEligibleAgents()` — SELECT из `team_agents` WHERE `autonomy_level >= 1` AND `status = 'active'`.
   - `runReflectionCycle(agent_id, triggered_by, context)` — двухтактный процесс:
     - **Такт 1 (фильтр):** Вызов `llmClient` с дешёвой моделью (Haiku / Flash — первый доступный ключ). Промпт: Role агента (секции «Когда я смотрю на свою зону» и «Когда я выхожу с предложением») + контекст триггера. Ожидаемый ответ: JSON `{ "should_propose": true/false, "reason": "..." }`. Если `false` — запись в `team_agent_diary` (`triggered_by`, `reason_to_skip = reason`). Конец.
     - **Такт 2 (формулировка):** Если такт 1 вернул `true` — вызов `llmClient` с основной моделью агента (из `team_agents.model`). Промпт: полный контекст (Mission + Role + Goals + Memory + контекст триггера). Ожидаемый ответ: JSON `{ "what": "...", "why": "...", "benefit": "...", "estimated_cost": "...", "vlad_time": "...", "urgency": "regular|urgent" }`. Создать `team_proposals` запись + нотификацию `proposal` в `team_notifications`.
   - Оба вызова — через `costTracker` с пометкой `source = 'autonomy'` (отдельная строка в биллинге).
   - **Cooldown:** перед запуском проверить, что у агента не было размышления по этому `triggered_by` за последние 7 дней (таблица `team_agent_diary` + `team_proposals`). Если было — пропустить.
   - **Таймаут окна «раз в 7 дней»:** при вызове `runWeeklyReflection(agent_id)` — передать `triggered_by = 'weekly_window'`, контекст = общий обзор (Goals + последние задачи агента).

4. **Добавь npm-скрипт для ручного запуска триггеров:**
   - `backend/scripts/run-triggers.js`:
     - Проверяет `autonomy_enabled_globally`.
     - Для каждого eligible-агента: проверяет, прошло ли 7 дней с последнего размышления; если да — `runReflectionCycle(agent_id, 'weekly_window', context)`.
     - В `package.json`: `"triggers:run": "node scripts/run-triggers.js"`.
   - На старте запускается руками (`npm run triggers:run`). Автоматизация через `node-cron` — позже, когда обкатается.

5. **Добавь API-маршруты** в `routes/team/proposals.js`:
   - `GET /api/team/proposals` — список (query: `agent_id`, `status`, `limit`, `offset`).
   - `GET /api/team/proposals/:id` — детали.
   - `PATCH /api/team/proposals/:id/accept` — принять. Body: опциональные правки `{ brief?, project_id? }` (принять с правками).
   - `PATCH /api/team/proposals/:id/reject` — отклонить.
   - Зарегистрируй с `requireAuth`.

6. **Добавь API для дневника:**
   - `GET /api/team/agents/:id/diary` — записи дневника агента (query: `limit`, `offset`). Только для агентов с `autonomy_level >= 1`.

7. **Расширь `notificationsService`:**
   - Добавь тип `proposal` в CHECK-constraint типов (или просто используй без ограничения, если таблица `team_notifications` уже создана без CHECK на type).
   - При создании proposal-нотификации: если `kind = 'urgent'` — добавить пометку в `payload` для визуальной маркировки ⚡.

8. **Расширь биллинг:**
   - В `costTracker.js`: при записи в `team_api_calls` принимать опциональное поле `source` (string, default `'task'`). Для тактов 1 и 2 передавать `source = 'autonomy'`.
   - В существующих эндпоинтах расходов (`GET /api/team/admin/costs`) — добавить группировку по `source` (если нет — в ответ добавить поле `autonomy_costs` отдельно от `task_costs`).

9. **Не реализовывать в этой сессии:**
   - UI предложений в Inbox → Сессия 23.
   - UI дневника в карточке агента → Сессия 23.
   - UI глобального тумблера в Админке → Сессия 23.
   - UI уровня автономности в карточке → Сессия 23.
   - Автоматические событийные триггеры (поллинг изменений в базах) → Сессия 24.
   - `node-cron` для автоматического еженедельного запуска → Сессия 24.
   - Дублирование в Telegram → 🔁 пункт 20 (этап 6).

**Что делать после сессии:**

1. Накатить миграцию `0021_team_proposals.sql` через Supabase Dashboard.
2. В `team_settings` — проверить, что запись `autonomy_enabled_globally = 'false'` существует.
3. Через Supabase Dashboard: вручную установить `autonomy_level = 1` у тестового агента. Убедиться, что в его Role-файле есть блоки «Когда я смотрю на свою зону» и «Когда я выхожу с предложением» (если нет — добавить вручную через `/blog/team/instructions`).
4. Вручную установить `autonomy_enabled_globally = 'true'` в `team_settings`.
5. Запустить: `npm run triggers:run`. В логах увидеть: «Агент X: такт 1 → [да/нет]», если да — «такт 2 → предложение создано».
6. Через API: `GET /api/team/proposals` — видеть предложение.
7. `PATCH /api/team/proposals/:id/accept` — видеть, что задача создана в `team_tasks`.
8. `GET /api/team/agents/:id/diary` — видеть записи пропусков (если такт 1 ответил «нет»).
9. Закоммитить, push, деплой.

**Критерии готовности:**

- Таблица `team_proposals` создана, CRUD через API работает.
- Таблица `team_agent_diary` создана, read API работает.
- Двухтактный процесс: такт 1 (фильтр на дешёвой модели) → такт 2 (формулировка на основной). Оба записывают расходы с `source = 'autonomy'`.
- Лимиты работают: 3 предложения в день на агента, 1 срочное в неделю.
- Cooldown 7 дней на один тип триггера работает.
- Принятие предложения создаёт задачу в `team_tasks`.
- Принятие с правками (изменённый бриф) работает.
- Расходы на автономность выделены отдельной строкой в биллинге.
- `npm run triggers:run` запускает цикл размышления для eligible-агентов.
- Никаких регрессий.

---

### Сессия 23 — UI автономности: предложения в Inbox, дневник, тумблер (этап 3, пункт 15)

**Цель:** Отобразить предложения от агентов в Inbox дашборда и колокольчике, добавить вкладку «Дневник» в карточке агента, добавить UI уровня автономности в карточке, добавить глобальный тумблер «Проактивность команды» в Админку.

**Что делать до сессии:**

- Убедиться, что Сессия 22 выполнена (таблицы + API + двухтактный процесс работают).
- Никаких миграций. Все изменения — фронтенд.

**ТЗ для Claude Code:**

1. **Обнови блок «Требует внимания» на дашборде** (Сессия 18):
   - В `GET /api/team/notifications/summary` — тип `proposal` уже учитывается.
   - В блоке Inbox: новая строка «🎯 N предложений от агентов» → ссылка на раскрывающуюся панель (или отдельную страницу `/blog/team/dashboard/proposals`).
   - Раскрывающаяся панель/страница: список pending-предложений из `GET /api/team/proposals?status=pending`:
     - На каждой карточке: аватар + имя агента, текст «Что», «Зачем», «Стоимость», «Время Влада».
     - Срочные (⚡) — наверху, с визуальной пометкой.
     - Две кнопки: «Принять» → `PATCH /accept` (переход к форме задачи с преднабранным брифом), «Отклонить» → `PATCH /reject`.
     - «Принять с правками»: при клике «Принять» — бриф editable в textarea перед финальным созданием задачи.

2. **Обнови колокольчик в шапке** (Сессия 18):
   - Тип `proposal` уже считается в `getUnreadGrouped()`.
   - В dropdown: строка «Предложения: N» с иконкой 🎯 → клик → переход на Inbox дашборда.

3. **Добавь вкладку «Дневник» в карточке агента:**
   - В `/blog/team/staff/[id]/page.tsx` (Сессия 11) — новая вкладка «Дневник» (рядом с «Правила», «Эпизоды»).
   - Видна только если `autonomy_level >= 1`.
   - Read-only список записей из `GET /api/team/agents/:id/diary`:
     - Дата, тип триггера (`triggered_by`), причина пропуска (`reason_to_skip`).
   - Пагинация (или infinite scroll).
   - Если записей нет — «Дневник пока пуст. Записи появятся после первого цикла размышления.»

4. **Добавь UI уровня автономности в карточке агента:**
   - В секции «О сотруднике» или «Доступы» — переключатель «Уровень автономности»: 0 (Реактивный) / 1 (С правом инициативы).
   - При попытке переключить на 1 — проверить в Role-файле наличие блоков «Когда я смотрю на свою зону» и «Когда я выхожу с предложением»:
     - Загрузить Role из Storage → парсить наличие двух заголовков.
     - Если блоков нет — модальное окно: «Для включения автономности в Role агента должны быть блоки: [список]. Добавьте их в разделе Инструкции → Должностные инструкции.» Переключение не происходит.
     - Если блоки есть — `PATCH /api/team/agents/:id` с `{ autonomy_level: 1 }`.
   - При переключении обратно на 0 — без проверок, `PATCH` с `{ autonomy_level: 0 }`.

5. **Добавь глобальный тумблер в Админку:**
   - На странице `/blog/team/admin/page.tsx` — новая секция «Проактивность команды».
   - Тумблер «Вкл / Выкл» — читает/пишет `autonomy_enabled_globally` в `team_settings`.
   - Текст: «Когда выключено — агенты не формируют предложений. Suggested Next Steps в задачах продолжают работать.»
   - Рядом — мелким шрифтом: «Расходы на автономность за период: $X.XX» (из `GET /api/team/admin/costs`, фильтр `source = 'autonomy'`).

6. **Обнови список сотрудников:**
   - На карточке агента с `autonomy_level = 1` — бейдж «🎯 Инициативный» (или аналогичный).

7. **Не реализовывать в этой сессии:**
   - Автоматические событийные триггеры → Сессия 24.
   - `node-cron` → Сессия 24.

**Что делать после сессии:**

1. Создать тестовое предложение (через `npm run triggers:run` или руками через API `POST /api/team/proposals`).
2. Открыть дашборд → Inbox → видеть «🎯 1 предложение».
3. Кликнуть → видеть карточку с «Что/Зачем/Стоимость/Время Влада».
4. Принять → задача создана, предложение исчезло из pending.
5. Создать срочное предложение → видеть ⚡ наверху Inbox.
6. Открыть карточку агента → вкладка «Дневник» → видеть записи пропусков.
7. Переключить автономность на 0 → вкладка «Дневник» исчезает.
8. Попробовать включить автономность без блоков в Role → модальное окно с предупреждением.
9. Проверить тумблер в Админке: выключить → `npm run triggers:run` → ничего не происходит.
10. Закоммитить, push, деплой.

**Критерии готовности:**

- Предложения отображаются в Inbox дашборда и колокольчике.
- Принятие/отклонение работает. Принятие с правками — работает.
- Срочные предложения (⚡) наверху Inbox.
- Вкладка «Дневник» в карточке: read-only, пагинация, только для `autonomy_level >= 1`.
- Переключатель автономности: проверка Role-блоков при включении.
- Тумблер в Админке: вкл/выкл проактивности + отображение расходов.
- Бейдж «Инициативный» на карточке агента в списке.
- Никаких регрессий.

---

### Сессия 24 — Событийные триггеры и автоматизация цикла размышления (этап 3, пункт 15)

**Цель:** Реализовать поллинг событийных триггеров (новая запись в базе, низкая оценка задачи, изменение Goals), автоматизировать еженедельный цикл размышления через `node-cron`, добавить автоматическое истечение (expire) старых предложений.

**Что делать до сессии:**

- Убедиться, что Сессии 22-23 выполнены.
- Никаких миграций. Все изменения — бэкенд.

**ТЗ для Claude Code:**

1. **Реализуй поллинг событийных триггеров** в `triggerService.js`:
   - Новая функция `pollEventTriggers()`:
     - Для каждого eligible-агента (autonomy_level >= 1, status active):
       - **Триггер «новая запись в базе»:** Проверить `team_custom_databases` и связанные таблицы — есть ли записи с `created_at` > последнего checked timestamp. Timestamp хранить в `team_agent_diary` (или отдельной таблице `team_trigger_state`). Если да и cooldown 7 дней прошёл — `runReflectionCycle(agent_id, 'new_db_record', { database_name, record_count })`.
       - **Триггер «низкая оценка»:** Проверить `team_feedback_episodes` — есть ли записи с `score <= 2` и `agent_id = текущий` и `created_at` > последний checked. Если да и cooldown — `runReflectionCycle(agent_id, 'low_score', { task_id, score })`.
       - **Триггер «изменение Goals»:** Проверить `updated_at` файла `Цели на период.md` в Storage (через `teamStorage.getFileInfo()`). Если обновлено после последнего checked — `runReflectionCycle(agent_id, 'goals_changed', {})`.
   - Состояние «последний checked» хранить в памяти (in-process) или в новой мини-таблице / в `team_settings` как JSON. Решение: простая таблица `team_trigger_state` (`agent_id`, `trigger_type`, `last_checked_at`).

2. **Добавь миграцию** (inline в коде, или как `0022_team_trigger_state.sql` если нужно):
   ```sql
   CREATE TABLE IF NOT EXISTS team_trigger_state (
     agent_id TEXT NOT NULL REFERENCES team_agents(id) ON DELETE CASCADE,
     trigger_type TEXT NOT NULL,
     last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     PRIMARY KEY (agent_id, trigger_type)
   );
   ```

3. **Автоматизируй через `node-cron`:**
   - В `backend/src/index.js` (или отдельный файл `backend/src/cron/autonomyCron.js`):
     - Раз в 6 часов: `pollEventTriggers()` (проверка событийных триггеров).
     - Раз в 24 часа (утро): `runWeeklyReflections()` — для каждого eligible-агента проверяет, прошло ли 7 дней с последнего размышления; если да — `runReflectionCycle(agent_id, 'weekly_window', ...)`.
     - Раз в 24 часа (ночь): `expireOldProposals(14)` — автоматическое истечение pending > 14 дней.
   - Все cron-задачи работают **только если** `autonomy_enabled_globally = true`.
   - Логирование: каждый запуск — строка в `console.log` с количеством проверенных агентов и созданных предложений.

4. **Обнови `npm run triggers:run`:**
   - Теперь запускает и `pollEventTriggers()`, и `runWeeklyReflections()`, и `expireOldProposals(14)` — полный цикл.
   - Для отладки: `npm run triggers:run -- --agent <id>` — запуск только для одного агента.

5. **Не реализовывать в этой сессии:**
   - Триггеры через webhooks/realtime Supabase → оставляем поллинг (проще, надёжнее на старте).
   - Регулярные задачи (по расписанию) → UI-заглушка уже есть (Сессия 19), содержимое — позже.
   - Дублирование в Telegram → 🔁 пункт 20 (этап 6).

**Что делать после сессии:**

1. Создать тестовую ситуацию: добавить запись в базу, оценить задачу на 2.
2. Запустить `npm run triggers:run` → проверить, что триггеры сработали, предложения созданы (или пропущены с записью в дневнике).
3. Проверить cooldown: повторный запуск `npm run triggers:run` → тот же триггер не срабатывает повторно.
4. Подождать или симулировать 14+ дней для pending-предложения → `expireOldProposals` переводит в `expired`.
5. Проверить cron: перезапустить бэкенд, дождаться 6 часов (или уменьшить интервал для теста) → в Railway Logs видеть «Autonomy cron: checked N agents, created M proposals».
6. Закоммитить, push, деплой.

**Критерии готовности:**

- Событийные триггеры (новая запись в базе, низкая оценка, изменение Goals) срабатывают при поллинге.
- Cooldown 7 дней на trigger_type работает.
- Еженедельное окно размышления (`weekly_window`) работает.
- `node-cron` запускает поллинг каждые 6 часов, еженедельные — каждые 24 часа.
- Автоматическое expire pending > 14 дней работает.
- Таблица `team_trigger_state` хранит timestamps последних проверок.
- Все cron-задачи молчат при `autonomy_enabled_globally = false`.
- `npm run triggers:run` — ручной запуск полного цикла для отладки.
- Никаких регрессий.

---

### Сессия 25 — Skills: Storage, сервис, загрузка в промпт (этап 4, пункт 10)

**Цель:** Создать инфраструктуру skills — папку в Supabase Storage, сервис CRUD для markdown-файлов, загрузку активных skills в слой промпта (замена заглушки из Сессии 6), настройку порога оценки в Админке.

**Что делать до сессии:**

- Убедиться, что миграция `0022` накачена. Следующая будет `0023_team_skill_candidates.sql`.
- Ничего больше — все изменения в коде + одна миграция.

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0023_team_skill_candidates.sql`:
   ```sql
   -- Таблица кандидатов в навыки (аналог кандидатов в правила, но отдельная)
   CREATE TABLE IF NOT EXISTS team_skill_candidates (
     id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
     agent_id TEXT NOT NULL REFERENCES team_agents(id),
     task_id TEXT NOT NULL,
     score INTEGER NOT NULL,
     skill_name TEXT NOT NULL,
     when_to_apply TEXT NOT NULL,
     what_to_do TEXT NOT NULL,
     why_it_works TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
     vlad_comment TEXT,
     created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
     reviewed_at TIMESTAMPTZ
   );

   CREATE INDEX idx_skill_candidates_agent ON team_skill_candidates(agent_id);
   CREATE INDEX idx_skill_candidates_status ON team_skill_candidates(status);

   COMMENT ON TABLE team_skill_candidates IS 'Кандидаты в навыки, извлечённые из успешных задач. Аналог кандидатов в правила, но для positive learning.';

   -- Настройка порога оценки для skill extraction
   ALTER TABLE team_settings
     ADD COLUMN IF NOT EXISTS skill_extraction_threshold INTEGER NOT NULL DEFAULT 5;

   COMMENT ON COLUMN team_settings.skill_extraction_threshold IS 'Минимальная оценка задачи для немедленного skill extraction (по умолчанию 5). При 4 — батчем.';
   ```

2. **Создай сервис** `backend/src/services/team/skillService.js`:
   - Импортирует `teamSupabase` и `teamStorage` (или аналогичные утилиты для Supabase Storage).
   - **`getSkillsForAgent(agentId)`** — читает все `.md` файлы из `team-prompts/Навыки агентов/<agent_name>/` (имя агента берётся через `agentService.getAgent(agentId)`). Для каждого файла парсит YAML frontmatter (используй простой regex или `gray-matter` — если `gray-matter` не установлен, установи). Возвращает массив объектов `{ skill_name, status, use_count, last_used, content, filename }`. Фильтрует по `status IN ('active', 'pinned')`.
   - **`getSkillsContentForPrompt(agentId)`** — вызывает `getSkillsForAgent`, собирает markdown-строку из всех активных skills, формат:
     ```
     ### <skill_name>

     **Когда применять:** <текст секции>

     **Что делать:**
     <текст секции>
     ```
     Секция «Почему работает» НЕ включается в промпт — она для Влада, не для модели. Возвращает строку или пустую строку если skills нет.
   - **`createSkillFile(agentId, skillData)`** — создаёт markdown-файл в Storage. `skillData` содержит `{ skill_name, when_to_apply, what_to_do, why_it_works, task_id }`. Генерирует YAML frontmatter (`agent`, `skill_name`, `created_at`, `last_used: null`, `use_count: 0`, `status: 'active'`). Имя файла — slug из `skill_name` (транслитерация кириллицы + kebab-case). Путь: `team-prompts/Навыки агентов/<agent_display_name>/<slug>.md`.
   - **`updateSkillFile(agentId, filename, updates)`** — обновляет содержимое и/или frontmatter файла. Перечитывает, парсит, мержит, перезаписывает.
   - **`archiveSkill(agentId, filename)`** — обновляет frontmatter: `status: 'archived'`. Файл НЕ удаляется — остаётся в Storage, но не попадает в промпт.
   - **`deleteSkillFile(agentId, filename)`** — физическое удаление из Storage (для Влада, если хочет убрать совсем).
   - **`listSkillFiles(agentId)`** — список файлов без чтения содержимого (для UI списка).
   - **`incrementSkillUsage(agentId, filename)`** — обновляет `use_count` и `last_used` в frontmatter.
   - Все сообщения об ошибках на русском.

3. **Обнови `promptBuilder.js`** — замени заглушку слоя Skills:
   - Импортируй `skillService.getSkillsContentForPrompt`.
   - В функции `buildPrompt()` (или аналогичной) замени блок, который возвращал пустую строку для skills, на вызов `getSkillsContentForPrompt(agentId)`.
   - Оберни блок skills в разделитель как у Memory:
     ```
     ═══ SKILLS (Накопленные навыки) ═══
     <содержимое>
     ═══ /SKILLS ═══
     ```
   - Если skills пусто — блок не выводится (как у Memory).
   - Skills кешируется через `cache_control: { type: 'ephemeral' }` — добавь в массив кешируемых блоков.
   - Инвалидация: при вызове `invalidatePromptCache()` (уже существует из Сессии 12) — skills тоже сбрасываются.

4. **Создай API-маршруты** `backend/src/routes/team/skills.js`:
   - `GET /api/team/skills/:agentId` — список skills агента (вызов `listSkillFiles` + `getSkillsForAgent` для деталей).
   - `POST /api/team/skills/:agentId` — создание нового skill-файла (body: `{ skill_name, when_to_apply, what_to_do, why_it_works, task_id }`). Вызывает `createSkillFile`.
   - `PUT /api/team/skills/:agentId/:filename` — обновление (body: `{ when_to_apply?, what_to_do?, why_it_works?, status? }`).
   - `DELETE /api/team/skills/:agentId/:filename` — удаление файла.
   - `PATCH /api/team/skills/:agentId/:filename/archive` — архивирование (смена status → archived).
   - `PATCH /api/team/skills/:agentId/:filename/pin` — пин (status → pinned).
   - Все маршруты за `requireAuth`.
   - Зарегистрируй в основном роутере бэкенда.

5. **Создай папку в Storage** — добавь в существующий seed-скрипт (или создай `backend/scripts/init-skills-folder.js`):
   - Идемпотентно создаёт папку `Навыки агентов/` внутри bucket `team-prompts` (Supabase Storage создаёт «папку» при загрузке файла — загрузи `.gitkeep` или пустой `README.md` в путь `Навыки агентов/.gitkeep`).
   - Для каждого существующего агента (`team_agents` с `status = 'active'`) создаёт подпапку: `Навыки агентов/<display_name>/.gitkeep`.
   - Добавь npm-скрипт: `"init:skills": "node scripts/init-skills-folder.js"`.

6. **Обнови страницу Инструкций** (`frontend/src/app/blog/team/instructions/page.tsx`):
   - Добавь четвёртый блок **«Навыки агентов»** после «Шаблоны задач». Стиль — как у остальных блоков.
   - Содержимое: список подпапок (имена агентов) → при клике раскрывается список `.md` файлов внутри.
   - На старте — пусто (skills ещё не созданы). Пустое состояние: «Навыки появятся по мере работы команды. Они извлекаются из задач с высокой оценкой.»
   - Клик по файлу — открывает редактор (textarea с автосохранением, как для Role-файлов).

7. **Обнови карточку агента** (`frontend/src/app/blog/team/staff/[id]/page.tsx`):
   - Добавь вкладку **«Навыки»** рядом с «Правила» и «Эпизоды».
   - Содержимое: таблица skills агента — имя, статус (active/pinned/archived), use_count, last_used.
   - Кнопка «+ Добавить навык вручную» — открывает форму с тремя полями: «Когда применять», «Что делать», «Почему работает». POST на `/api/team/skills/:agentId`.
   - На каждой строке: кнопки «Архивировать» / «Закрепить» / «Удалить» (с confirm-диалогом на удаление).
   - Пустое состояние: «У этого сотрудника пока нет навыков.»

8. **Добавь настройку порога в Админке** (`frontend/src/app/blog/team/admin/page.tsx`):
   - В существующий блок настроек добавь секцию **«Навыки»**.
   - Поле: «Порог оценки для извлечения навыков» — dropdown с вариантами: «Только 5/5», «4/5 и выше», «3/5 и выше». Дефолт — «Только 5/5». Сохраняется в `team_settings.skill_extraction_threshold`.
   - Пояснение под полем: «При этой оценке система сразу анализирует задачу на предмет переиспользуемого паттерна. Задачи с оценкой на 1 ниже порога обрабатываются батчем.»

9. **Не реализовывать в этой сессии:**
   - Автоматический skill extraction (анализ задач через LLM) — Сессия 26.
   - Экран «Кандидаты в навыки» — Сессия 27.
   - Уведомления `skill_candidate` в Inbox — Сессия 27.
   - Фильтрация skills по типу задачи (когда 20+) — отложено.
   - Skill self-improvement — ❌ осознанно.

**Что делать после сессии:**

1. Накатить миграцию `0023` через Supabase Dashboard → SQL Editor.
2. Запустить `npm run init:skills` — убедиться, что папка `Навыки агентов/` создана с подпапками для каждого активного агента.
3. Локально: `npm run dev`. Открыть `/blog/team/instructions/` — видеть блок «Навыки агентов» (пустой).
4. Открыть карточку любого агента → вкладка «Навыки» → «Добавить навык вручную» → заполнить три поля → сохранить. Навык появляется в списке.
5. Поставить тестовую задачу этому агенту → в превью промпта видеть блок `═══ SKILLS ═══` с содержимым навыка.
6. В Админке: секция «Навыки» видна, dropdown порога работает, значение сохраняется.
7. В разделе Инструкций: кликнуть по имени агента → увидеть созданный `.md` файл → кликнуть → открыть редактор.
8. Закоммитить, push, деплой. Накатить миграцию на проде.

**Критерии готовности:**

- Таблица `team_skill_candidates` существует с индексами.
- Колонка `skill_extraction_threshold` в `team_settings` с дефолтом 5.
- Сервис `skillService.js` экспортирует все перечисленные методы.
- API `/api/team/skills/:agentId` работает: CRUD операции.
- В `promptBuilder.js` слой Skills загружает реальные файлы из Storage (заглушка убрана).
- Вкладка «Навыки» в карточке агента: CRUD через UI.
- Блок «Навыки агентов» на странице Инструкций с раскрывающимися подпапками.
- Dropdown порога в Админке работает и сохраняет значение.
- Никаких регрессий в OAuth, лимитах, sidebar, Инструкциях, Базах, дашборде.

---

### Сессия 26 — Skill extraction: автоматический анализ успешных задач (этап 4, пункт 10)

**Цель:** Реализовать автоматическое извлечение кандидатов в навыки из задач с высокой оценкой — мини-проход на LLM после оценки, запись кандидата в `team_skill_candidates`, батчевая обработка при сжатии эпизодов.

**Что делать до сессии:**

- Убедиться, что миграция `0023` накачена и `skillService.js` работает (Сессия 25 завершена).

**ТЗ для Claude Code:**

1. **Создай сервис** `backend/src/services/team/skillExtractorService.js`:
   - Импортирует `llmClient`, `skillService`, `teamSupabase`.
   - **`extractSkillCandidate(task, agent, score, comment)`** — основная функция:
     - Получает из БД: правила агента (`getRulesForAgent`), существующие skills (`getSkillsForAgent`), результат задачи из `team_tasks` (поле `result` или `output`).
     - Формирует промпт для LLM (текст промпта ниже, хардкодить в файле как константу `SKILL_EXTRACTION_PROMPT`):
       ```
       Ты анализируешь успешно выполненную задачу агента.

       Агент: {{agent_name}} ({{agent_position}})
       Задача: {{task_title}}
       Бриф: {{task_brief}}
       Использованные правила Memory: {{rules_list}}
       Применённые навыки: {{skills_list}}
       Финальный результат (первые 2000 символов): {{result_truncated}}
       Оценка Влада: {{score}}/5
       Комментарий Влада: {{comment}}

       Извлеки переиспользуемый паттерн, если он есть.
       Не каждое успешное выполнение — повод для нового навыка.
       Не предлагай навык, если результат был получен прямой
       комбинацией существующих правил и шаблона задачи.

       Ответь строго в формате JSON:
       {
         "has_pattern": true/false,
         "skill_name": "короткое название",
         "when_to_apply": "контекст применения",
         "what_to_do": "рецепт шагов",
         "why_it_works": "обоснование"
       }

       Если паттерна нет — {"has_pattern": false}.
       ```
     - Вызывает `llmClient` с любым доступным провайдером (как `feedbackParserService`).
     - Парсит JSON-ответ (с try/catch и очисткой от markdown-блоков).
     - Если `has_pattern = true` — записывает в `team_skill_candidates`:
       ```js
       { agent_id, task_id, score, skill_name, when_to_apply, what_to_do, why_it_works, status: 'pending' }
       ```
     - Записывает вызов в `team_api_calls` через `costTracker` с `source: 'skill_extraction'`.
     - Возвращает `{ extracted: true/false, candidate_id? }`.
   - **`processBatchSkillExtraction(agentId)`** — для задач с оценкой на 1 ниже порога, которые ещё не обработаны:
     - Читает `skill_extraction_threshold` из `team_settings`.
     - Ищет в `team_tasks` задачи этого агента: оценка = `threshold - 1`, `status = 'done'`, нет записи в `team_skill_candidates` с тем же `task_id`.
     - Для каждой — вызывает `extractSkillCandidate`. Между вызовами — задержка 1 секунда (rate limiting).
     - Возвращает массив результатов.

2. **Интегрируй в flow оценки задачи:**
   - Найди место, где Влад ставит оценку (предположительно в маршруте `POST /api/team/feedback` или в `taskRunner.markTaskDone` — посмотри реализацию Сессии 14).
   - После записи оценки добавь асинхронный вызов:
     ```js
     const threshold = await getSkillExtractionThreshold(); // из team_settings
     if (score >= threshold) {
       // Немедленный extraction — асинхронно, не блокирует ответ Владу
       setImmediate(() => {
         skillExtractorService.extractSkillCandidate(task, agent, score, comment)
           .catch(err => console.error('Skill extraction failed:', err.message));
       });
     }
     // Задачи с score = threshold - 1 обрабатываются батчем (Сессия 24 или ручной скрипт)
     ```

3. **Интегрируй батчевую обработку с существующим cron:**
   - В существующий cron-job из Сессии 24 (если есть `node-cron` задача, которая запускает `compress-episodes.js`) — добавь после сжатия эпизодов вызов `processBatchSkillExtraction` для каждого активного агента.
   - Если cron-задачи ещё нет — добавь в `teamCronJobs.js` (или аналог):
     ```js
     // Батч skill extraction — после сжатия эпизодов
     for (const agent of activeAgents) {
       await skillExtractorService.processBatchSkillExtraction(agent.id);
     }
     ```

4. **Создай скрипт** `backend/scripts/extract-skills.js` для ручного запуска:
   - Принимает опционально `--agent=<id>` (если не указан — все активные).
   - Для каждого агента вызывает `processBatchSkillExtraction`.
   - Лог на русском: «Агент Маша: найдено 2 кандидата в навыки», «Агент Алексей: кандидатов не найдено».
   - Добавь npm-скрипт: `"extract:skills": "node scripts/extract-skills.js"`.

5. **Обнови `costTracker.js`:**
   - Добавь `source: 'skill_extraction'` в список допустимых source (если есть enum/check). Если нет — просто передавай строку в `recordApiCall`.

6. **Не реализовывать в этой сессии:**
   - UI экрана «Кандидаты в навыки» — Сессия 27.
   - Уведомления в Inbox — Сессия 27.
   - Skill self-improvement — ❌ осознанно.

**Что делать после сессии:**

1. Локально: поставить задачу агенту, дождаться завершения, поставить оценку 5/5 с комментарием.
2. В Railway Logs (или console) увидеть лог skill extraction: «Skill extraction для задачи X: найден паттерн» или «паттерн не найден».
3. В Supabase Dashboard: проверить таблицу `team_skill_candidates` — если паттерн найден, должна быть запись со статусом `pending`.
4. Запустить `npm run extract:skills` — увидеть лог по всем агентам.
5. В `team_api_calls`: проверить наличие записи с `source = 'skill_extraction'`.
6. Закоммитить, push, деплой.

**Критерии готовности:**

- Сервис `skillExtractorService.js` экспортирует `extractSkillCandidate` и `processBatchSkillExtraction`.
- При оценке 5/5 — автоматический асинхронный вызов skill extraction.
- При оценке 4/5 — задача обрабатывается при следующем батче (cron или ручной скрипт).
- Кандидаты записываются в `team_skill_candidates` со статусом `pending`.
- Расходы на extraction отражаются в `team_api_calls` с `source = 'skill_extraction'`.
- Скрипт `npm run extract:skills` работает для ручного запуска.
- Никаких регрессий.

---

### Сессия 27 — Экран «Кандидаты в навыки» и интеграция с Inbox (этап 4, пункт 10)

**Цель:** Создать отдельную страницу для одобрения/отклонения кандидатов в навыки, подключить тип `skill_candidate` к Inbox внимания и колокольчику, реализовать кнопки «Принять» / «Принять с правкой» / «Отклонить».

**Что делать до сессии:**

- Убедиться, что Сессия 26 завершена и в `team_skill_candidates` есть хотя бы одна запись (если нет — создать вручную через SQL или через `npm run extract:skills`).

**ТЗ для Claude Code:**

1. **Создай страницу** `frontend/src/app/blog/team/staff/skill-candidates/page.tsx`:
   - Заголовок: «Кандидаты в навыки».
   - Подзаголовок: «Паттерны, извлечённые из успешных задач. Одобрите — и навык будет подкладываться в промпт при следующих задачах.»
   - Загружает данные: `GET /api/team/skill-candidates?status=pending`.
   - Каждый кандидат — карточка:
     - Шапка: аватар + имя агента, дата, оценка задачи (с эмодзи ⭐).
     - Предложенное имя навыка (жирным).
     - Три секции (раскрывающиеся или все видимые — как у кандидатов в правила):
       - «Когда применять» — текст.
       - «Что делать» — текст.
       - «Почему работает» — текст.
     - Ссылка «Исходная задача» — кликабельная, ведёт на карточку задачи.
     - Три кнопки:
       - **«✅ Принять»** — создаёт `.md` файл через `POST /api/team/skills/:agentId`, обновляет `team_skill_candidates.status = 'approved'`, `reviewed_at = now()`. Карточка исчезает из списка.
       - **«✏️ Принять с правкой»** — раскрывает inline-форму с тремя textarea (предзаполненные текстом кандидата + поле «имя навыка»). Кнопка «Сохранить» → тот же flow, но с отредактированным содержимым.
       - **«❌ Отклонить»** — обновляет `status = 'rejected'`, опционально `vlad_comment` (textarea). Карточка исчезает.
   - Пустое состояние: «Нет новых кандидатов. Навыки извлекаются из задач с высокой оценкой автоматически.»
   - Внизу — ссылка «Посмотреть отклонённые / одобренные» → фильтр по статусу (toggle: pending / approved / rejected / all).

2. **Создай API-маршруты** для кандидатов `backend/src/routes/team/skillCandidates.js`:
   - `GET /api/team/skill-candidates?status=pending&agent_id=<optional>` — список кандидатов с join на `team_agents` (имя, аватар).
   - `PATCH /api/team/skill-candidates/:id/approve` — body: `{ skill_name?, when_to_apply?, what_to_do?, why_it_works? }` (опциональные правки). Создаёт skill-файл через `skillService.createSkillFile`, обновляет статус → `approved`, `reviewed_at = now()`. Создаёт уведомление `skill_approved` (опционально, для будущего).
   - `PATCH /api/team/skill-candidates/:id/reject` — body: `{ vlad_comment? }`. Обновляет статус → `rejected`, `reviewed_at`, `vlad_comment`.
   - Все маршруты за `requireAuth`.
   - Зарегистрируй в основном роутере.

3. **Расширь `notificationsService`:**
   - Добавь тип `skill_candidate` в список допустимых типов уведомлений.
   - В `skillExtractorService.extractSkillCandidate` (после успешной записи кандидата) — вызови `notificationsService.create({ type: 'skill_candidate', agent_id, reference_id: candidate_id, title: 'Новый кандидат в навыки от <agent_name>' })`.
   - В обработчике approve/reject — помечай уведомление как прочитанное (`read_at = now()`).

4. **Обнови Inbox / колокольчик:**
   - В существующем компоненте Inbox (блок «Требует внимания» на дашборде, Сессия 18) — добавь группу «🎓 Кандидаты в навыки» с бейджем-счётчиком (count pending skill_candidate уведомлений).
   - Клик по группе → redirect на `/blog/team/staff/skill-candidates`.
   - В dropdown колокольчика — элементы типа `skill_candidate` отображаются с текстом: «Новый кандидат в навыки: <skill_name> от <agent_name>». Клик → та же страница.

5. **Добавь ссылку в sidebar:**
   - В подменю «Сотрудники» (или в том месте, где живёт ссылка на `/staff/candidates`) добавь пункт **«Кандидаты в навыки»** → `/blog/team/staff/skill-candidates`.
   - Стиль — как у «Кандидатов в правила».
   - Бейдж — количество pending (если > 0).

6. **Не реализовывать в этой сессии:**
   - Skill self-improvement — ❌ осознанно.
   - Skills marketplace / шаринг между агентами — ❌ осознанно.
   - Фильтрация skills по типу задачи (20+ skills) — отложено.
   - Автоматическое применение без проверки релевантности — на старте все active skills в промпт.
   - Stale-флаг для skills через Curator — 🔁 пункт 15 (этап 3, Curator проходит и по skills).

**Что делать после сессии:**

1. Локально: открыть `/blog/team/staff/skill-candidates` — увидеть карточки кандидатов (если есть pending).
2. Нажать «Принять» на одном кандидате → проверить, что `.md` файл появился в Storage (`team-prompts/Навыки агентов/<agent>/`).
3. Нажать «Принять с правкой» на другом → отредактировать текст → сохранить → файл с изменённым содержимым.
4. Нажать «Отклонить» на третьем → проверить, что статус стал `rejected`.
5. Проверить дашборд: блок «Требует внимания» → группа «Кандидаты в навыки» с корректным счётчиком.
6. Проверить колокольчик: новые уведомления типа `skill_candidate`.
7. Поставить задачу агенту, у которого теперь есть skill → в превью промпта увидеть блок SKILLS с новым навыком.
8. В sidebar: пункт «Кандидаты в навыки» виден и работает.
9. Закоммитить, push, деплой. Накатить миграцию на проде (если не накачена ранее).

**Критерии готовности:**

- Страница `/blog/team/staff/skill-candidates` загружается, отображает pending-кандидатов.
- «Принять» → skill-файл создаётся в Storage, кандидат → approved, уведомление → read.
- «Принять с правкой» → файл создаётся с изменённым содержимым.
- «Отклонить» → кандидат → rejected, опциональный комментарий сохраняется.
- Inbox на дашборде: группа «Кандидаты в навыки» с бейджем.
- Колокольчик: уведомления `skill_candidate`.
- Sidebar: пункт «Кандидаты в навыки» с бейджем pending.
- Принятый skill отображается в промпте при следующей задаче агента.
- Никаких регрессий.

---

### Сессия 28 — Счётчик токенов в UI (этап 4, пункт 11)

**Цель:** Добавить подсчёт токенов в редакторах инструктивных файлов (Mission, Role, Goals, Skills) и итоговую сводку в карточке агента с цветовой подсветкой — визуальный сигнал «толстеющего» промпта.

**Что делать до сессии:**

- Ничего. Все изменения — фронтенд + один npm-пакет.

**ТЗ для Claude Code:**

1. **Установи `js-tiktoken`** в `frontend/package.json`. Это WASM-пакет, работает в браузере без API-вызовов. Используй encoding `cl100k_base` — он ближе всего к реальным tokenizer'ам Claude и GPT-4. Счёт будет приближённый (±10%), но этого достаточно для визуального сигнала.

2. **Создай утилиту** `frontend/src/lib/tokenCounter.ts`:
   - Экспортирует `countTokens(text: string): number` — ленивая инициализация encoding (один раз при первом вызове, потом reuse).
   - Экспортирует `getTokenBadgeColor(count: number): string` — возвращает CSS-класс или hex-цвет:
     - `count < 15000` → зелёный (`#22c55e`)
     - `count < 25000` → жёлтый (`#eab308`)
     - `count < 40000` → оранжевый (`#f97316`)
     - `count >= 40000` → красный (`#ef4444`)
   - Экспортирует `formatTokenCount(count: number): string` — «12.3K» / «1.5K» / «850».

3. **Добавь счётчик в редакторы инструктивных файлов:**
   - Найди компонент textarea/editor, используемый на странице `/blog/team/instructions/` для редактирования файлов (Mission.md, Goals.md, Role-файлы, Skill-файлы). Предположительно — общий компонент с автосохранением.
   - В правый нижний угол (или в footer textarea) добавь бейдж: `<span style="color: {getTokenBadgeColor(count)}">{formatTokenCount(count)} токенов</span>`.
   - Пересчёт — по debounce 500ms после остановки ввода (не на каждый keystroke).
   - Если файл пустой или не загружен — бейдж не показывается.

4. **Добавь итоговую сводку в карточке агента** (`frontend/src/app/blog/team/staff/[id]/page.tsx`):
   - В шапке карточки (рядом с именем/должностью или под ними) — компонент `<TokenSummary agentId={id} />`.
   - Компонент загружает данные через новый API-эндпоинт `GET /api/team/agents/:id/token-summary` и показывает:
     ```
     Промпт: 8.2K токенов [зелёный кружок]
     Mission: 1.2K | Role: 2.8K | Goals: 1.5K | Memory: 1.1K | Skills: 1.6K
     ```
   - Итоговая цифра — цветная (по шкале из п.2). Подциферблатник — серый, мелким шрифтом.
   - Tooltip на итоговой цифре: «Приблизительный объём системного промпта для этого агента. До 15K — зелёная зона. 40K+ — стоит пересмотреть Memory или вызвать Curator.»

5. **Создай API-эндпоинт** `GET /api/team/agents/:id/token-summary` в `backend/src/routes/team/agents.js` (или отдельный файл):
   - Загружает все слои промпта для агента через `promptBuilder` (Mission, Role с Awareness, Goals, Memory rules, Skills).
   - Считает длину каждого слоя в символах, делит на 4 (грубая серверная оценка, без пакета — `js-tiktoken` не ставим на бэкенд, достаточно `Math.ceil(text.length / 4)`).
   - Возвращает JSON:
     ```json
     {
       "total": 8200,
       "breakdown": {
         "mission": 1200,
         "role": 2800,
         "goals": 1500,
         "memory": 1100,
         "skills": 1600
       }
     }
     ```
   - За `requireAuth`.

6. **Не реализовывать в этой сессии:**
   - Self-review механику — Сессия 29.
   - Жёсткие лимиты на размер промпта — ❌ осознанно (только визуальный сигнал).

**Что делать после сессии:**

1. Локально: открыть `/blog/team/instructions/` → кликнуть на любой файл → в углу textarea видеть бейдж с количеством токенов и цветовой подсветкой.
2. Напечатать текст → бейдж обновляется по debounce.
3. Открыть карточку агента → в шапке видеть сводку «Промпт: X.XK токенов» с разбивкой по слоям.
4. Создать агента с длинной Role → убедиться, что цвет меняется с зелёного на жёлтый при росте.
5. Закоммитить, push, деплой.

**Критерии готовности:**

- В редакторе каждого инструктивного файла — бейдж с количеством токенов и цветовой подсветкой.
- В карточке агента — итоговая сводка с разбивкой по слоям.
- Цветовая шкала: <15K зелёный, 15–25K жёлтый, 25–40K оранжевый, 40K+ красный.
- `GET /api/team/agents/:id/token-summary` возвращает JSON с breakdown.
- Никаких регрессий.

---

### Сессия 29 — Self-review: сервис, сборка чек-листа, второй вызов (этап 4, пункт 11)

**Цель:** Реализовать механику самопроверки — автоматическую сборку чек-листа из пяти источников (правила Memory, Skills, поля шаблона, табу Mission, пункты Влада), второй вызов LLM на той же модели, сохранение результата в `team_tasks`, дефолты self-review на шаблонах задач.

**Что делать до сессии:**

- Убедиться, что Сессия 28 завершена. Следующая миграция — `0024_self_review.sql`.

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0024_self_review.sql`:
   ```sql
   -- Поля для self-review в team_tasks
   ALTER TABLE team_tasks
     ADD COLUMN IF NOT EXISTS self_review_enabled BOOLEAN DEFAULT FALSE,
     ADD COLUMN IF NOT EXISTS self_review_extra_checks TEXT,
     ADD COLUMN IF NOT EXISTS self_review_result JSONB;

   COMMENT ON COLUMN team_tasks.self_review_enabled IS 'Включена ли самопроверка для этой задачи';
   COMMENT ON COLUMN team_tasks.self_review_extra_checks IS 'Дополнительные пункты проверки от Влада (текст)';
   COMMENT ON COLUMN team_tasks.self_review_result IS 'Результат self-review: {checklist: [{source, item, result, comment}], passed, revised}';
   ```

2. **Обнови шаблоны задач в Storage** — добавь поле `self_review_default` в frontmatter каждого шаблона:
   - Прочитай все 5 файлов из `team-prompts/Шаблоны задач/`. В начало каждого (если нет frontmatter — добавь YAML-блок `---...---`) добавь:
     - `Написание текста.md` → `self_review_default: true`
     - `Правка фрагментов.md` → `self_review_default: true`
     - `Свободные идеи.md` → `self_review_default: false`
     - `Идеи и вопросы для исследования.md` → `self_review_default: false`
     - `Прямое исследование.md` → `self_review_default: false`
   - Создай одноразовый скрипт `backend/scripts/add-self-review-defaults.js` для этого. Идемпотентный (если frontmatter уже есть — не дублирует).

3. **Создай сервис** `backend/src/services/team/selfReviewService.js`:
   - **`buildChecklist(task, agent)`** — собирает чек-лист из пяти источников:
     1. **Правила Memory:** загружает через `getRulesForAgent(agent.id)`, для каждого правила формирует пункт `{ source: 'memory_rule', item: rule.content, check: 'Применено или непротиворечиво в ответе?' }`.
     2. **Skills:** загружает через `skillService.getSkillsForAgent(agent.id)`, для каждого активного формирует `{ source: 'skill', item: skill.skill_name, check: 'Применим к задаче? Если да, использован?' }`.
     3. **Поля шаблона / требования брифа:** парсит `task.brief` (или поля из шаблона задачи, если доступны). Для каждого непустого поля формирует `{ source: 'template_field', item: field_name, check: 'Пункт из ТЗ закрыт?' }`.
     4. **Табу из Mission:** загружает `Миссия.md` из Storage, парсит секцию `## Табу`, для каждой строки с `-` формирует `{ source: 'mission_taboo', item: taboo_text, check: 'Ответ не нарушает табу?' }`.
     5. **Дополнительные пункты Влада:** берёт `task.self_review_extra_checks`, если не пустое — разбивает по строкам, для каждой формирует `{ source: 'vlad_extra', item: line, check: 'Выполнено?' }`.
   - Возвращает массив объектов `{ source, item, check }`.

   - **`runSelfReview(task, agent, originalResult)`** — основная функция:
     - Вызывает `buildChecklist(task, agent)`.
     - Если чек-лист пуст — возвращает `{ skipped: true, reason: 'Чек-лист пуст' }`.
     - Формирует промпт второго вызова (SELF_REVIEW_PROMPT — константа в файле):
       ```
       Ты — тот же агент, что выполнил задачу выше.
       Сейчас проверяешь свой ответ по чек-листу.

       Для каждого пункта — ответ строго в формате JSON:
       {"item": "<текст пункта>", "result": "да" | "нет" | "неприменимо", "comment": "<одна строка>"}

       В конце добавь:
       {"passed": true/false, "revision_needed": true/false}

       Если все ответы "да" или "неприменимо" — passed = true, revision_needed = false.
       Если есть хотя бы один "нет" — passed = false, revision_needed = true.

       Если revision_needed = true — после JSON-блока чек-листа выведи ИСПРАВЛЕННУЮ версию ответа.
       Правь ТОЛЬКО то, что требует чек-лист. НЕ правь то, что и так "да".
       Не переписывай и не «улучшай» текст сверх чек-листа.

       Чек-лист:
       {{checklist_formatted}}

       Исходный ответ:
       {{original_result}}
       ```
     - Вызывает `llmClient` с **той же моделью**, что использовалась для задачи (`task.model` или модель агента из `team_agents`). Полный контекст слоёв промпта (Mission, Role, Goals, Memory, Skills) подкладывается — через `promptBuilder.buildPrompt()` с тем же `agentId`.
     - Парсит ответ: извлекает JSON-массив чек-листа и опциональный исправленный текст.
     - Записывает в `team_api_calls` через `costTracker` с `source: 'self_review'`.
     - Возвращает объект:
       ```js
       {
         checklist: [{ source, item, result, comment }],
         passed: true/false,
         revised: true/false,
         revised_result: '...' // только если revised = true
       }
       ```

   - **`shouldSkipSelfReview(task, originalResult)`** — проверяет условия пропуска:
     - Если `task.self_review_enabled !== true` → skip.
     - Если `originalResult` короче 100 символов → skip (слишком короткий ответ).
     - Если задача завершилась с ошибкой → skip.
     - Возвращает `{ skip: boolean, reason?: string }`.

4. **Интегрируй в `taskRunner.js`:**
   - После получения результата от LLM (первый вызов), перед записью финального результата в `team_tasks`:
     ```js
     const skipCheck = selfReviewService.shouldSkipSelfReview(task, result);
     if (!skipCheck.skip) {
       const reviewResult = await selfReviewService.runSelfReview(task, agent, result);
       // Записать reviewResult в task.self_review_result (JSONB)
       if (reviewResult.revised && reviewResult.revised_result) {
         result = reviewResult.revised_result; // Замена на исправленную версию
       }
     }
     ```
   - Обновить INSERT в `team_tasks`: добавить поля `self_review_enabled`, `self_review_extra_checks`, `self_review_result`.

5. **Обнови форму постановки задачи** (дашборд, Сессия 17):
   - Найди компонент формы постановки задачи.
   - Добавь чекбокс **«🔍 Самопроверка»** — рядом с существующими чекбоксами (если есть «Уточнения от агента» — рядом с ним).
   - Дефолт чекбокса: читается из шаблона задачи (поле `self_review_default` из frontmatter). Если шаблон не выбран — выключено.
   - Под чекбоксом (если включён) — раскрывающееся textarea **«Дополнительные пункты проверки»** с placeholder: «Свои критерии для этой задачи (по одному на строку)».
   - Поддержка голосового ввода в textarea — если существующая Whisper-инфраструктура позволяет (кнопка 🎤 рядом).
   - Оба значения передаются в POST запросе создания задачи: `self_review_enabled`, `self_review_extra_checks`.

6. **Обнови `costTracker.js`:**
   - Добавь `source: 'self_review'` в допустимые значения (если есть проверка).

7. **Обнови `promptBuilder.js`:**
   - Добавь метод `getTaskTemplateDefaults(templateName)` — читает frontmatter шаблона задачи и возвращает `{ self_review_default, ... }`. Если метод уже есть — убедись, что `self_review_default` парсится.

8. **Не реализовывать в этой сессии:**
   - UI отображения результата self-review в карточке задачи — Сессия 30.
   - Шестой источник чек-листа (методички инструментов) — 🔁 подготовлено архитектурно, агрегация при реализации пункта 16/17.
   - Сигнал в парсер обратной связи из результатов self-review — отложен.
   - Review другим агентом — ❌ осознанно.
   - Review дешёвой моделью — ❌ осознанно.

**Что делать после сессии:**

1. Накатить миграцию `0024` через Supabase Dashboard.
2. Запустить `npm run add-self-review-defaults` (или как назван скрипт) — убедиться, что шаблоны обновлены.
3. Локально: поставить задачу «Написание текста» → чекбокс «Самопроверка» включён по умолчанию. Добавить пару дополнительных пунктов.
4. Дождаться завершения → в Railway Logs увидеть лог второго вызова LLM с пометкой `self_review`.
5. В Supabase Dashboard: проверить `team_tasks` — поле `self_review_result` заполнено JSONB с чек-листом.
6. В `team_api_calls`: проверить запись с `source = 'self_review'`.
7. Поставить задачу «Свободные идеи» → чекбокс выключен по умолчанию. Включить вручную → self-review срабатывает.
8. Закоммитить, push, деплой. Накатить миграцию на проде.

**Критерии готовности:**

- Миграция `0024` добавляет три поля в `team_tasks`.
- Шаблоны задач содержат `self_review_default` в frontmatter.
- Чекбокс «Самопроверка» в форме постановки задачи с дефолтом из шаблона.
- Textarea «Дополнительные пункты проверки» (раскрывается при включённом чекбоксе).
- `selfReviewService.buildChecklist` собирает чек-лист из 5 источников.
- `selfReviewService.runSelfReview` делает второй вызов LLM на той же модели.
- При `passed = false` и `revised = true` — финальный результат задачи = исправленная версия.
- Результат записывается в `self_review_result` JSONB.
- Расходы на self-review — отдельная запись в `team_api_calls` с `source = 'self_review'`.
- Задачи без self-review работают как раньше (без регрессий).

---

### Сессия 30 — Self-review: UI результата в карточке задачи (этап 4, пункт 11)

**Цель:** Отобразить результат self-review в карточке задачи — раскрывающийся блок с чек-листом (да/нет/неприменимо), подсветка пунктов «нет», пометка «self-review не пройден полностью» если есть неисправленные пункты, отдельная строка расходов self-review в биллинге задачи.

**Что делать до сессии:**

- Убедиться, что Сессия 29 завершена и в `team_tasks` есть хотя бы одна запись с заполненным `self_review_result`.

**ТЗ для Claude Code:**

1. **Создай компонент** `frontend/src/components/team/SelfReviewResult.tsx`:
   - Props: `selfReviewResult: { checklist, passed, revised }` (из JSONB поля `self_review_result`).
   - Если `selfReviewResult` — null/undefined — не рендерить (задача без self-review).
   - Заголовок: **«🔍 Самопроверка»** с бейджем:
     - `passed = true` → зелёный бейдж «✅ Пройдена»
     - `passed = false, revised = true` → жёлтый бейдж «⚠️ Пройдена с правками»
     - `passed = false, revised = false` → красный бейдж «❌ Не пройдена полностью»
   - Раскрывающийся блок (collapsible, свёрнут по умолчанию) с чек-листом:
     - Каждый пункт — строка таблицы или список:
       - Иконка: ✅ (да), ❌ (нет), ➖ (неприменимо)
       - Источник (мелким серым): «Правило Memory» / «Навык» / «ТЗ» / «Табу Mission» / «Доп. проверка»
       - Текст пункта
       - Комментарий агента (если есть, курсивом)
     - Пункты «нет» подсвечены красным фоном (light red background).
   - Если `revised = true` — внизу пометка: «Результат был исправлен на основании пунктов "нет". Исходная версия сохранена в логе.»

2. **Интегрируй компонент в карточку задачи:**
   - Найди компонент карточки задачи (предположительно в дашборде / логе задач). Там, где показывается результат задачи.
   - После блока результата, перед блоком оценки — вставь `<SelfReviewResult selfReviewResult={task.self_review_result} />`.
   - На полноэкранной странице задачи (если реализована, `/blog/team/tasks/[id]`) — тот же компонент.

3. **Добавь расходы self-review в UI биллинга задачи:**
   - В карточке задачи (или в полноэкранном режиме) — найди, где отображается стоимость задачи.
   - Если задача имеет `self_review_enabled = true`:
     - Показать две строки: «Основной вызов: $X.XX» и «Самопроверка: $Y.YY» (данные из `team_api_calls`, фильтр по `task_id` и `source`).
     - Итого: сумма.
   - Если self-review не было — одна строка как раньше.
   - Для этого понадобится расширить эндпоинт получения задачи или создать новый: `GET /api/team/tasks/:id/cost-breakdown` — возвращает массив `[{ source: 'task', cost }, { source: 'self_review', cost }]`.

4. **Обнови API — эндпоинт cost-breakdown:**
   - `GET /api/team/tasks/:id/cost-breakdown` в `backend/src/routes/team/tasks.js`:
     - Запрашивает `team_api_calls` с `task_id = :id`, группирует по `source`.
     - Возвращает JSON:
       ```json
       {
         "items": [
           { "source": "task", "cost_usd": 0.023, "input_tokens": 5000, "output_tokens": 1200 },
           { "source": "self_review", "cost_usd": 0.019, "input_tokens": 6000, "output_tokens": 800 }
         ],
         "total_usd": 0.042
       }
       ```
   - За `requireAuth`.

5. **Обнови лог задач на дашборде:**
   - В списке задач (карточки в логе) — если задача прошла self-review, показывать маленький индикатор рядом со статусом:
     - ✅ (пройдена) — зелёный
     - ⚠️ (с правками) — жёлтый
     - ❌ (не пройдена) — красный
   - Если self-review не включён — индикатор отсутствует.

6. **Не реализовывать в этой сессии:**
   - Сигнал в парсер обратной связи из self-review — отложен.
   - Review другим агентом — ❌ осознанно.
   - Шестой источник чек-листа (методички инструментов) — заглушка в `buildChecklist` (комментарий `// TODO: источник 6 — методички инструментов, пункт 16`).

**Что делать после сессии:**

1. Локально: поставить задачу «Написание текста» с self-review → дождаться завершения.
2. Открыть карточку задачи → увидеть блок «Самопроверка» с бейджем и раскрывающимся чек-листом.
3. Раскрыть чек-лист → увидеть пункты с иконками ✅/❌/➖, источники, комментарии.
4. Если были пункты «нет» → проверить, что результат задачи содержит исправленную версию.
5. Проверить биллинг: две строки «Основной вызов» + «Самопроверка» с итогом.
6. В логе задач на дашборде: маленький индикатор self-review рядом со статусом.
7. Задача без self-review: блок отсутствует, биллинг одной строкой — без регрессий.
8. Закоммитить, push, деплой.

**Критерии готовности:**

- Компонент `SelfReviewResult` рендерит чек-лист с иконками, источниками, подсветкой «нет».
- Три варианта бейджа: пройдена / с правками / не пройдена.
- Раскрывающийся блок в карточке задачи (свёрнут по умолчанию).
- Расходы self-review — отдельная строка в биллинге задачи.
- `GET /api/team/tasks/:id/cost-breakdown` возвращает JSON с разбивкой по source.
- Индикатор self-review в логе задач на дашборде.
- Задачи без self-review работают без изменений.
- Никаких регрессий.

---

### Сессия 31 — Новые статусы задач, многошаговая инфраструктура, уточнения от агента (этап 5, пункт 17)

**Цель:** Добавить новые статусы задач (`clarifying`, `awaiting_input`, `awaiting_resource`), поле `step_state` JSONB для многошаговых задач, сервис уточнений (`clarificationService`) с чекбоксом в форме постановки, сервис продолжения (`taskContinuationService`) — базовая инфраструктура для всех механик п.17.

**Что делать до сессии:**

- Убедиться, что миграция `0024` накачена. Следующая — `0025_multistep_tasks.sql`.

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0025_multistep_tasks.sql`:
   ```sql
   -- Новые статусы для задач
   -- (team_tasks.status уже TEXT без CHECK — просто документируем новые значения)
   COMMENT ON COLUMN team_tasks.status IS 'Статусы: pending, running, done, error, archived, clarifying, awaiting_input, awaiting_resource';

   -- Поле для многошаговых задач
   ALTER TABLE team_tasks
     ADD COLUMN IF NOT EXISTS step_state JSONB,
     ADD COLUMN IF NOT EXISTS clarification_enabled BOOLEAN DEFAULT FALSE,
     ADD COLUMN IF NOT EXISTS clarification_questions JSONB,
     ADD COLUMN IF NOT EXISTS clarification_answers JSONB;

   COMMENT ON COLUMN team_tasks.step_state IS 'Состояние многошаговой задачи: {current_step, total_steps, steps: [...], accumulated_results: [...]}';
   COMMENT ON COLUMN team_tasks.clarification_enabled IS 'Включены ли уточнения от агента для этой задачи';
   COMMENT ON COLUMN team_tasks.clarification_questions IS 'Вопросы агента [{question, required}]';
   COMMENT ON COLUMN team_tasks.clarification_answers IS 'Ответы Влада [{question, answer}]';

   -- Поле для мульти-LLM сравнения (Сессия 34)
   ALTER TABLE team_tasks
     ADD COLUMN IF NOT EXISTS comparison_group_id TEXT;

   CREATE INDEX idx_team_tasks_comparison ON team_tasks(comparison_group_id) WHERE comparison_group_id IS NOT NULL;
   ```

2. **Создай сервис** `backend/src/services/team/clarificationService.js`:
   - **`generateClarifications(task, agent)`** — формирует уточняющие вопросы:
     - Загружает Role агента, Awareness, бриф задачи.
     - Делает вызов через `llmClient` (любой доступный провайдер, как в `feedbackParserService`) с промптом:
       ```
       Ты анализируешь бриф задачи перед выполнением.
       Агент: {{agent_name}} ({{agent_position}})
       Должностная: {{role_excerpt}}
       Бриф: {{task_brief}}

       Сформулируй до 3 вопросов, без которых ты не можешь
       качественно выполнить задачу. Если вопросов нет — верни пустой массив.
       Формат ответа — строго JSON:
       [{"question": "...", "required": true/false}]
       или []
       ```
     - Парсит JSON. Записывает в `team_api_calls` с `source: 'clarification'`.
     - Возвращает массив вопросов или пустой массив.
   - **`applyClarifications(taskId, answers)`** — записывает ответы в `clarification_answers`, обновляет статус задачи `awaiting_input` → `running`.

3. **Создай сервис** `backend/src/services/team/taskContinuationService.js`:
   - **`initMultistepTask(taskId, steps)`** — инициализирует `step_state`:
     ```js
     { current_step: 0, total_steps: steps.length, steps, accumulated_results: [], started_at: new Date() }
     ```
   - **`continueTask(taskId, stepResult)`** — добавляет `stepResult` в `accumulated_results`, инкрементирует `current_step`. Если `current_step >= total_steps` — задача готова к финальному синтезу, возвращает `{ completed: true }`. Иначе — возвращает следующий шаг.
   - **`getProgress(taskId)`** — возвращает `{ current_step, total_steps, current_question }` для UI.

4. **Обнови `taskRunner.js`:**
   - При создании задачи: если `clarification_enabled = true`:
     - Статус задачи → `clarifying` (не `pending`).
     - Вызвать `clarificationService.generateClarifications()`.
     - Если вопросы пусты — автоматически → `running`.
     - Если есть вопросы — записать в `clarification_questions`, статус → `awaiting_input`.
   - Recovery при рестарте: задачи в `clarifying`, `awaiting_input` — оставить как есть (ждут ответа Влада). Задачи в `awaiting_resource` — проверить `step_state` и продолжить с текущего шага.

5. **Создай API-эндпоинт** для ответов на уточнения:
   - `POST /api/team/tasks/:id/clarify` — body: `{ answers: [{question, answer}] }`. Вызывает `clarificationService.applyClarifications`, затем `taskRunner.runTaskInBackground`.
   - За `requireAuth`.

6. **Обнови UI формы постановки задачи** (дашборд):
   - Добавь чекбокс **«❓ Уточнения от агента»** рядом с «Самопроверка». По умолчанию выключен.
   - Значение передаётся в POST: `clarification_enabled`.

7. **Обнови UI карточки задачи:**
   - Для статуса `awaiting_input`: показывать блок «Вопросы агента» с полями для ответов (textarea на каждый вопрос + кнопка «Продолжить»).
   - Для статуса `awaiting_resource`: показывать индикатор прогресса «Шаг N из M» с текущим вопросом (из `step_state`).
   - Для статуса `clarifying`: показывать спиннер «Агент формулирует вопросы...»

**Что делать после сессии:**

1. Накатить миграцию `0025`.
2. Поставить задачу с чекбоксом «Уточнения» → увидеть статус `clarifying`, затем `awaiting_input` (если вопросы есть).
3. Ответить на вопросы → задача переходит в `running` → завершается.
4. Поставить задачу без уточнений → работает как раньше.
5. Закоммитить, push, деплой.

**Критерии готовности:**

- Три новых статуса визуализируются в карточке задачи.
- Чекбокс «Уточнения» в форме постановки.
- При включённом чекбоксе — генерация до 3 вопросов → блок ответов → продолжение.
- `step_state` JSONB записывается и читается.
- `taskContinuationService` инициализирует и продвигает шаги.
- Recovery при рестарте для новых статусов.
- Никаких регрессий.

---

### Сессия 32 — Web Search: адаптер, seed, методичка (этап 5, пункт 17)

**Цель:** Подключить Web Search как инструмент команды с адаптером под несколько провайдеров (Anthropic нативный на старте, Tavily и Perplexity как опции), seed-запись в `team_tools`, методичка в Storage, интеграция в Awareness и в `llmClient`.

**Что делать до сессии:**

- Ничего. Anthropic ключ уже есть. Если Влад хочет Tavily/Perplexity — получить API-ключ и добавить в ENV на Railway.

**ТЗ для Claude Code:**

1. **Создай сервис** `backend/src/services/team/webSearchService.js`:
   - Адаптер с тремя провайдерами. Активный провайдер читается из `team_tools` (поле `connection_config.provider`).
   - **Провайдер `anthropic` (дефолт):** использует Anthropic Messages API с `tools: [{ type: "web_search_20250305", name: "web_search" }]`. Ключ — из существующего `team_api_keys`. Парсит ответ: извлекает текст + citations (URLs).
   - **Провайдер `tavily`:** `POST https://api.tavily.com/search` с `{ query, max_results: 5 }`. Ключ — из `connection_config.api_key` в `team_tools`. Парсит: `results[].content` + `results[].url`.
   - **Провайдер `perplexity`:** использует Perplexity Chat Completions API (`POST https://api.perplexity.ai/chat/completions`, модель `sonar`). Ключ — из `connection_config.api_key`. Парсит: `choices[0].message.content` + `citations[]`.
   - Общий интерфейс: `search(query: string): Promise<{ results: [{ content, url, title }], raw_response }>`.
   - Все ошибки — на русском, с указанием провайдера.

2. **Интегрируй Web Search в `llmClient.js`:**
   - Добавь метод `callWithWebSearch(messages, agentId)` или расширь существующий `call()`:
     - Проверяет, есть ли у агента доступ к инструменту Web Search (через `team_agent_tools`).
     - Если провайдер `anthropic` — передаёт `tools` параметр в API-вызов.
     - Если провайдер `tavily`/`perplexity` — делает предварительный поиск через `webSearchService.search()`, вставляет результаты в контекст промпта как блок «Результаты Web Search».

3. **Создай seed-скрипт** `backend/scripts/seed-web-search.js`:
   - Добавляет запись в `team_tools`:
     ```js
     { name: 'Web Search', description: 'Поиск в интернете с возвратом результатов и URL',
       tool_type: 'executor', manifest_path: 'Инструменты/Web Search.md',
       connection_config: { provider: 'anthropic' }, status: 'active' }
     ```
   - Загружает методичку `Web Search.md` в Storage: `team-prompts/Инструменты/Web Search.md` (содержимое — из исходника пункта 17, секция «Стартовое содержимое методички Web Search»).
   - Идемпотентный.
   - `npm run seed:web-search`.

4. **Обнови UI Админки** (страница `/blog/team/admin/`):
   - В существующем блоке «Инструменты» (Сессия 21): добавь карточку **Web Search** рядом с NotebookLM.
   - Поля карточки: статус (active/inactive toggle), провайдер (dropdown: Anthropic / Tavily / Perplexity), API-ключ (для Tavily/Perplexity — текстовое поле; для Anthropic — текст «Используется ключ Anthropic из настроек»).
   - Сохранение → обновление `connection_config` в `team_tools`.

5. **Обнови Awareness в `promptBuilder.js`:**
   - `buildAwareness()` уже читает инструменты из `team_agent_tools` (Сессия 20). Убедись, что Web Search попадает в третью секцию Awareness, если привязан к агенту. Методичка подтягивается автоматически.

6. **Добавь шестой источник чек-листа в `selfReviewService.buildChecklist`:**
   - Замени TODO-комментарий из Сессии 29:
     - Загружай методичку каждого инструмента, привязанного к задаче (через `team_agent_tools` + `team_tools.manifest_path`).
     - Парси секцию `## Самопроверка после использования` (если есть).
     - Для каждой строки с `-` формируй пункт `{ source: 'tool_manifest', item: line, check: 'Выполнено?' }`.
   - Если методичка не содержит секцию «Самопроверка» — ничего не добавляется.

**Что делать после сессии:**

1. Запустить `npm run seed:web-search` — проверить в Supabase Dashboard, что запись в `team_tools` создана.
2. В Админке: карточка Web Search видна, провайдер — Anthropic, статус active.
3. Привязать Web Search к тестовому агенту (чекбокс в карточке агента → секция «Доступы»).
4. Поставить задачу этому агенту → в промпте видеть Web Search в Awareness → если агент запросит поиск, результаты вернутся.
5. Если Влад хочет попробовать Tavily — вписать API-ключ в Админке, переключить провайдер → поставить задачу → сравнить.
6. Закоммитить, push, деплой.

**Критерии готовности:**

- Сервис `webSearchService.js` с адаптером на три провайдера.
- Seed-запись Web Search в `team_tools`.
- Методичка `Web Search.md` в Storage.
- Карточка Web Search в Админке с выбором провайдера.
- Web Search в Awareness агента, которому привязан.
- Шестой источник чек-листа self-review (методички инструментов) работает.
- Никаких регрессий.

---

### Сессия 33 — База конкурентов: UI, Apify, AI-саммари (этап 5, пункт 17)

**Цель:** Превратить placeholder-страницу «Конкуренты» в рабочую базу — кнопка «Добавить блогера» с вводом Instagram-ссылки, запуск Apify Actor для парсинга, AI-саммари роликов через LLM, создание таблицы в папке «Конкуренты», UI просмотра с записями.

**Что делать до сессии:**

1. **Получить Apify API-ключ:** зарегистрироваться на `apify.com`, создать токен в Settings → Integrations.
2. **Добавить ENV на Railway:** `APIFY_TOKEN=<ключ>`.
3. Локально в `backend/.env`: тот же `APIFY_TOKEN`.

**ТЗ для Claude Code:**

1. **Создай сервис** `backend/src/services/team/apifyService.js`:
   - Использует `apify-client` (установить: `npm install apify-client`).
   - **`parseInstagramAccount(username, options)`** — запускает Apify Actor для парсинга Instagram (Actor ID: использовать `apify/instagram-scraper` или аналогичный, проверить актуальность при разработке). Параметры: `username`, `resultsLimit` (дефолт 30 — последние 30 постов/рилсов).
   - Возвращает массив `[{ shortCode, caption, likesCount, commentsCount, videoUrl?, timestamp, type }]`.
   - Обработка ошибок: таймаут (5 минут), невалидный username, лимит API.
   - **`estimateCost(username, resultsLimit)`** — грубая оценка стоимости запуска (на основе pricing Apify). Возвращает `{ estimated_usd, compute_units }`.

2. **Создай сервис** `backend/src/services/team/competitorService.js`:
   - **`addCompetitor(instagramUrl)`** — основной flow:
     1. Извлечь username из URL.
     2. Вызвать `apifyService.estimateCost()` — вернуть оценку (для UI подтверждения).
   - **`processCompetitor(username, resultsLimit)`** — после подтверждения:
     1. Вызвать `apifyService.parseInstagramAccount()`.
     2. Для каждого ролика: если есть `videoUrl` — транскрибировать через существующий Whisper-сервис Потока (если доступен) или пропустить с пометкой.
     3. Для каждого ролика: вызвать LLM (через `llmClient`, дешёвая модель) с промптом AI-саммари:
        ```
        Проанализируй Instagram-ролик блогера.
        Caption: {{caption}}
        Транскрипция: {{transcription}}
        Ответь строго JSON:
        { "type": "рубрика/формат", "topic": "тема", "hook": "какой хук использован", "summary": "краткое содержание в 2 предложениях" }
        ```
     4. Создать запись в `team_custom_databases` (если ещё нет для этого блогера): `{ name: username, type: 'competitor', slug: username, schema_definition: {...} }`.
     5. Для каждого ролика — INSERT в таблицу конкурента (или в jsonb-поле — зависит от архитектуры `team_custom_databases`).
     6. Записать расходы: Apify отдельно (`source: 'apify'`), LLM-саммари (`source: 'competitor_analysis'`).
   - **`listCompetitors()`** — список блогеров-конкурентов из `team_custom_databases` с `type = 'competitor'`.

3. **Создай API-маршруты** `backend/src/routes/team/competitors.js`:
   - `POST /api/team/competitors/estimate` — body: `{ instagram_url }`. Возвращает `{ username, estimated_cost, estimated_posts }`.
   - `POST /api/team/competitors/add` — body: `{ instagram_url, results_limit? }`. Запускает `processCompetitor` асинхронно (через workerPool или setImmediate). Возвращает `{ status: 'processing', competitor_id }`.
   - `GET /api/team/competitors` — список блогеров.
   - `GET /api/team/competitors/:slug/posts` — записи конкретного блогера с пагинацией.
   - Все за `requireAuth`.

4. **Обнови страницу «Конкуренты»** (`frontend/src/app/blog/databases/competitors/page.tsx`):
   - Убрать placeholder (opacity, текст «появится в этапе 5»).
   - Заголовок «Конкуренты». Кнопка **«+ Добавить блогера»** в верхнем углу.
   - При клике — модальное окно: поле «Instagram-ссылка», кнопка «Оценить стоимость» → показ оценки → кнопка «Добавить» (с confirm).
   - После добавления — спиннер «Парсинг...» (асинхронный процесс).
   - Основная часть: список карточек блогеров (имя, количество постов, дата парсинга). Клик → таблица постов (caption, тип, тема, хук, саммари, лайки, комменты).

5. **Обнови Админку:**
   - В блоке «Инструменты Системы» (Сессия 21): заменить placeholder Apify на рабочую карточку. Поля: статус, API-ключ (`APIFY_TOKEN` — показывать «Настроен через ENV» или поле для ввода), примерный расход за месяц.

**Что делать после сессии:**

1. Добавить тестового блогера через UI → дождаться парсинга.
2. Открыть страницу «Конкуренты» → увидеть карточку блогера → кликнуть → таблица постов с AI-саммари.
3. В Supabase: проверить записи в `team_custom_databases` и данные постов.
4. В `team_api_calls`: записи с `source = 'apify'` и `source = 'competitor_analysis'`.
5. Закоммитить, push, деплой.

**Критерии готовности:**

- Кнопка «Добавить блогера» работает: ввод URL → оценка стоимости → подтверждение → парсинг.
- Посты блогера с AI-саммари (тип, тема, хук) отображаются в таблице.
- Apify-расходы отдельной строкой в биллинге.
- Карточка Apify в Админке рабочая.
- Никаких регрессий.

---

### Сессия 34 — Мерджинг артефактов и Мульти-LLM клонирование (этап 5, пункт 17)

**Цель:** Реализовать мерджинг артефактов (мультиселект + кнопка «Объединить» + LLM-слияние) и мульти-LLM через клонирование задачи (кнопка «Сравнить с другой моделью» + режим сравнения двух задач).

**Что делать до сессии:**

- Ничего. Все изменения — код.

**ТЗ для Claude Code:**

1. **Создай сервис** `backend/src/services/team/mergeService.js`:
   - **`mergeArtifacts(artifactIds, instruction, targetTaskId?)`** — загружает содержимое артефактов по ID, формирует промпт для LLM:
     ```
     Объедини следующие артефакты в один документ по инструкции.

     Инструкция: {{instruction}}

     Артефакт 1 ("{{title1}}"):
     {{content1}}

     Артефакт 2 ("{{title2}}"):
     {{content2}}

     [...]

     Выдай объединённый документ. Следуй инструкции точно.
     ```
   - Вызывает `llmClient` (любой доступный провайдер). Записывает расходы с `source: 'merge'`.
   - Создаёт новый артефакт с `source_artifact_ids: artifactIds` (для трассируемости).
   - Возвращает `{ artifact_id, content }`.

2. **Создай API-эндпоинты:**
   - `POST /api/team/artifacts/merge` — body: `{ artifact_ids: string[], instruction: string, target_task_id?: string }`. Вызывает `mergeService.mergeArtifacts`.
   - `POST /api/team/tasks/:id/clone` — клонирует задачу: копирует бриф, контекст, прикреплённые базы, шаблон, `self_review_enabled`, `clarification_enabled`. Новая задача получает тот же `comparison_group_id` (генерируется если нет). Возвращает `{ cloned_task_id, comparison_group_id }`.
   - `GET /api/team/tasks/compare/:groupId` — возвращает все задачи с данным `comparison_group_id`.

3. **Обнови UI артефактов:**
   - В списке артефактов (на дашборде, в карточке задачи, в разделе Артефакты) добавь режим мультиселекта: чекбоксы на каждом артефакте + кнопка **«📋 Объединить»** (появляется при выборе 2+).
   - При клике — модальное окно: список выбранных артефактов, textarea «Инструкция для объединения» (placeholder: «Убери дубли, оставь только выводы» или «Объедини в один документ по порядку»), кнопка «Объединить».
   - Результат — новый артефакт в списке с пометкой «Объединение из N артефактов».

4. **Обнови UI карточки задачи:**
   - На завершённой задаче (`status = 'done'`) — кнопка **«🔄 Сравнить с другой моделью»**.
   - При клике — модальное окно: dropdown выбора модели/провайдера (из `team_api_keys`), кнопка «Запустить». Создаёт клон через `POST /api/team/tasks/:id/clone`, открывает новую задачу.
   - Если задача имеет `comparison_group_id` — показывать бейдж «Сравнение» и ссылку «Смотреть сравнение».

5. **Создай страницу сравнения** `frontend/src/app/blog/team/tasks/compare/[groupId]/page.tsx`:
   - Загружает задачи через `GET /api/team/tasks/compare/:groupId`.
   - Отображает в две колонки: слева — оригинал, справа — клон. Заголовки колонок: модель + провайдер.
   - Для каждой задачи: бриф (одинаковый, свёрнут), результат (развёрнут), оценка (если есть), стоимость.

6. **Добавь поле `source_artifact_ids`** — в артефакте (если артефакт хранится в Storage — добавь метаданные; если в БД — добавь колонку в соответствующую таблицу).

**Что делать после сессии:**

1. Выбрать 2-3 артефакта → «Объединить» → задать инструкцию → получить объединённый артефакт.
2. На завершённой задаче → «Сравнить с другой моделью» → выбрать модель → клон запускается → перейти на страницу сравнения → две колонки.
3. Закоммитить, push, деплой.

**Критерии готовности:**

- Мультиселект артефактов + кнопка «Объединить» + модальное окно с инструкцией.
- Объединённый артефакт создаётся с `source_artifact_ids`.
- Кнопка «Сравнить с другой моделью» на завершённых задачах.
- Клонирование задачи с другой моделью, общий `comparison_group_id`.
- Страница сравнения с двумя колонками.
- Никаких регрессий.

---

### Сессия 35 — Шаблоны задач разведчика, триггеры, Role-черновик (этап 5, пункт 17)

**Цель:** Создать три шаблона задач для аналитика-разведчика, подготовить черновик Role.md, настроить триггеры размышления (новые записи в базах + окно 7 дней), привязать Web Search как инструмент.

**Что делать до сессии:**

- Убедиться, что Web Search подключён (Сессия 32) и база конкурентов работает (Сессия 33).

**ТЗ для Claude Code:**

1. **Создай шаблоны задач** в Storage `team-prompts/Шаблоны задач/`:
   - **`Анализ конкурента.md`:**
     ```markdown
     ---
     self_review_default: true
     clarification_default: false
     ---
     ## System
     {{mission}}
     {{role}}
     {{goals}}
     {{memory}}
     {{skills}}

     Ты анализируешь контент блогера-конкурента.
     Используй Web Search для дополнительного контекста, если нужно.

     ## User
     Проанализируй блогера: {{competitor_name}}

     Данные из базы конкурентов:
     {{competitor_data}}

     Подготовь структурированный обзор:
     1. Ключевые форматы и рубрики
     2. Характерные приёмы (хуки, структура, монтаж)
     3. Темы, которые заходят лучше всего (по лайкам/комментам)
     4. Что можно адаптировать для нашего блога
     5. Чего точно НЕ делаем (табу)
     ```
   - **`Поиск трендов.md`:**
     ```markdown
     ---
     self_review_default: false
     clarification_default: false
     ---
     ## System
     {{mission}}
     {{role}}
     {{goals}}
     {{memory}}
     {{skills}}

     Ты ищешь свежие тренды в нишах, близких к нашему блогу.
     Используй Web Search как основной инструмент.

     ## User
     Тематический фокус: {{focus}}
     {{#if additional_context}}Дополнительный контекст: {{additional_context}}{{/if}}

     Найди 5-10 актуальных трендов, форматов или тем.
     На каждый:
     - Что это
     - Источник (URL)
     - Почему интересно для нашего блога
     - Оценка применимости (высокая / средняя / низкая)
     ```
   - **`Свободный ресёрч.md`:**
     ```markdown
     ---
     self_review_default: false
     clarification_default: true
     ---
     ## System
     {{mission}}
     {{role}}
     {{goals}}
     {{memory}}
     {{skills}}

     Ты выполняешь свободное исследование по заданной теме.

     ## User
     {{brief}}
     ```

2. **Обнови `taskRunner.js` — mapping `TEMPLATE_NAMES`:**
   - Добавь три новых шаблона в mapping:
     ```js
     'analyze_competitor': 'Анализ конкурента',
     'search_trends': 'Поиск трендов',
     'free_research': 'Свободный ресёрч'
     ```

3. **Создай черновик Role** для разведчика — файл `backend/scripts/templates/role-scout.md`:
   - Не загружай в Storage автоматически — это черновик для Влада. Влад создаст агента через мастер (пункт 12) и использует этот файл как отправную точку.
   - Содержимое (по описанию из исходника п.17):
     ```markdown
     # Аналитик-разведчик

     ## Зона ответственности
     Мониторинг конкурентов, отслеживание трендов, разведка интересных
     приёмов и форматов в смежных нишах Instagram-блогинга
     об истории и культуре.

     ## Методология
     1. Регулярный мониторинг базы конкурентов — новые блогеры, новые ролики.
     2. Поиск трендов через Web Search — свежие форматы, темы, приёмы.
     3. Сопоставление находок с нашими рубриками и стилем.
     4. Структурированные отчёты: находка / источник / зачем / рекомендация.

     ## Принципы
     - Не копировать, а адаптировать. Наш стиль — Парфёнов, не TikTok.
     - Всегда указывать источник.
     - При противоречивых данных — отмечать оба варианта.
     - Фокус на формате и приёмах, не на личности блогера.
     ```

4. **Расширь триггеры** в `triggerService.js` (Сессия 24):
   - Добавь два новых типа триггеров:
     - `new_competitor_entry` — срабатывает при INSERT в таблицу конкурента (или в `team_custom_databases` с `type = 'competitor'`). Проверяет cooldown 7 дней на `trigger_type = 'new_competitor_entry'`.
     - `new_reference_entry` — срабатывает при INSERT в таблицу `videos` (база референсов Потока). Аналогичный cooldown.
   - Для каждого: если cooldown не истёк — запись в дневник. Если истёк — двухтактный процесс (Сессия 22) → предложение в `team_proposals`.
   - Интеграция: после `competitorService.processCompetitor` — вызов `triggerService.fire('new_competitor_entry', { competitor: username })`.

5. **Добавь npm-скрипт** `"seed:scout-templates": "node scripts/seed-scout-templates.js"` — загружает три шаблона в Storage (идемпотентный).

**Что делать после сессии:**

1. Запустить `npm run seed:scout-templates`.
2. Создать агента «Разведчик» через мастер (пункт 12): имя, должность, Role из черновика, привязать Web Search, привязать три шаблона, уровень автономности 1.
3. Поставить задачу «Анализ конкурента» → убедиться, что шаблон работает, Web Search в Awareness.
4. Добавить нового блогера в базу конкурентов → проверить, что триггер `new_competitor_entry` сработал → предложение в Inbox.
5. Закоммитить, push, деплой.

**Критерии готовности:**

- Три шаблона задач в Storage, mapping в `taskRunner.js`.
- Черновик Role для разведчика в `scripts/templates/`.
- Триггеры `new_competitor_entry` и `new_reference_entry` работают.
- При добавлении блогера → триггер → предложение в Inbox (если cooldown позволяет).
- Никаких регрессий.

---

### Сессия 36 — Bugfix загрузки файлов и финальная интеграция (этап 5, пункт 17)

**Цель:** Починить загрузку файлов с компьютера (техдолг этапа 1, блокирующий), добавить расходы Apify отдельной строкой в биллинг, проверить полную интеграцию всех механик пункта 17.

**Что делать до сессии:**

- Ничего.

**ТЗ для Claude Code:**

1. **Починить загрузку файлов** в `backend/src/routes/team/files.js`:
   - Проверить текущую реализацию: что именно не работает (парсинг multipart, сохранение в Storage, ответ клиенту).
   - Исправить: `POST /api/team/files/upload` должен принимать файл через `multipart/form-data`, сохранять в `team-database/uploads/<filename>`, возвращать `{ path, size, mime_type }`.
   - Проверить фронтенд: компонент загрузки в форме постановки задачи (если есть — починить, если нет — создать). Кнопка «📎 Прикрепить файл» в форме → file input → upload → отображение имени файла.
   - Поддержка: PDF, DOCX, TXT, MD, PNG, JPG (валидация MIME). Лимит: 10MB.

2. **Добавь биллинг Apify** в UI Админки:
   - В секции расходов (существующая таблица/список расходов) — отдельная строка «Apify» с суммой за период. Источник: `team_api_calls` с `source = 'apify'`.
   - В карточке инструмента Apify (Админка → Инструменты Системы) — примерные расходы за текущий месяц.

3. **Создай интеграционный скрипт** `backend/scripts/test-p17-integration.js`:
   - Проверяет:
     - Web Search доступен (seed-запись, методичка, интеграция с `llmClient`).
     - База конкурентов: API-эндпоинты отвечают.
     - Уточнения: создание задачи с `clarification_enabled = true`.
     - Многошаговость: `taskContinuationService.initMultistepTask` + `continueTask`.
     - Мерджинг: `mergeService.mergeArtifacts` (с мок-артефактами).
     - Клонирование: `POST /api/team/tasks/:id/clone`.
   - Лог на русском, summary в конце.
   - `npm run test:p17`.

4. **Обнови `costTracker.js`:**
   - Убедись, что все новые source-значения (`clarification`, `merge`, `apify`, `competitor_analysis`) корректно записываются и агрегируются в отчётах расходов.

**Что делать после сессии:**

1. Загрузить PDF через форму постановки задачи → файл появляется в Storage.
2. Запустить `npm run test:p17` — все проверки пройдены.
3. В Админке: расходы Apify отдельной строкой.
4. Полный сценарий: создать разведчика → поставить задачу «Поиск трендов» → уточнения (если включены) → результат с Web Search → оценить → skill extraction → проверить Inbox.
5. Закоммитить, push, деплой.

**Критерии готовности:**

- Загрузка файлов работает: PDF/DOCX/TXT через форму → файл в Storage.
- Биллинг Apify отдельной строкой в Админке.
- Интеграционный скрипт `npm run test:p17` проходит.
- Полный сценарий разведчика работает end-to-end.
- Никаких регрессий во всех предыдущих сессиях.

---

### Сессия 37 — Шаблоны задач предпродакшна и черновики Role (этап 5, пункт 18)

**Цель:** Создать шаблоны задач для четырёх агентов предпродакшна (шеф-редактор, исследователь, сценарист, фактчекер), подготовить черновики Role.md, настроить многошаговый шаблон исследователя с полем «Notebook URL/ID».

**Что делать до сессии:**

- Убедиться, что Сессии 31–36 завершены (вся инфраструктура п.17 работает: уточнения, многошаговость, Web Search, мерджинг, загрузка файлов).

**ТЗ для Claude Code:**

1. **Создай шаблоны задач для исследователя** в Storage `team-prompts/Шаблоны задач/`:
   - **`Глубокий ресёрч через NotebookLM.md`:**
     ```markdown
     ---
     self_review_default: true
     clarification_default: true
     multistep: true
     ---
     ## System
     {{mission}}
     {{role}}
     {{goals}}
     {{memory}}
     {{skills}}

     Ты проводишь глубокое исследование по источникам, загруженным
     в NotebookLM. Работай последовательно по списку вопросов.
     На каждый вопрос — ответ с цитатами из источников.

     ## User
     Notebook ID: {{notebook_id}}
     Темы/вопросы для исследования:
     {{questions_list}}

     Дополнительный контекст: {{additional_context}}
     ```
   - **`Ресёрч через Web Search.md`:**
     ```markdown
     ---
     self_review_default: true
     clarification_default: false
     ---
     ## System
     {{mission}}
     {{role}}
     {{goals}}
     {{memory}}
     {{skills}}

     Ты ищешь и анализируешь источники по заданной теме через Web Search.
     На каждое утверждение — URL источника.

     ## User
     Тема: {{topic}}
     Аспекты для поиска: {{aspects}}
     {{#if files}}Прикреплённые материалы: {{files}}{{/if}}
     ```
   - **`Свободный ресёрч с файлами.md`:**
     ```markdown
     ---
     self_review_default: false
     clarification_default: true
     ---
     ## System
     {{mission}}
     {{role}}
     {{goals}}
     {{memory}}
     {{skills}}

     Ты анализируешь предоставленные материалы по заданию.

     ## User
     {{brief}}
     Прикреплённые файлы: {{files}}
     ```
   - **`Поиск пересечений в базах.md`:**
     ```markdown
     ---
     self_review_default: false
     clarification_default: false
     ---
     ## System
     {{mission}}
     {{role}}
     {{goals}}
     {{memory}}
     {{skills}}

     Ты ищешь пересечения заданной темы с содержимым баз команды.

     ## User
     Тема: {{topic}}
     Базы для поиска: {{databases}}
     ```

2. **Создай шаблоны задач для сценариста:**
   - **`План видео по ресёрчу.md`:**
     ```markdown
     ---
     self_review_default: true
     clarification_default: true
     ---
     ## System
     {{mission}}
     {{role}}
     {{goals}}
     {{memory}}
     {{skills}}

     Ты создаёшь план видео на основе артефактов исследования.
     Структура: хук → основные точки → концовка.

     ## User
     Артефакт исследования:
     {{research_artifact}}

     {{#if additional_context}}Дополнительные указания: {{additional_context}}{{/if}}
     ```
   - **`Креативные решения подачи.md`:**
     ```markdown
     ---
     self_review_default: false
     clarification_default: false
     ---
     ## System
     {{mission}}
     {{role}}
     {{goals}}
     {{memory}}
     {{skills}}

     Ты придумываешь варианты подачи темы. Минимум 3 альтернативы.
     Каждая — через конкретный приём (парадокс, персонаж, вопрос, сравнение).

     ## User
     Тема/план: {{topic_or_plan}}
     ```
   - **`Драфт сценарного текста.md`:**
     ```markdown
     ---
     self_review_default: true
     clarification_default: true
     ---
     ## System
     {{mission}}
     {{role}}
     {{goals}}
     {{memory}}
     {{skills}}

     Ты пишешь рабочий драфт текста под видео.
     Это НЕ финальный авторский текст — это полуфабрикат
     для последующей переработки автором.

     ## User
     План видео: {{plan_artifact}}
     Исследование: {{research_artifact}}
     {{#if additional_context}}Дополнительные указания: {{additional_context}}{{/if}}
     ```

3. **Создай шаблоны задач для фактчекера:**
   - **`Проверка артефакта по фактам.md`:**
     ```markdown
     ---
     self_review_default: true
     clarification_default: false
     ---
     ## System
     {{mission}}
     {{role}}
     {{goals}}
     {{memory}}
     {{skills}}

     Ты проверяешь фактические утверждения в артефакте.
     Используй Web Search для верификации каждого утверждения.
     Формат отчёта: утверждение | источник (URL) | статус.

     ## User
     Артефакт для проверки:
     {{artifact_content}}
     ```
   - **`Сверка двух версий.md`** и **`Холодный фактчек.md`** — аналогичная структура (шаблоны по описанию из исходника п.18).

4. **Создай шаблоны задач для шеф-редактора:**
   - **`Генерация идей.md`**, **`Ревью артефакта.md`**, **`Декомпозиция плана дня.md`** — по описанию из исходника.

5. **Обнови mapping `TEMPLATE_NAMES` в `taskRunner.js`:**
   - Добавь все новые шаблоны (11-13 штук). Формат: `'template_key': 'Человекочитаемое имя'`.

6. **Создай черновики Role** в `backend/scripts/templates/`:
   - `role-researcher.md` — исследователь (зона: ресёрч источников, работа с NotebookLM и Web Search, структурированные артефакты с цитатами).
   - `role-scriptwriter.md` — сценарист (зона: планы и драфты видео, креативная подача, полуфабрикат для авторского слоя).
   - `role-factchecker.md` — фактчекер (зона: верификация утверждений через Web Search, построчные отчёты со статусами).
   - `role-chief-editor.md` — шеф-редактор (зона: генерация идей, ревью артефактов, оркестрация; самая дорогая модель).
   - Все черновики — справочные файлы для Влада, не загружаются в Storage автоматически.

7. **Создай seed-скрипт** `backend/scripts/seed-preproduction-templates.js`:
   - Загружает все шаблоны в Storage (идемпотентный).
   - `npm run seed:preproduction-templates`.

**Что делать после сессии:**

1. Запустить `npm run seed:preproduction-templates`.
2. Создать 4 агентов через мастер (пункт 12): исследователь, сценарист, фактчекер, шеф-редактор. Для каждого: имя, Role из черновика, привязать инструменты и шаблоны, уровень автономности 0.
3. Привязать: исследователю — NotebookLM + Web Search, 4 шаблона; сценаристу — Web Search, 3 шаблона; фактчекеру — Web Search, 3 шаблона; шеф-редактору — Web Search, 3 шаблона. Модель шефа — Opus.
4. Поставить тестовую задачу каждому агенту → убедиться, что шаблоны загружаются и задачи выполняются.
5. Закоммитить, push, деплой.

**Критерии готовности:**

- 11-13 шаблонов задач загружены в Storage.
- Mapping в `taskRunner.js` обновлён.
- 4 черновика Role в `scripts/templates/`.
- Все шаблоны работают при постановке задач через дашборд.
- Никаких регрессий.

---

### Сессия 38 — Многошаговый ресёрч NotebookLM и end-to-end пайплайн (этап 5, пункт 18)

**Цель:** Реализовать многошаговую работу исследователя с готовым блокнотом NotebookLM (поле «Notebook ID» → `step_state` → цикл вопросов → финальный синтез), проверить полный пайплайн предпродакшна end-to-end (исследователь → handoff → сценарист → handoff → фактчекер → handoff → шеф → мерджинг).

**Что делать до сессии:**

- Убедиться, что 4 агента созданы (Сессия 37). Для тестирования NotebookLM — создать блокнот в Google NotebookLM с тестовыми источниками и записать его ID/URL.

**ТЗ для Claude Code:**

1. **Реализуй многошаговый flow для шаблона «Глубокий ресёрч через NotebookLM»:**
   - В `taskRunner.js`: при запуске задачи с шаблоном `deep_research_notebooklm` (или аналогичным ключом):
     - Парсит `questions_list` из брифа (разбивает по строкам).
     - Инициализирует `step_state` через `taskContinuationService.initMultistepTask`:
       ```js
       {
         current_step: 0,
         total_steps: questions.length,
         steps: questions.map(q => ({ question: q, status: 'pending' })),
         accumulated_results: [],
         notebook_id: task.notebook_id,
         synthesis_pending: true
       }
       ```
     - Переводит задачу в `awaiting_resource`.
   - Создай (или расширь) **`notebookLMWorker.js`** в `backend/src/services/team/`:
     - Поллит задачи в `awaiting_resource` с `step_state.notebook_id != null`.
     - Для текущего шага: формирует запрос к NotebookLM API (или через воркер — конкретная интеграция зависит от того, как NotebookLM подключён в Сессии 20; если нет прямого API — пока через `llmClient` с контекстом «вопрос к блокноту»).
     - Результат шага → `taskContinuationService.continueTask(taskId, result)`.
     - Если `completed = true` — запуск финального синтеза на основной модели агента:
       ```
       Ты провёл исследование по {{total_steps}} вопросам.
       Собери итоговый артефакт: структурированные ответы с цитатами.

       Вопросы и ответы:
       {{accumulated_results}}

       Выдай единый документ.
       ```
     - Результат синтеза → финальный артефакт задачи, статус → `done`.
   - Задержка между шагами: 2 секунды (rate limiting).

2. **Обнови UI формы постановки для шаблона «Глубокий ресёрч»:**
   - При выборе этого шаблона — показывать поле **«Notebook ID/URL»** (текстовое, обязательное) и поле **«Список вопросов»** (textarea, по одному на строку).
   - Оба поля передаются в POST как часть брифа задачи.

3. **Создай интеграционный скрипт** `backend/scripts/test-pipeline-e2e.js`:
   - Имитирует полный пайплайн (без реальных LLM-вызовов, с моками):
     1. Создаёт задачу исследователю → проверяет `step_state`.
     2. Имитирует завершение → проверяет артефакт.
     3. Создаёт handoff сценаристу → проверяет `parent_task_id`.
     4. Имитирует завершение → проверяет артефакт.
     5. Создаёт handoff фактчекеру → проверяет артефакт-отчёт.
     6. Создаёт handoff шеф-редактору → проверяет ревью.
     7. Мерджит 4 артефакта → проверяет объединённый.
   - Лог на русском, summary.
   - `npm run test:pipeline`.

4. **Обнови recovery-логику** при рестарте бэкенда:
   - Задачи в `awaiting_resource` с непустым `step_state` и `notebook_id` — подхватываются `notebookLMWorker` с текущего шага (не с начала).

5. **Не реализовывать:**
   - Создание блокнотов NotebookLM агентом — ❌ осознанно.
   - Автоматическую цепочку handoff'ов — ❌ осознанно (каждый кликом Влада).
   - Интеграцию с Claude.ai — ❌ осознанно (связь через копирование/выгрузку).
   - Уровень автономности 1 у агентов предпродакшна — ❌ осознанно.

**Что делать после сессии:**

1. Поставить задачу исследователю «Глубокий ресёрч через NotebookLM» с тестовым блокнотом и 5 вопросами → наблюдать прогресс «Шаг 1 из 5» → дождаться финального синтеза.
2. На завершённой задаче → handoff сценаристу (артефакт исследования как контекст) → задача выполняется.
3. Handoff фактчекеру → отчёт по фактам.
4. Handoff шеф-редактору → ревью.
5. Мерджинг 4 ключевых артефактов → один сводный файл → скопировать в Claude.ai.
6. Запустить `npm run test:pipeline` — все проверки проходят.
7. Закоммитить, push, деплой.

**Критерии готовности:**

- Многошаговый ресёрч NotebookLM: `step_state` инициализируется, шаги проходят последовательно, финальный синтез формирует артефакт.
- UI поля «Notebook ID» и «Список вопросов» при выборе шаблона.
- Полный пайплайн end-to-end: исследователь → сценарист → фактчекер → шеф → мерджинг работает через handoff.
- Recovery при рестарте для задач в `awaiting_resource`.
- `npm run test:pipeline` проходит.
- Никаких регрессий.

---

### Сессия 39 — Telegram: инфраструктура ботов, telegramService и настройки Админки (этап 6, пункт 20)

**Цель:** Создать таблицу Telegram-ботов, системного бота (ENV), сервис отправки/приёма сообщений, webhook-приём входящих, настройки Telegram в Админке (тихий час, время отчёта, chat_id), UI привязки бота в карточке агента.

**Что делать до сессии:**

1. Создать **системного Telegram-бота** через BotFather:
   - В Telegram открыть @BotFather → `/newbot` → имя: «Поток Система» (или подобное) → сохранить токен.
   - Добавить ENV-переменную `TELEGRAM_SYSTEM_BOT_TOKEN` на **Railway** и в `backend/.env`.
2. Создать **5 Telegram-ботов** (по одному на каждого агента — разведчик + 4 предпродакшна) через BotFather:
   - Для каждого: имя бота = имя агента (например, «Лёша-разведчик»), username = `potok_<agent_slug>_bot`.
   - Сохранить 5 токенов — они будут вноситься через UI Админки (не ENV).
3. Создать **общий рабочий чат** в Telegram:
   - Создать группу, добавить в неё все 6 ботов (системный + 5 агентских).
   - Получить `chat_id` группы (можно через @userinfobot или отправив сообщение и проверив webhook; либо через BotFather API `getUpdates`).
   - Добавить ENV-переменную `TELEGRAM_CHAT_ID` на **Railway** и в `backend/.env` (или внести через UI Админки — решается ниже).
4. Добавить ENV `TELEGRAM_WEBHOOK_SECRET` (произвольная строка для верификации webhook от Telegram) — на Railway и в `backend/.env`. Сгенерировать: `openssl rand -hex 32`.
5. Определить публичный URL бэкенда на Railway для webhook Telegram (формат: `https://<railway-service>.up.railway.app/api/team/telegram/webhook`).

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0026_team_telegram.sql`:
   ```sql
   -- Таблица связи агентов с Telegram-ботами
   CREATE TABLE IF NOT EXISTS team_telegram_bots (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     agent_id TEXT NOT NULL REFERENCES team_agents(id) ON DELETE CASCADE,
     bot_token TEXT NOT NULL,
     bot_username TEXT,
     status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
     created_at TIMESTAMPTZ DEFAULT now(),
     UNIQUE(agent_id)
   );

   COMMENT ON TABLE team_telegram_bots IS 'Связь агентов с Telegram-ботами. Один агент = один бот.';

   -- Настройки Telegram в team_settings (jsonb-записи)
   -- telegram_chat_id TEXT — id общего рабочего чата
   -- telegram_quiet_hours JSONB — { start_hour: 22, end_hour: 9, timezone: 'Europe/Moscow' }
   -- telegram_daily_report_time TEXT — '19:00'
   -- telegram_enabled BOOLEAN — глобальный тумблер Telegram

   -- Очередь отложенных сообщений (тихий час)
   CREATE TABLE IF NOT EXISTS team_telegram_queue (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     bot_token TEXT NOT NULL,
     chat_id TEXT NOT NULL,
     message_text TEXT NOT NULL,
     reply_markup JSONB,
     priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('normal', 'urgent')),
     source_type TEXT, -- 'daily_report', 'task_done', 'inbox_notification'
     source_id TEXT, -- id связанной сущности (task_id, notification_id)
     agent_id TEXT,
     created_at TIMESTAMPTZ DEFAULT now(),
     sent_at TIMESTAMPTZ,
     status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed'))
   );

   CREATE INDEX idx_telegram_queue_status ON team_telegram_queue(status) WHERE status = 'queued';

   COMMENT ON TABLE team_telegram_queue IS 'Очередь Telegram-сообщений. Накапливает во время тихого часа, отправляет утром.';
   ```

2. **Создай сервис** `backend/src/services/team/telegramService.js`:
   - **`sendMessage(botToken, chatId, text, options = {})`** — отправка через Telegram Bot API (`POST https://api.telegram.org/bot${botToken}/sendMessage`). Параметры: `parse_mode: 'HTML'`, `reply_markup` (опционально, для inline keyboard). Возвращает `{ ok, message_id }`. При ошибке — логирует на русском, не бросает (graceful degradation — Telegram не критическая система).
   - **`sendMessageFromAgent(agentId, text, options = {})`** — находит `bot_token` агента в `team_telegram_bots`, `chat_id` из `team_settings.telegram_chat_id`. Если бот не привязан или Telegram выключен глобально — тихо выходит.
   - **`sendMessageFromSystem(text, options = {})`** — отправка от системного бота (`process.env.TELEGRAM_SYSTEM_BOT_TOKEN`).
   - **`isQuietHours()`** — проверяет текущее время против `team_settings.telegram_quiet_hours`. Возвращает `boolean`.
   - **`enqueueMessage(botToken, chatId, text, options = {})`** — записывает в `team_telegram_queue` со статусом `queued`.
   - **`sendOrEnqueue(botToken, chatId, text, options = {})`** — если `isQuietHours()` и `priority !== 'urgent'` → `enqueueMessage()`, иначе → `sendMessage()`.
   - **`flushQueue()`** — берёт все `status = 'queued'` из `team_telegram_queue`, отправляет, помечает `sent_at` и `status = 'sent'`. При ошибке — `status = 'failed'`. Группирует по `source_type` в дайджест (например, все `task_done` за ночь — одним сообщением «За ночь завершены: ...»).
   - **`processIncomingVoice(update)`** — если `update.message.voice` или `update.message.audio`:
     - Скачивает файл через Telegram API (`getFile` → `download`).
     - Определяет `agent_id` по `bot_id` из `update.message.reply_to_message` (если reply на конкретного бота) или по `from.id` (системный бот).
     - Передаёт в существующий Whisper-сервис (тот, что используется в `voice.js` маршруте этапа 1).
     - Транскрипт → существующий `feedbackParserService.parseFeedback(agentId, transcript, 'telegram_voice')`.
   - **`processIncomingCallback(update)`** — обработка нажатий inline-кнопок (Accept/Reject для Inbox-событий). Парсит `callback_data`, вызывает соответствующий сервис (например, `notificationsService.markAsRead(id)` или `feedbackParserService.acceptRule(ruleId)`).
   - **`getAgentBots()`** — `SELECT * FROM team_telegram_bots WHERE status = 'active'`. Кеш в памяти с инвалидацией при изменениях.
   - **`registerWebhook(botToken, webhookUrl, secret)`** — `POST https://api.telegram.org/bot${botToken}/setWebhook` с `url` и `secret_token`.
   - **`registerAllWebhooks()`** — вызывает `registerWebhook` для системного бота и для каждого активного бота из `team_telegram_bots`. URL: `${BACKEND_URL}/api/team/telegram/webhook/${botToken_hash}` (hash токена, не сам токен, для безопасности).
   - Сообщения об ошибках — на русском.

3. **Создай маршрут** `backend/src/routes/team/telegram.js`:
   - `POST /api/team/telegram/webhook/:tokenHash` — приём webhook от Telegram:
     - Верифицирует `X-Telegram-Bot-Api-Secret-Token` === `process.env.TELEGRAM_WEBHOOK_SECRET`.
     - Определяет тип update: `message.voice` → `processIncomingVoice`, `callback_query` → `processIncomingCallback`, текстовое сообщение в reply к боту → игнорируем (текстовая обратная связь не парсится в MVP, только голос).
     - Ответ 200 OK (Telegram требует быстрый ответ).
   - `POST /api/team/telegram/register-webhooks` — ручная регистрация вебхуков (вызывается из Админки или при старте). Требует `requireAuth`.
   - `POST /api/team/telegram/test` — тестовая отправка сообщения от системного бота в чат. Требует `requireAuth`.
   - `GET /api/team/telegram/bots` — список привязанных ботов. Требует `requireAuth`.
   - `POST /api/team/telegram/bots` — привязка нового бота (`{ agent_id, bot_token }`). Автоматически определяет `bot_username` через `getMe()`. Требует `requireAuth`.
   - `DELETE /api/team/telegram/bots/:id` — удаление привязки. Требует `requireAuth`.
   - **Webhook-маршрут НЕ требует `requireAuth`** — он защищён секретом в заголовке.

4. **Расширь Админку** (`frontend/src/app/blog/team/admin/page.tsx`):
   - Новый блок **«Telegram»** (после существующих блоков):
     - **Глобальный тумблер** «Telegram включён» → `team_settings.telegram_enabled` (boolean, default false).
     - **Chat ID** — текстовое поле, значение из `team_settings.telegram_chat_id`. Рядом — подсказка «Как получить chat_id».
     - **Время ежедневного отчёта** — time picker (часы:минуты), значение из `team_settings.telegram_daily_report_time`. Дефолт: `19:00`.
     - **Тихий час** — два time picker (начало, конец) + выбор timezone. Значение из `team_settings.telegram_quiet_hours`. Дефолт: `{ start_hour: 22, end_hour: 9, timezone: 'Europe/Moscow' }`.
     - **Кнопка «Зарегистрировать вебхуки»** → `POST /api/team/telegram/register-webhooks`. Статус: «Зарегистрировано N ботов» или «Ошибка: ...».
     - **Кнопка «Тестовое сообщение»** → `POST /api/team/telegram/test`. Результат: toast «Сообщение отправлено» или «Ошибка: ...».

5. **Расширь карточку агента** (`/blog/team/staff/[id]`):
   - Новая вкладка (или блок внутри существующих «Доступов») — **«Telegram-бот»**:
     - Если бот привязан: показывает `@bot_username`, статус (active/inactive), кнопка «Отвязать».
     - Если не привязан: поле «Токен бота» + кнопка «Привязать». При привязке — автоматически определяет username через API, сохраняет в `team_telegram_bots`.

6. **Расширь startup бэкенда** (`backend/src/index.js` или аналог):
   - При старте: если `TELEGRAM_SYSTEM_BOT_TOKEN` задан и `team_settings.telegram_enabled === true` → вызвать `telegramService.registerAllWebhooks()`. Логировать результат.

7. **Добавь cron-задачу** для flush очереди:
   - В `backend/src/` (используя `node-cron`, уже установлен):
     - Каждые 5 минут: проверить, не закончился ли тихий час. Если закончился и в `team_telegram_queue` есть `queued` записи → вызвать `telegramService.flushQueue()`.
   - Логировать: «Telegram queue: отправлено N сообщений из очереди».

8. **Не реализовывать в этой сессии:**
   - Ежедневные отчёты — Сессия 40.
   - Push-уведомления о готовых задачах — Сессия 40.
   - Дублирование Inbox — Сессия 41.
   - Голосовые обратные связи (полная интеграция с парсером) — Сессия 41.
   - Inline-кнопки Accept/Reject — Сессия 41.

**Что делать после сессии:**

1. Накатить миграцию `0026_team_telegram.sql` через Supabase Dashboard.
2. В Админке: включить тумблер «Telegram», вставить `chat_id`, задать время отчёта 19:00, тихий час 22:00–09:00.
3. Привязать 5 ботов через карточки агентов (вкладка «Telegram-бот» → вставить токен → «Привязать»).
4. Нажать «Зарегистрировать вебхуки» в Админке.
5. Нажать «Тестовое сообщение» — в общем чате Telegram должно появиться сообщение от системного бота.
6. Записать голосовое в reply на сообщение в чате — в Railway Logs должно быть видно, что webhook получен (обработка голоса — Сессия 41).
7. Закоммитить, push, деплой.

**Критерии готовности:**

- Таблица `team_telegram_bots` создана, 5 ботов привязаны через UI карточки агента.
- Таблица `team_telegram_queue` создана.
- `telegramService.sendMessage` отправляет сообщение в чат от указанного бота.
- `telegramService.sendMessageFromSystem` отправляет от системного бота.
- `telegramService.isQuietHours()` корректно определяет тихий час.
- `telegramService.sendOrEnqueue` — во время тихого часа складывает в очередь, вне — отправляет сразу.
- Cron flush очереди работает (проверить через Railway Logs).
- Webhook зарегистрирован — при отправке сообщения в чат бэкенд получает update (видно в логах).
- Блок «Telegram» в Админке: тумблер, chat_id, время отчёта, тихий час, кнопки вебхуков и теста.
- Карточка агента: вкладка «Telegram-бот» — привязка/отвязка работает.
- Никаких регрессий.

---

### Сессия 40 — Ежедневные отчёты и push-уведомления о готовых задачах (этап 6, пункт 20)

**Цель:** Реализовать фоновую задачу формирования ежедневных отчётов агентов (через Системную LLM) и push-уведомления при завершении задачи — оба канала через `telegramService` с учётом тихого часа.

**Что делать до сессии:**

- Убедиться, что Сессия 39 завершена: `telegramService` работает, боты привязаны, webhook зарегистрирован.

**ТЗ для Claude Code:**

1. **Создай фоновый job** `backend/src/jobs/dailyReportsJob.js`:
   - Использует `node-cron`. Расписание: **каждую минуту** проверяет, совпадает ли текущее время (часы:минуты по timezone из `team_settings.telegram_quiet_hours.timezone`) с `team_settings.telegram_daily_report_time`.
   - При совпадении — запускает `generateAndSendReports()`:
     - Получает список всех агентов со статусом `active` и привязанным Telegram-ботом.
     - Для каждого агента:
       - Выбирает задачи за сегодня: `SELECT * FROM team_tasks WHERE agent_id = $1 AND created_at >= <начало сегодняшнего дня по timezone> AND status IN ('done', 'running')` (используя `DISTINCT ON (id)` для получения последнего состояния).
       - Если задач за день **нет** — пропускает агента (без «сегодня ничего не делал»).
       - Если задачи есть — формирует текст отчёта через `llmClient.js` (Системная LLM — дешёвая модель: `claude-3-5-haiku-20241022` или `gemini-2.0-flash`):
         ```
         Ты — Системная LLM. Сформируй ежедневный отчёт агента для Telegram-чата.
         
         Агент: {{agent_name}} ({{agent_role_summary}})
         
         Задачи за сегодня:
         {{tasks_list_with_statuses_and_brief_summaries}}
         
         Цели команды (кратко):
         {{goals_summary}}
         
         Формат отчёта (строго):
         📋 <b>Отчёт за день — {{agent_name}}</b>
         
         <b>Сделано:</b>
         - [краткое описание каждой задачи, 1-2 строки]
         
         <b>Как это приближает к целям:</b>
         [1-2 предложения, привязка к Goals]
         
         <b>Что полезно дальше:</b>
         [1-2 предложения]
         
         [ссылки на задачи: {{task_links}}]
         ```
       - `task_links` — формат `https://potok-app.vercel.app/blog/team/tasks/<task_id>`. Если маршрут `/blog/team/tasks/<id>` ещё не реализован (пункт 22) — подставлять URL, маршрут будет создан позже; ссылка будет корректной когда маршрут появится.
       - Результат → `telegramService.sendOrEnqueue(agentBotToken, chatId, reportText, { parse_mode: 'HTML' })`.
     - Расходы на LLM записывает в `costTracker` с `source = 'telegram_report'`.
   - Защита от повторной отправки: записывает метку `last_report_date` в `team_settings` (или in-memory); если дата совпадает — пропуск.

2. **Расширь `taskRunner.js`** — push-уведомление при завершении задачи:
   - В функции `markTaskDone(taskId)` (или аналогичной, где задача переходит в `done`):
     - После обновления статуса — проверить, есть ли у задачи `agent_id` и привязан ли Telegram-бот.
     - Если да — сформировать короткое сообщение:
       ```
       ✅ <b>Готово:</b> {{task_title}}
       {{one_line_summary}}
       <a href="https://potok-app.vercel.app/blog/team/tasks/{{task_id}}">Открыть задачу</a>
       ```
     - `one_line_summary` — формирует Системная LLM (одно предложение, дешёвая модель). Если вызов LLM для одной строки — излишество, можно обрезать первые 100 символов артефакта. Решение: если артефакт есть — обрезка, нет — «Задача завершена без артефакта».
     - Отправка: `telegramService.sendOrEnqueue(...)` от бота агента-исполнителя.
     - Расходы (если LLM) → `costTracker` с `source = 'telegram_push'`.

3. **Добавь регистрацию** `dailyReportsJob` в startup бэкенда:
   - Импортировать и запустить cron в `backend/src/index.js` (или в отдельном `jobs/index.js`, если уже есть паттерн для cron-задач).
   - Cron запускается только если `TELEGRAM_SYSTEM_BOT_TOKEN` задан.

4. **Обнови биллинг:**
   - В `costTracker.js` — новые значения `source`: `'telegram_report'`, `'telegram_push'`.
   - В Админке (если есть разбивка расходов по source) — добавить эти категории.

5. **Не реализовывать в этой сессии:**
   - Дублирование Inbox в Telegram — Сессия 41.
   - Голосовые из Telegram в парсер — Сессия 41.
   - Inline-кнопки — Сессия 41.
   - Маршрут `/blog/team/tasks/<id>` — пункт 22 (ссылки формируются уже сейчас, маршрут появится позже).

**Что делать после сессии:**

1. Дождаться времени ежедневного отчёта (или временно поставить через 2 минуты от текущего для теста).
2. Убедиться, что в Telegram-чате появились отчёты от тех агентов, у которых были задачи сегодня. Агенты без задач — молчат.
3. Поставить тестовую задачу → довести до `done` → в Telegram должен прийти push от соответствующего бота.
4. Изменить тихий час на текущее время → повторить push → сообщение должно попасть в очередь, не отправиться сразу.
5. Вернуть тихий час обратно → через 5 минут (cron flush) — сообщение из очереди должно отправиться.
6. В Админке: убедиться, что расходы `telegram_report` и `telegram_push` отображаются.
7. Закоммитить, push, деплой.

**Критерии готовности:**

- Ежедневный отчёт формируется по расписанию для агентов с задачами за день.
- Агенты без задач — молчат (не отправляют пустой отчёт).
- Отчёт содержит: что сделал, привязку к Goals, что полезно дальше, ссылки на задачи.
- Push-уведомление при `done` приходит от бота агента-исполнителя.
- Тихий час работает: сообщения копятся в очереди, отправляются утром дайджестом.
- Срочные (⚡) не откладываются — приходят сразу (push от задач не имеет пометки urgent; срочность — свойство предложений п.15, не задач; в этой сессии все push нормального приоритета).
- Расходы на Telegram-отчёты отдельной строкой в биллинге.
- Защита от дублирования отчёта (повторный запуск в ту же минуту не отправляет повторно).
- Никаких регрессий.

---

### Сессия 41 — Дублирование Inbox в Telegram и голосовая обратная связь (этап 6, пункт 20)

**Цель:** Реализовать дублирование Inbox-событий в Telegram (от соответствующих ботов, с inline-кнопками Accept/Reject), обработку голосовых ответов Влада (Whisper → парсер обратной связи), маршрутизацию reply к конкретному боту → `agent_id`.

**Что делать до сессии:**

- Убедиться, что Сессии 39–40 завершены. Webhook принимает входящие, `telegramService` отправляет от ботов.

**ТЗ для Claude Code:**

1. **Расширь `notificationsService.js`** — дублирование в Telegram:
   - В функции создания нотификации (там, где создаётся запись в `team_notifications`) — после записи в БД:
     - Проверить `team_settings.telegram_enabled`. Если выключен — пропуск.
     - Определить, от какого бота отправлять:
       - `task_awaiting_review` → бот агента-исполнителя.
       - `rule_candidate` → бот агента, чьё правило.
       - `skill_candidate` → бот агента. (Если навыки ещё не реализованы — пропуск.)
       - `handoff_suggestion` → бот агента-источника handoff.
       - `proposal` → бот агента, предложившего задачу.
       - `rule_revision` → системный бот.
     - Сформировать текст сообщения по типу:
       - `task_awaiting_review`:
         ```
         ⭐ <b>Оцените задачу</b>
         {{agent_name}}: «{{task_title}}»
         <a href="https://potok-app.vercel.app/blog/team/tasks/{{task_id}}">Открыть</a>
         ```
       - `rule_candidate`:
         ```
         📝 <b>Кандидат в правило</b>
         {{agent_name}} предлагает правило:
         «{{rule_text_short}}»
         ```
         С inline keyboard: кнопки `[✅ Принять]` `[❌ Отклонить]` (callback_data: `accept_rule:{{rule_id}}` / `reject_rule:{{rule_id}}`).
       - `handoff_suggestion`:
         ```
         🔄 <b>Предложение передачи</b>
         {{agent_name}} предлагает передать задачу «{{task_title}}» → {{target_agent_name}}
         <a href="https://potok-app.vercel.app/blog/team/tasks/{{task_id}}">Открыть</a>
         ```
       - `proposal`:
         ```
         🎯 <b>Предложение задачи от {{agent_name}}</b>
         {{what}}
         Польза: {{benefit}}
         <a href="https://potok-app.vercel.app/blog/team/dashboard">Открыть Inbox</a>
         ```
         Если `urgency === true` — добавить ⚡ в начало и `priority: 'urgent'` (игнорирует тихий час).
     - Отправлять через `telegramService.sendOrEnqueue(...)`. Для срочных (⚡) — `priority: 'urgent'`.

2. **Реализуй обработку inline-кнопок** в `telegramService.processIncomingCallback(update)`:
   - Парсить `callback_data`:
     - `accept_rule:<id>` → вызвать существующий `feedbackParserService.acceptRule(id)` (или аналог из Сессии 15). После — отправить ответ в чат: «✅ Правило принято».
     - `reject_rule:<id>` → вызвать `feedbackParserService.rejectRule(id)`. Ответ: «❌ Правило отклонено».
   - Ответить на callback: `answerCallbackQuery(callback_query_id, { text: 'Готово' })`.
   - Пометить нотификацию как прочитанную в `team_notifications` (`is_read = true`).

3. **Реализуй полную обработку голосовых** в `telegramService.processIncomingVoice(update)`:
   - Проверить, что сообщение — reply к конкретному боту-агенту (через `reply_to_message.from.id`):
     - Если reply к боту → определить `agent_id` из `team_telegram_bots` по `bot_id` (Telegram user ID бота, который можно получить через `getMe()` и закешировать в `team_telegram_bots` — добавь поле `telegram_bot_id BIGINT` в таблицу).
     - Если НЕ reply — игнорировать (нельзя определить, к какому агенту относится).
   - Скачать voice file: `GET https://api.telegram.org/bot${botToken}/getFile?file_id=${voice.file_id}` → `GET https://api.telegram.org/file/bot${botToken}/${file_path}`.
   - Передать в существующий Whisper-эндпоинт (`voice.js` route) или напрямую в Whisper API (тот же `openai` SDK с `audio.transcriptions.create`).
   - Транскрипт → `feedbackParserService.parseFeedback(agentId, transcript, 'telegram_voice')`.
   - Ответить в чат: «🎤 Получил обратную связь для {{agent_name}}. Обрабатываю.» (от системного бота).

4. **Создай мини-миграцию** `supabase/migrations/0027_telegram_bot_id.sql`:
   ```sql
   ALTER TABLE team_telegram_bots
     ADD COLUMN IF NOT EXISTS telegram_bot_id BIGINT;
   
   COMMENT ON COLUMN team_telegram_bots.telegram_bot_id IS 'Telegram user ID бота (для маршрутизации reply). Заполняется автоматически при привязке через getMe().';
   ```

5. **Обнови привязку бота** (маршрут `POST /api/team/telegram/bots` из Сессии 39):
   - При привязке — вызвать `getMe()` и сохранить `result.id` в `telegram_bot_id`.

6. **Не реализовывать в этой сессии:**
   - Accept/Reject для `skill_candidate` и `rule_revision` — навыки (пункт 10) и Curator (пункт 15) ещё не реализованы. Обработчики кнопок под эти типы — заглушка с логом «Тип не поддержан».
   - Парсинг текстовых (не голосовых) ответов в Telegram — осознанно не делаем.
   - Парсинг эмодзи-реакций — осознанно не делаем (решение пункта 20).

**Что делать после сессии:**

1. Накатить миграцию `0027`.
2. Повторно привязать ботов через UI карточки (или написать одноразовый скрипт `npm run telegram:update-bot-ids`) — чтобы `telegram_bot_id` заполнился.
3. Создать тестовую задачу → довести до `done` → в Telegram должна прийти нотификация `task_awaiting_review` от бота агента.
4. Запустить `feedbackParserService` (довести задачу до оценки → ≤2 баллов → кандидат в правила) → в Telegram должно прийти предложение с inline-кнопками Accept/Reject.
5. Нажать Accept в Telegram → правило принято, нотификация помечена прочитанной в `team_notifications`.
6. Записать голосовое в reply на сообщение конкретного бота → в Railway Logs: «Получена голосовая обратная связь для <agent_name>», транскрипция, передача в парсер.
7. Записать голосовое БЕЗ reply → в Railway Logs: «Голосовое без reply — игнорировано».
8. Закоммитить, push, деплой.

**Критерии готовности:**

- При создании нотификации в `team_notifications` — дубль отправляется в Telegram от соответствующего бота.
- Inline-кнопки Accept/Reject для кандидатов в правила работают: нажатие → действие + ответ в чат.
- Голосовой reply на бота → Whisper → парсер → кандидат в правила в Inbox. Полная цепочка.
- Голосовое без reply — игнорируется.
- Срочные предложения (⚡) приходят мгновенно даже в тихий час.
- Обычные нотификации в тихий час → очередь → дайджест утром.
- `telegram_bot_id` заполнен для всех привязанных ботов.
- Никаких регрессий.

---

### Сессия 42 — Интеграционное тестирование Telegram и финализация (этап 6, пункт 20)

**Цель:** Прогнать полный end-to-end цикл Telegram (отчёт → голосовое → парсер → правило → Accept в Telegram), проверить edge-cases (тихий час, агент без бота, paused-агент, множественные голосовые), написать интеграционный тест-скрипт.

**Что делать до сессии:**

- Убедиться, что Сессии 39–41 завершены. Все 5 ботов привязаны, webhook работает.

**ТЗ для Claude Code:**

1. **Создай интеграционный тест-скрипт** `backend/scripts/test-telegram.js`:
   - Считывает ENV и подключается к Supabase.
   - **Тест 1: Отправка от системного бота.**
     - Вызывает `telegramService.sendMessageFromSystem('Тестовое сообщение от системы')`.
     - Проверяет `ok === true`.
   - **Тест 2: Отправка от бота агента.**
     - Берёт первого активного агента с привязанным ботом.
     - Вызывает `telegramService.sendMessageFromAgent(agentId, 'Тестовое сообщение от агента')`.
     - Проверяет `ok === true`.
   - **Тест 3: Тихий час.**
     - Временно ставит тихий час = текущее время ± 1 час (чтобы попасть).
     - Вызывает `telegramService.sendOrEnqueue(...)` — проверяет, что сообщение попало в `team_telegram_queue`, а не отправлено.
     - Возвращает тихий час обратно.
   - **Тест 4: Flush очереди.**
     - Вызывает `telegramService.flushQueue()`.
     - Проверяет, что записи в `team_telegram_queue` получили `status = 'sent'` и `sent_at IS NOT NULL`.
   - **Тест 5: Агент без бота.**
     - Создаёт (или берёт) агента без привязки в `team_telegram_bots`.
     - Вызывает `telegramService.sendMessageFromAgent(agentId, ...)` — проверяет, что функция тихо вышла без ошибки.
   - **Тест 6: Paused-агент.**
     - Берёт агента со статусом `paused`.
     - Проверяет, что `dailyReportsJob` пропускает его (не формирует отчёт).
   - **Тест 7: Нотификация → Telegram.**
     - Создаёт тестовую нотификацию `task_awaiting_review`.
     - Проверяет, что в `team_telegram_queue` (или напрямую отправлено) есть соответствующая запись.
   - **Тест 8: Urgent notification.**
     - Устанавливает тихий час на текущее время.
     - Создаёт нотификацию `proposal` с `urgency = true`.
     - Проверяет, что сообщение отправлено немедленно (не в очередь).
   - Лог на русском, summary в конце: «Тесты Telegram: 8/8 пройдено» или «ОШИБКА: тест N — ...».
   - `npm run test:telegram` в `package.json`.

2. **Проверь и зафиксируй edge-cases** в `telegramService`:
   - Множественные голосовые подряд: каждое идёт в парсер отдельно (не склеиваются). Добавить в `processIncomingVoice` — каждый вызов независим. Если два голосовых подряд — два вызова `parseFeedback`.
   - Бот деактивирован (`status = 'inactive'` в `team_telegram_bots`) — `sendMessageFromAgent` проверяет статус, не отправляет.
   - Telegram API rate limit — `telegramService.sendMessage` должен обрабатывать ответ `429 Too Many Requests`: retry через `retry_after` секунд (максимум 3 попытки). Если после 3 попыток — логировать ошибку, не бросать.
   - Если `TELEGRAM_SYSTEM_BOT_TOKEN` не задан — все Telegram-функции тихо пропускаются. Система работает без Telegram.

3. **Добавь сообщения при изменении состава команды:**
   - В `agentService.createAgent()` — если Telegram включён: отправить от системного бота «👋 {{agent_name}} присоединился к команде».
   - В `agentService.updateAgent()` при смене статуса на `paused` — «⏸ {{agent_name}} на паузе».
   - При смене статуса на `active` (возвращение) — «▶️ {{agent_name}} вернулся в строй».
   - При `archived` — «📦 {{agent_name}} выведен из команды».

4. **Обнови README** (если есть `docs/team.md` или `backend/README.md`):
   - Список новых ENV-переменных: `TELEGRAM_SYSTEM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_CHAT_ID` (если в ENV, а не в БД).
   - Описание Telegram-инфраструктуры: 1 системный бот + N ботов агентов, webhook, тихий час, очередь.

**Что делать после сессии:**

1. Запустить `npm run test:telegram` — все 8 тестов проходят.
2. Полный end-to-end:
   - Поставить задачу агенту → довести до `done` → push в Telegram ✓.
   - Дождаться времени отчёта → отчёт приходит ✓.
   - Записать голосовое в reply → кандидат в правило в Inbox → Accept через Telegram ✓.
   - Проверить тихий час: поставить на текущее время → push → очередь → сменить обратно → flush → сообщение пришло ✓.
   - Срочное предложение (если есть агент с autonomy_level = 1 и триггер) → ⚡ приходит мгновенно ✓.
3. Закоммитить, push, деплой.

**Критерии готовности:**

- `npm run test:telegram` — 8/8 тестов пройдено.
- Полный цикл end-to-end: задача → done → push → отчёт → голосовое → парсер → правило → Accept в Telegram.
- Edge-cases обработаны: агент без бота, paused-агент, deactivated бот, множественные голосовые, rate limit, отсутствие ENV.
- Сообщения при изменении состава команды отправляются.
- Никаких регрессий во всех предыдущих сессиях.

---

### Сессия 43 — Уникальные ссылки на задачи и полноэкранный режим (этап 6, пункт 22)

**Цель:** Создать маршрут `/blog/team/tasks/<task_id>` (полноэкранная карточка задачи), добавить иконку «развернуть» и кнопку «Скопировать ссылку» в карточку задачи на дашборде и в Inbox.

**Что делать до сессии:**

- Убедиться, что Сессии 39–42 (пункт 20) завершены. Никаких миграций.

**ТЗ для Claude Code:**

1. **Создай страницу** `frontend/src/app/blog/team/tasks/[id]/page.tsx`:
   - Принимает `id` из URL (это `task_id` из `team_tasks`).
   - Загружает задачу: `GET /api/team/tasks/:id` (если такого эндпоинта нет — создать в `routes/team/tasks.js`: SELECT из `team_tasks` с `DISTINCT ON (id)` для получения последнего состояния, WHERE `id = $1`).
   - Если задача не найдена — страница 404 с текстом «Задача не найдена».
   - Отображает полную карточку задачи на весь экран:
     - Заголовок: тип задачи + имя агента (с аватаром, если `agent_id` задан).
     - Статус (цветной бейдж).
     - Бриф задачи (полный текст).
     - Артефакт (если есть — полный текст/markdown с рендерингом).
     - Шаг прогресса `step_state` (если многошаговая — «Шаг N из M»).
     - Оценка (если задана).
     - Цепочка задач: если `parent_task_id` — ссылка «← Предыдущая задача», если есть дочерние — ссылки «Следующие задачи →».
     - Дата создания, дата обновления.
     - Кнопка «Скопировать ссылку» — копирует `https://potok-app.vercel.app/blog/team/tasks/<id>` в буфер обмена, toast «Ссылка скопирована».
     - Кнопка «← Назад к дашборду» — ссылка на `/blog/team/dashboard`.
     - Кнопки действий (если задача в `done`): «Оценить» (если ещё нет оценки), «Передать дальше» (handoff).
   - Защита `requireAuth` — стандартный middleware Next.js (уже есть с Сессии 1).

2. **Добавь эндпоинт** `GET /api/team/tasks/:id` в `routes/team/tasks.js` (если его нет):
   - `SELECT * FROM team_tasks WHERE id = $1 ORDER BY created_at DESC LIMIT 1` (получаем последнее состояние для append-only).
   - Обогатить данными агента (имя, аватар) через JOIN или отдельный запрос.
   - 404 если не найден.
   - `requireAuth`.

3. **Обнови компонент карточки задачи** на дашборде (лог задач):
   - В правом верхнем углу каждой карточки — две иконки:
     - **«↗ Развернуть»** (expand) — клик ведёт на `/blog/team/tasks/<id>` (навигация, не модалка).
     - **«🔗 Скопировать ссылку»** — копирует URL, toast.
   - Иконки компактные, не отвлекают от содержимого.

4. **Обнови карточки в Inbox** (если нотификации содержат `task_id`):
   - В нотификациях `task_awaiting_review`, `handoff_suggestion` — ссылка «Открыть задачу» ведёт на `/blog/team/tasks/<id>`.

5. **Обнови Telegram-ссылки** (Сессии 40–41):
   - Убедись, что URL в push-уведомлениях и отчётах (`https://potok-app.vercel.app/blog/team/tasks/<id>`) корректно ведёт на новую страницу. Если формат URL совпадает — никаких изменений. Если отличается — обновить.

**Что делать после сессии:**

1. Открыть любую задачу в логе → нажать иконку «Развернуть» → попасть на полноэкранную страницу.
2. Скопировать ссылку → вставить в новую вкладку → та же задача.
3. Открыть ссылку из Telegram push (если есть) → попасть на задачу.
4. Цепочка задач: если есть handoff-цепочка — ссылки «← Предыдущая» и «Следующие →» работают.
5. Ввести несуществующий ID в URL → 404.
6. Закоммитить, push, деплой.

**Критерии готовности:**

- Маршрут `/blog/team/tasks/<id>` работает, показывает полную карточку.
- Иконки «Развернуть» и «Скопировать ссылку» на каждой карточке в логе.
- Telegram-ссылки ведут на правильную страницу.
- Цепочка задач (parent/child) отображается со ссылками.
- 404 для несуществующих задач.
- Никаких регрессий.

---

### Сессия 44 — Batch-режим Anthropic API (этап 6, пункт 22)

**Цель:** Реализовать поддержку Anthropic Batch API в `llmClient.js`, поле `batch_mode` в задачах, `batchPollService` для поллинга результатов, галочку «Batch-режим» в форме постановки задачи и настройку в Админке.

**Что делать до сессии:**

- Убедиться, что Сессия 43 завершена. Следующая миграция — `0028_batch_mode.sql`.

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0028_batch_mode.sql`:
   ```sql
   ALTER TABLE team_tasks
     ADD COLUMN IF NOT EXISTS batch_mode BOOLEAN DEFAULT false,
     ADD COLUMN IF NOT EXISTS batch_id TEXT;

   CREATE INDEX idx_team_tasks_batch ON team_tasks(batch_id) WHERE batch_id IS NOT NULL;

   COMMENT ON COLUMN team_tasks.batch_mode IS 'Задача запущена в batch-режиме Anthropic (50% скидка, до 24ч).';
   COMMENT ON COLUMN team_tasks.batch_id IS 'ID batch-запроса Anthropic для отслеживания.';
   ```

2. **Расширь `llmClient.js`** — поддержка batch-режима:
   - Новый метод `async sendBatchRequest(provider, model, messages, options = {})`:
     - Только для `provider === 'anthropic'`. Для остальных — fallback на обычный вызов с логом «Batch-режим не поддержан для провайдера X».
     - Использует Anthropic Batch API: `POST https://api.anthropic.com/v1/messages/batches` (через `@anthropic-ai/sdk` — `anthropic.beta.messages.batches.create()`).
     - Формирует batch из одного запроса (для простоты; расширение до группировки — открытый вопрос на потом).
     - Возвращает `{ batchId, status: 'in_progress' }`.
   - Новый метод `async checkBatchStatus(batchId)`:
     - `GET https://api.anthropic.com/v1/messages/batches/${batchId}` (через SDK: `anthropic.beta.messages.batches.retrieve(batchId)`).
     - Возвращает `{ status, results }`. Если `status === 'ended'` — парсит результаты.
   - Новый метод `async getBatchResults(batchId)`:
     - Получает результаты завершённого batch.
     - Возвращает `{ text, inputTokens, outputTokens, cachedTokens }` — в том же формате, что и обычный `sendRequest`.

3. **Расширь `taskRunner.js`**:
   - В `runTaskInBackground(taskId)`:
     - Если `task.batch_mode === true` и провайдер = Anthropic:
       - Вместо `llmClient.sendRequest(...)` → `llmClient.sendBatchRequest(...)`.
       - Получить `batchId` → записать в `team_tasks` (колонка `batch_id`).
       - Перевести задачу в статус `awaiting_resource` (переиспользуем существующий статус — задача ждёт внешнего ресурса).
     - Если `batch_mode === true` и провайдер НЕ Anthropic — логировать предупреждение, выполнить как обычную задачу.

4. **Создай сервис** `backend/src/services/team/batchPollService.js`:
   - Использует `node-cron` — раз в 5 минут.
   - Выбирает все задачи с `batch_id IS NOT NULL AND status = 'awaiting_resource'`.
   - Для каждой: `llmClient.checkBatchStatus(batchId)`.
     - Если `ended` — получает результат, записывает артефакт в `team_tasks`, переводит в `done` (или в `revision` если `self_review_enabled`), записывает расходы в `costTracker` с `source = 'batch'`.
     - Если `failed` — переводит в `error` с сообщением.
     - Если `in_progress` — пропускает.
   - Логирование: «Batch poll: проверено N задач, завершено M, ошибок K».

5. **Расширь Админку**:
   - В блоке настроек Anthropic-провайдера (ключи API, модель): добавить **галочку «Поддержка batch-режима»** → `team_settings.anthropic_batch_enabled` (boolean, default false).
   - Если выключено — галочка в форме постановки задачи не появляется.

6. **Расширь форму постановки задачи** (дашборд):
   - Если `anthropic_batch_enabled === true` и выбранный агент использует Anthropic:
     - Показать галочку **«Batch-режим (дешевле, до 24 часов)»** (default: значение из шаблона `batch_default`, если задано, иначе false).
     - Tooltip: «Стоимость в 2 раза ниже. Результат — в течение 24 часов.»
   - Галочка записывается в `batch_mode` при создании задачи.

7. **Расширь шаблоны задач**:
   - В frontmatter шаблонов (markdown): добавить опциональное поле `batch_default: true|false`.
   - В `taskRunner.js` / `taskTemplateName()` — парсить frontmatter, передавать `batch_default` в форму.

8. **Обнови биллинг**:
   - В `costTracker.js` — при расчёте стоимости batch-задачи: использовать цену × 0.5 (скидка Anthropic Batch API).
   - Новое значение `source`: `'batch'`.

9. **Регистрация cron** в startup бэкенда:
   - Если `anthropic_batch_enabled` — запустить `batchPollService`.

**Что делать после сессии:**

1. Накатить миграцию `0028`.
2. В Админке: включить «Поддержка batch-режима» для Anthropic.
3. Поставить задачу с галочкой «Batch-режим» → задача переходит в `awaiting_resource` с `batch_id`.
4. Дождаться поллинга (до 24 часов, но обычно ~15-30 минут для маленьких задач) → задача переходит в `done` с артефактом.
5. Проверить расходы: стоимость = обычная × 0.5.
6. Поставить задачу без batch → обычное выполнение (без регрессий).
7. Закоммитить, push, деплой.

**Критерии готовности:**

- Галочка «Batch-режим» в форме постановки появляется при включённой настройке Anthropic.
- Batch-задача получает `batch_id`, переходит в `awaiting_resource`.
- `batchPollService` раз в 5 минут проверяет статус и подтягивает результат при завершении.
- Стоимость batch-задач = 50% от обычной.
- Обычные (не-batch) задачи работают без изменений.
- Ошибки batch (failed) корректно переводят задачу в `error`.
- Никаких регрессий.

---

### Сессия 45 — Кастомные базы с нуля: мастер создания (этап 6, пункт 22)

**Цель:** Реализовать мастер «+ Создать базу» в разделе Базы — создание кастомной базы с нуля (имя, описание, колонки с типами), динамическое создание таблицы Supabase, CRUD записей.

**Что делать до сессии:**

- Убедиться, что Сессия 44 завершена. Следующая миграция — `0029_custom_db_functions.sql`.

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0029_custom_db_functions.sql`:
   - SQL-функция для динамического создания таблицы:
     ```sql
     CREATE OR REPLACE FUNCTION create_custom_table(
       p_table_name TEXT,
       p_columns JSONB -- [{ "name": "title", "type": "text" }, { "name": "count", "type": "integer" }, ...]
     ) RETURNS VOID AS $$
     DECLARE
       col JSONB;
       sql_text TEXT;
       pg_type TEXT;
     BEGIN
       sql_text := format('CREATE TABLE IF NOT EXISTS %I (
         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
         created_at TIMESTAMPTZ DEFAULT now()', p_table_name);
       
       FOR col IN SELECT * FROM jsonb_array_elements(p_columns) LOOP
         pg_type := CASE (col->>'type')
           WHEN 'text' THEN 'TEXT'
           WHEN 'long_text' THEN 'TEXT'
           WHEN 'number' THEN 'NUMERIC'
           WHEN 'url' THEN 'TEXT'
           WHEN 'select' THEN 'TEXT'
           WHEN 'multi_select' THEN 'TEXT[]'
           WHEN 'date' THEN 'DATE'
           WHEN 'boolean' THEN 'BOOLEAN DEFAULT false'
           ELSE 'TEXT'
         END;
         sql_text := sql_text || format(', %I %s', (col->>'name'), pg_type);
       END LOOP;
       
       sql_text := sql_text || ')';
       EXECUTE sql_text;
     END;
     $$ LANGUAGE plpgsql SECURITY DEFINER;

     COMMENT ON FUNCTION create_custom_table IS 'Создаёт пользовательскую таблицу по JSON-схеме колонок. Вызывается из customDatabaseService.';
     ```

2. **Расширь `customDatabaseService.js`**:
   - `async createDatabase({ name, description, columns })`:
     - Генерирует `table_name`: `team_custom_${slugify(name)}_${Date.now()}` (уникальное, безопасное для SQL).
     - Вызывает `supabase.rpc('create_custom_table', { p_table_name: tableName, p_columns: columns })`.
     - Записывает в `team_custom_databases`: `{ name, description, table_name: tableName, db_type: 'custom', schema_definition: { columns } }`.
     - Возвращает созданную запись.
   - `async addRecord(tableName, data)`:
     - `supabase.from(tableName).insert(data)`.
     - Валидация: проверить, что ключи `data` совпадают с `schema_definition.columns` из реестра (не позволяет запись в произвольные колонки).
   - `async updateRecord(tableName, recordId, data)`:
     - `supabase.from(tableName).update(data).eq('id', recordId)`.
   - `async deleteRecord(tableName, recordId)`:
     - `supabase.from(tableName).delete().eq('id', recordId)`.
   - Сообщения об ошибках — на русском.

3. **Добавь API-маршруты** в `routes/team/databases.js`:
   - `POST /api/team/databases` — создание базы (body: `{ name, description?, columns: [{ name, type, options? }] }`). Вызывает `customDatabaseService.createDatabase(...)`. Возвращает созданную запись.
   - `POST /api/team/databases/:id/records` — добавление записи (body: `{ data: {...} }`).
   - `PATCH /api/team/databases/:id/records/:recordId` — обновление записи.
   - `DELETE /api/team/databases/:id/records/:recordId` — удаление записи.
   - Все маршруты — `requireAuth`.

4. **Создай UI мастера** на фронтенде:
   - На странице `/blog/databases` — кнопка **«+ Создать базу»** (рядом с существующими карточками).
   - Клик → модальное окно с тремя шагами:
     - **Шаг 1: Имя и описание.**
       - Текстовое поле «Имя базы» (обязательное).
       - Текстовое поле «Описание» (опциональное, одна строка).
     - **Шаг 2: Колонки.**
       - Список колонок (начинается пустым). Кнопка «+ Добавить колонку».
       - Для каждой: имя (текст) + тип (выпадашка: text, long_text, number, url, select, multi_select, date, boolean).
       - Если тип = `select` или `multi_select` — дополнительное поле: варианты через запятую.
       - Кнопка «×» для удаления колонки.
       - Минимум 1 колонка для сохранения.
     - **Шаг 3: Подтверждение.**
       - Превью: имя, описание, таблица колонок с типами.
       - Кнопка «Создать базу».
   - После создания: toast «База создана», редирект на страницу новой базы (`/blog/databases/[slug]`).

5. **Обнови страницу базы** `/blog/databases/[slug]/page.tsx`:
   - Для кастомных баз (тип `custom`) — добавь CRUD:
     - Кнопка **«+ Добавить запись»** → модалка с полями по `schema_definition.columns`. Типы полей маппятся на input-компоненты:
       - `text`, `url` → `<input type="text">`.
       - `long_text` → `<textarea>`.
       - `number` → `<input type="number">`.
       - `date` → `<input type="date">`.
       - `boolean` → `<input type="checkbox">`.
       - `select` → `<select>` с вариантами из schema.
       - `multi_select` → чекбоксы или multi-select.
     - Каждая строка таблицы — кнопки «✏️ Редактировать» и «🗑 Удалить» (с confirm-диалогом).
   - Для фиксированных баз (referensy, competitor) — оставить read-only (без изменений).

6. **Обнови sidebar Баз**:
   - Кастомные базы появляются в подменю автоматически (из `GET /api/team/databases`).
   - Визуальный разделитель между фиксированными (Референсы, Конкуренты) и кастомными — тонкая линия или заголовок «Кастомные».

7. **Не реализовывать в этой сессии:**
   - Промоут артефакта в базу (кнопка «Сделать базой» в Артефактах) — отдельная сессия (Сессия 46).
   - Тип `relation` — ❌ осознанно.
   - Формулы — ❌ осознанно.
   - Views — ❌ осознанно.
   - Редактирование схемы после создания — ❌ осознанно.
   - Импорт CSV — ❌ осознанно.

**Что делать после сессии:**

1. Накатить миграцию `0029`.
2. На странице Баз → «+ Создать базу» → создать «Контент-план» с колонками: Тема (text), Дата (date), Статус (select: «Идея/В работе/Готово»), Ссылка (url).
3. Проверить в Supabase Dashboard: таблица `team_custom_<slug>_<timestamp>` создана с правильными колонками.
4. Добавить 2-3 записи через UI → записи видны в таблице.
5. Отредактировать запись → изменения сохранены.
6. Удалить запись → запись удалена (с confirm).
7. В sidebar «Базы» → новая база видна в подменю.
8. Закоммитить, push, деплой.

**Критерии готовности:**

- Мастер «+ Создать базу» работает: 3 шага → реальная таблица в Supabase.
- CRUD записей: добавление, редактирование, удаление через UI.
- 8 типов колонок корректно отображаются и редактируются.
- Кастомная база появляется в sidebar и по динамическому маршруту.
- Фиксированные базы (Референсы, Конкуренты) не сломаны — по-прежнему read-only.
- Никаких регрессий.

---

### Сессия 46 — Промоут артефакта в базу и дизайн-токены (этап 6, пункт 22)

**Цель:** Реализовать кнопку «Сделать базой» на странице артефактов (промоут артефакта → мастер создания базы с предзаполнением), внедрить дизайн-токены палитры Хокусая как CSS-переменные и перевести раздел «Команда» на их использование.

**Что делать до сессии:**

- Убедиться, что Сессия 45 завершена. Никаких миграций.

**ТЗ для Claude Code:**

1. **Добавь кнопку «Сделать базой»** на странице артефактов (`/blog/team/artifacts`):
   - На каждом артефакте (карточка в списке или детальный просмотр) — кнопка **«📊 Сделать базой»**.
   - Клик → Системная LLM анализирует содержимое артефакта и предлагает структуру базы:
     - Запрос к `llmClient.sendRequest()` (дешёвая модель):
       ```
       Проанализируй этот текст и предложи структуру базы данных.
       Верни JSON: { "name": "...", "description": "...", "columns": [{ "name": "...", "type": "text|long_text|number|url|select|multi_select|date|boolean" }] }
       Типы: text (короткий текст), long_text (длинный), number, url, select (один из списка), multi_select (несколько), date, boolean.
       
       Текст артефакта:
       {{artifact_text}}
       ```
     - Результат → открывает мастер создания базы (Сессия 45) с предзаполненными полями (имя, описание, колонки).
     - Влад может поправить колонки перед созданием.
   - Расходы на LLM → `costTracker` с `source = 'promote_artifact'`.

2. **Создай файл дизайн-токенов** `frontend/src/styles/hokusai-tokens.css`:
   ```css
   :root {
     /* Палитра «Большая волна в Канагаве» (Хокусай) */
     --bg-canvas: #F5EFE0;
     --bg-surface: #FFFFFF;
     --text-primary: #1A1A1A;
     --text-secondary: #5A5A5A;
     --accent-primary: #1B3A6B;
     --accent-secondary: #2C5A8C;
     --accent-soft: #A8C5DA;
     --accent-warm: #C9A876;
     --border-subtle: #D6E4ED;
     --bg-hover: #E8D4A8;
     
     /* Статусы задач */
     --status-running: #2C5A8C;
     --status-done: #4A7C59;
     --status-error: #8B3A3A;
     --status-awaiting: #C9A876;
     --status-clarifying: #7B68AE;
     --status-archived: #8A8A8A;
   }
   ```

3. **Импортируй токены** в `frontend/src/app/layout.tsx` (или глобальный CSS):
   - `@import '../styles/hokusai-tokens.css';`

4. **Переведи раздел «Команда» на дизайн-токены**:
   - Пройдись по всем компонентам в `frontend/src/app/blog/team/**/*.tsx`:
     - Замени hardcoded цвета фонов на `var(--bg-canvas)` / `var(--bg-surface)`.
     - Замени цвета текста на `var(--text-primary)` / `var(--text-secondary)`.
     - Замени цвета кнопок/ссылок/акцентов на `var(--accent-primary)` / `var(--accent-warm)`.
     - Замени цвета бейджей статусов на `var(--status-*)`.
     - Замени цвета рамок на `var(--border-subtle)`.
   - **НЕ трогай** компоненты вне раздела «Команда» (Блог, главная) — только `/blog/team/**` и `/blog/databases/**`.
   - **НЕ меняй** шрифты, отступы, скруглённости — только цвета.

5. **Не реализовывать в этой сессии:**
   - Тёмную тему — ❌ осознанно.
   - Кастомизацию палитры — ❌ осознанно.
   - Мобильную адаптацию — ❌ осознанно.

**Что делать после сессии:**

1. Открыть раздел «Команда» → визуально убедиться, что палитра Хокусая применена (кремовый фон, синие акценты, охра для важных действий).
2. На странице Артефактов → нажать «Сделать базой» на артефакте → LLM предложит структуру → мастер откроется с предзаполнением → создать базу.
3. Пройти по всем страницам Команды (Дашборд, Сотрудники, Инструкции, Артефакты, Админка, Базы) — убедиться, что цвета из токенов, нет hardcoded цветов.
4. Проверить страницы ВНЕ раздела Команды — они не изменились.
5. Закоммитить, push, деплой.

**Критерии готовности:**

- Кнопка «Сделать базой» на артефактах: LLM анализирует → предлагает структуру → мастер с предзаполнением → база создаётся.
- Файл `hokusai-tokens.css` с полной палитрой.
- Все компоненты раздела «Команда» используют CSS-переменные вместо hardcoded цветов.
- Визуально: кремовый фон, синие акценты, цветные статусы задач.
- Страницы вне Команды не затронуты.
- Никаких регрессий.

---

### Сессия 47 — Интеграционное тестирование пункта 22 и финализация этапа 6 (этап 6, пункт 22)

**Цель:** Прогнать полный end-to-end всех фич пункта 22 (уникальные ссылки, batch, кастомные базы, промоут, палитра), написать интеграционный тест, проверить пересечения с пунктом 20 (Telegram).

**Что делать до сессии:**

- Убедиться, что Сессии 43–46 завершены.

**ТЗ для Claude Code:**

1. **Создай интеграционный тест-скрипт** `backend/scripts/test-p22.js`:
   - **Тест 1: Уникальная ссылка на задачу.**
     - Создаёт задачу через API → проверяет, что `GET /api/team/tasks/:id` возвращает корректные данные.
   - **Тест 2: Batch-режим.**
     - Создаёт задачу с `batch_mode: true` → проверяет, что `batch_id` записан, статус = `awaiting_resource`.
     - (Полный цикл batch зависит от Anthropic API — этот тест проверяет только инициацию.)
   - **Тест 3: Создание кастомной базы.**
     - `POST /api/team/databases` с тестовыми колонками → проверяет, что таблица создана в Supabase.
     - `POST /api/team/databases/:id/records` → запись добавлена.
     - `GET /api/team/databases/:id/records` → запись видна.
     - `DELETE /api/team/databases/:id/records/:recordId` → запись удалена.
   - **Тест 4: Telegram ↔ уникальные ссылки.**
     - Создаёт задачу → помечает `done` → проверяет, что push-уведомление содержит URL `/blog/team/tasks/<id>`.
   - **Тест 5: Дизайн-токены.**
     - Проверяет, что файл `hokusai-tokens.css` существует и содержит все обязательные переменные.
   - Лог на русском, summary: «Тесты п.22: 5/5 пройдено».
   - `npm run test:p22`.

2. **Проверь пересечения с Telegram (п.20):**
   - Push-уведомления о batch-задачах: когда `batchPollService` переводит задачу в `done` — убедись, что push отправляется (та же логика из `taskRunner.markTaskDone` или аналог).
   - Ежедневные отчёты: batch-задачи, завершённые за день, попадают в отчёт агента.

3. **Проверь пересечения с Inbox:**
   - Batch-задача в `done` → нотификация `task_awaiting_review` создаётся → дублируется в Telegram.

4. **Удали тестовые данные** из Supabase (тестовые кастомные базы из тестового скрипта — метод `cleanupTestData()` в конце скрипта).

**Что делать после сессии:**

1. Запустить `npm run test:p22` — 5/5 тестов пройдено.
2. Полный end-to-end этапа 6:
   - Поставить batch-задачу → ожидание → результат → push в Telegram ✓.
   - Создать кастомную базу → добавить записи → привязать к агенту (через карточку) ✓.
   - Открыть задачу по уникальной ссылке из Telegram ✓.
   - Промоут артефакта в базу ✓.
   - Визуально: палитра Хокусая на всех страницах Команды ✓.
3. Закоммитить, push, деплой.

**Критерии готовности:**

- `npm run test:p22` — 5/5 пройдено.
- Batch-задачи корректно интегрируются с Telegram (push при завершении) и Inbox (нотификация).
- Уникальные ссылки работают из всех точек: дашборд, Telegram, Inbox.
- Кастомные базы: создание, CRUD, промоут артефакта — полный цикл.
- Палитра Хокусая визуально применена.
- Никаких регрессий во всех предыдущих 46 сессиях.

---

### Сессия 48 — Универсальный OpenAI-compatible адаптер (этап 7, пункт 1)

**Цель:** Расширить `llmClient.js` универсальным адаптером для любого OpenAI-compatible провайдера (DeepSeek, Groq, Perplexity, OpenRouter, Ollama Cloud и др.), расширить таблицу `team_api_keys` под хранение произвольных провайдеров с `base_url`, обновить UI управления ключами в Админке.

**Что делать до сессии:**

- Ничего. Все изменения — код + одна миграция.

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0030_openai_compatible_providers.sql`:
   ```sql
   -- Расширяем team_api_keys для произвольных провайдеров
   ALTER TABLE team_api_keys
     ADD COLUMN IF NOT EXISTS base_url TEXT,
     ADD COLUMN IF NOT EXISTS is_openai_compatible BOOLEAN DEFAULT false,
     ADD COLUMN IF NOT EXISTS display_name TEXT,
     ADD COLUMN IF NOT EXISTS models JSONB DEFAULT '[]'::jsonb;

   -- display_name — человекочитаемое имя провайдера в UI
   -- base_url — для OpenAI-compatible: 'https://api.deepseek.com/v1', 'https://api.groq.com/openai/v1' и т.д.
   -- models — массив доступных моделей (заполняется вручную или по /models endpoint)
   -- is_openai_compatible = true для всех, кроме anthropic и google

   COMMENT ON COLUMN team_api_keys.base_url IS 'Base URL для OpenAI-compatible провайдеров';
   COMMENT ON COLUMN team_api_keys.is_openai_compatible IS 'true = используется универсальный OpenAI-адаптер';
   COMMENT ON COLUMN team_api_keys.display_name IS 'Человекочитаемое имя провайдера';
   COMMENT ON COLUMN team_api_keys.models IS 'Массив доступных моделей провайдера';

   -- Обновляем существующие записи
   UPDATE team_api_keys SET display_name = 'Anthropic', is_openai_compatible = false WHERE provider = 'anthropic';
   UPDATE team_api_keys SET display_name = 'OpenAI', is_openai_compatible = true, base_url = 'https://api.openai.com/v1' WHERE provider = 'openai';
   UPDATE team_api_keys SET display_name = 'Google Gemini', is_openai_compatible = false WHERE provider = 'google';
   ```

2. **Расширь `llmClient.js`** — добавь универсальный OpenAI-compatible адаптер:
   - Новый метод `sendOpenAICompatibleRequest({ provider, model, messages, base_url, api_key, ...options })`.
   - Использует существующий npm-пакет `openai` (уже установлен). Инициализирует `new OpenAI({ apiKey, baseURL: base_url })`.
   - Формат запроса: стандартный OpenAI Chat Completions API (`/chat/completions`).
   - Возврат: тот же `{ text, inputTokens, outputTokens, cachedTokens: 0 }` — приводит ответ к единому формату.
   - Обновить основной метод `sendRequest()`: если `provider` не `anthropic` и не `google` — проверить `is_openai_compatible` в записи `team_api_keys`, если `true` — использовать `sendOpenAICompatibleRequest()` с `base_url` из записи.
   - Для `provider = 'openai'` — оставить текущую логику (она уже через пакет `openai`), но убедиться, что `base_url` можно переопределить.
   - Обработка ошибок: если провайдер вернул нестандартный формат — залогировать и вернуть понятную ошибку на русском.

3. **Создай файл** `backend/src/config/providerPresets.js`:
   ```js
   // Пресеты для известных OpenAI-compatible провайдеров
   // Используются при добавлении ключа — подставляют base_url и список моделей
   const PROVIDER_PRESETS = {
     deepseek: {
       display_name: 'DeepSeek',
       base_url: 'https://api.deepseek.com/v1',
       is_openai_compatible: true,
       models: ['deepseek-chat', 'deepseek-reasoner'],
       help_url: 'https://platform.deepseek.com/api_keys'
     },
     groq: {
       display_name: 'Groq',
       base_url: 'https://api.groq.com/openai/v1',
       is_openai_compatible: true,
       models: ['llama-3.3-70b-versatile', 'mixtral-8x7b-32768', 'gemma2-9b-it'],
       help_url: 'https://console.groq.com/keys'
     },
     perplexity: {
       display_name: 'Perplexity',
       base_url: 'https://api.perplexity.ai',
       is_openai_compatible: true,
       models: ['sonar', 'sonar-pro', 'sonar-reasoning'],
       help_url: 'https://www.perplexity.ai/settings/api'
     },
     openrouter: {
       display_name: 'OpenRouter',
       base_url: 'https://openrouter.ai/api/v1',
       is_openai_compatible: true,
       models: [],
       help_url: 'https://openrouter.ai/keys'
     },
     ollama_cloud: {
       display_name: 'Ollama Cloud',
       base_url: 'https://api.ollama.com/v1',
       is_openai_compatible: true,
       models: [],
       help_url: 'https://ollama.com/settings/keys'
     }
   };
   module.exports = { PROVIDER_PRESETS };
   ```

4. **Обнови `keysService.js`**:
   - `addKey({ provider, api_key, base_url, display_name, is_openai_compatible, models })` — расширить INSERT для новых полей.
   - `getKeyByProvider(provider)` — возвращать все поля включая `base_url`, `is_openai_compatible`, `models`.
   - `listKeys()` — возвращать все ключи со всеми полями (для UI Админки).
   - Новый метод `testKey(provider)` — делает минимальный запрос (`/models` или одно сообщение «Привет») к провайдеру, возвращает `{ success: true/false, error?: string }`. Для Anthropic — через `@anthropic-ai/sdk`, для Google — через `@google/generative-ai`, для OpenAI-compatible — через `openai` с `base_url`.

5. **Обнови маршруты** `routes/team/admin.js`:
   - `POST /api/team/admin/keys` — принимает `{ provider, api_key, base_url?, display_name?, models? }`. Если `provider` есть в `PROVIDER_PRESETS` — дозаполняет `base_url` и `display_name` из пресета. Если нет — использует переданные значения (кастомный провайдер).
   - `POST /api/team/admin/keys/:provider/test` — вызывает `keysService.testKey(provider)`, возвращает `{ success, error? }`.
   - `GET /api/team/admin/presets` — возвращает `PROVIDER_PRESETS` для фронтенда.

6. **Обнови UI страницы Админки** (`frontend/src/app/blog/team/admin/page.tsx`):
   - В блоке «Ключи и провайдеры» — вместо текущей формы (только три поля под Anthropic/OpenAI/Google) сделать:
     - Список уже подключённых провайдеров с индикатором статуса (ключ есть / нет ключа / ошибка).
     - Кнопка **«+ Добавить провайдер»** → модальное окно:
       - Первый шаг: список preset-провайдеров (Anthropic, OpenAI, Google, DeepSeek, Groq, Perplexity, OpenRouter, Ollama Cloud) — каждый как кликабельная карточка с именем и описанием. Внизу — кнопка «Добавить custom» для произвольного провайдера.
       - Второй шаг (preset): поле ввода API-ключа + ссылка «Где взять ключ?» (из `help_url` пресета) + кнопка «Проверить» (вызывает `/keys/:provider/test`) + кнопка «Сохранить».
       - Второй шаг (custom): поля `name` + `api_key` + `base_url` + `model` + кнопка «Проверить» + «Сохранить».
   - Рядом с каждым подключённым провайдером — кнопка «🔄 Проверить» (тест ключа) и «🗑 Удалить».
   - **НЕ делать** иконки/логотипы провайдеров — только текстовые имена. Визуальная подача — в будущей дизайн-сессии.

7. **Обнови `costTracker.js`**:
   - Для неизвестных провайдеров (custom OpenAI-compatible) — использовать дефолтную стоимость из `pricing.json` с ключом `default_openai_compatible` (добавить запись в `pricing.json`: `{ "input": 0.001, "output": 0.002 }` — приблизительный средний уровень).
   - Добавить конкретные записи для DeepSeek, Groq, Perplexity в `pricing.json` (актуальные цены проверить при разработке).

**Что делать после сессии:**

1. Накатить миграцию `0030` через Supabase Dashboard.
2. В UI Админки → «+ Добавить провайдер» → выбрать DeepSeek → ввести ключ → «Проверить» → зелёная галочка → «Сохранить».
3. Поставить задачу с выбором DeepSeek как модели → задача выполняется, результат возвращается.
4. Проверить, что существующие Anthropic/OpenAI/Google ключи не сломаны.
5. Закоммитить, push, деплой.

**Критерии готовности:**

- Миграция `0030` применена, новые поля в `team_api_keys` видны.
- Универсальный адаптер работает: можно добавить DeepSeek-ключ через UI и выполнить задачу.
- Кнопка «Проверить» корректно тестирует ключи всех подключённых провайдеров.
- Список пресетов загружается на фронте через `GET /api/team/admin/presets`.
- Кастомный провайдер (произвольный `name + base_url + api_key`) можно добавить и использовать.
- Расходы записываются в `team_api_calls` с правильным `provider` и стоимостью.
- Существующие три провайдера (Anthropic, OpenAI, Google) работают без регрессий.
- Никаких регрессий во всех предыдущих сессиях.

---

### Сессия 49 — Системная LLM и расширение биллинга (этап 7, пункт 1)

**Цель:** Реализовать UI-блок «Системная LLM» в Админке (выбор провайдера/модели для системных функций), расширить биллинг: селектор периода, конвертация USD→₽, разбивка расходов по агентам и системным функциям, график по дням.

**Что делать до сессии:**

- Убедиться, что миграция `0030` (Сессия 48) накачена. Следующая — `0031`.

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0031_system_llm_and_billing.sql`:
   ```sql
   -- Настройки Системной LLM
   INSERT INTO team_settings (key, value) VALUES
     ('system_llm_provider', '"anthropic"'),
     ('system_llm_model', '"claude-haiku-4-5-20251001"'),
     ('system_llm_budget_usd', '10')
   ON CONFLICT (key) DO NOTHING;

   -- Категория расходов для системных функций (agent_id = NULL)
   -- agent_id уже nullable в team_api_calls (Сессия 12, миграция 0015)
   -- Добавляем поле для детализации системных функций
   ALTER TABLE team_api_calls
     ADD COLUMN IF NOT EXISTS system_function TEXT;

   COMMENT ON COLUMN team_api_calls.system_function IS 'Имя системной функции: refine_prompt, feedback_parser, episode_compression, rule_candidates, curator, skill_extraction, draft_role, analyze_artifact, clarification, merge_artifacts, daily_report, promote_artifact';

   CREATE INDEX IF NOT EXISTS idx_team_api_calls_system_function ON team_api_calls(system_function) WHERE system_function IS NOT NULL;
   ```

2. **Создай сервис** `backend/src/services/team/systemLLMService.js`:
   - `async getSystemLLMConfig()` — читает `system_llm_provider`, `system_llm_model`, `system_llm_budget_usd` из `team_settings`. Возвращает `{ provider, model, budgetUsd }`.
   - `async updateSystemLLMConfig({ provider, model, budgetUsd })` — обновляет соответствующие записи в `team_settings`.
   - `async sendSystemRequest({ messages, systemFunction, maxTokens })` — обёртка над `llmClient.sendRequest()`, которая:
     - Читает конфиг через `getSystemLLMConfig()`.
     - Вызывает `llmClient.sendRequest({ provider, model, messages, maxTokens })`.
     - Записывает в `team_api_calls` с `agent_id = null` и `system_function = systemFunction`.
     - Проверяет бюджет системной LLM (сумма расходов с `system_function IS NOT NULL` за текущий месяц vs `system_llm_budget_usd`). При превышении — лог предупреждения, но не блокировка (мягкий лимит).
     - Возвращает тот же `{ text, inputTokens, outputTokens }`.

3. **Переведи все системные функции на `systemLLMService.sendSystemRequest()`**:
   - `feedbackParserService.js` — заменить прямой вызов `llmClient` на `systemLLMService.sendSystemRequest({ ..., systemFunction: 'feedback_parser' })`.
   - `compress-episodes.js` (или `backend/scripts/compress-episodes.js`) — `systemFunction: 'episode_compression'`.
   - `clarificationService.js` — `systemFunction: 'clarification'`.
   - `mergeService.js` — `systemFunction: 'merge_artifacts'`.
   - `dailyReportsJob.js` — `systemFunction: 'daily_report'`.
   - Промоут артефакта (Сессия 46, вызов LLM для анализа структуры) — `systemFunction: 'promote_artifact'`.
   - Голосовой черновик Role (Сессия 10, `POST /api/team/agents/draft-role`) — `systemFunction: 'draft_role'`.
   - Функция «Уточнить промпт» (существующая в Инструкциях) — `systemFunction: 'refine_prompt'`.
   - Если какая-то из функций ещё вызывает `llmClient` напрямую с hardcoded моделью — перевести на `systemLLMService`.
   - Сообщения об ошибках — на русском.

4. **Обнови маршруты** `routes/team/admin.js`:
   - `GET /api/team/admin/system-llm` → `systemLLMService.getSystemLLMConfig()`.
   - `PUT /api/team/admin/system-llm` → `systemLLMService.updateSystemLLMConfig(req.body)`. Валидация: `provider` должен существовать в `team_api_keys`, `model` — непустая строка, `budgetUsd` — число ≥ 0.

5. **Расширь биллинг — бэкенд** в `routes/team/admin.js`:
   - Новый эндпоинт `GET /api/team/admin/billing?from=...&to=...&group_by=agent|model|function|day`:
     - `from`, `to` — ISO timestamps, фильтрация по `team_api_calls.timestamp`.
     - `group_by=agent` — группировка по `agent_id` (NULL = «Системные функции»), сумма `cost_usd`.
     - `group_by=model` — группировка по `model`, сумма `cost_usd`.
     - `group_by=function` — группировка по `system_function` (только WHERE `system_function IS NOT NULL`), сумма `cost_usd`.
     - `group_by=day` — группировка по `DATE(timestamp)`, сумма `cost_usd` — для графика.
     - Всегда возвращает `total_usd` и `total_rub` (через `team_settings.usd_to_rub_rate`).
   - Новый эндпоинт `GET /api/team/admin/billing/summary?from=...&to=...`:
     - Возвращает объект с одновременной разбивкой: `{ total_usd, total_rub, by_agent: [...], by_model: [...], by_function: [...], by_day: [...] }`.
     - Один SQL-запрос с несколькими GROUP BY через CTE или несколько лёгких запросов — на усмотрение, но не больше 4 запросов к БД.

6. **Обнови UI Админки** — блок «Системная LLM»:
   - Новый раздел на странице Админки — **«Системная LLM»** (между «Ключи и провайдеры» и «Расходы»).
   - Выпадашка «Провайдер» (из списка подключённых ключей в `team_api_keys`).
   - Поле «Модель» (text input, или select из `models` выбранного провайдера, если массив непуст).
   - Поле «Лимит расходов в месяц, $» (number input, дефолт 10).
   - Кнопка «Сохранить» → `PUT /api/team/admin/system-llm`.
   - Под полями — информационный блок: список системных функций, использующих эту модель (статический текст из `SYSTEM_FUNCTIONS` — массив строк вроде `['Уточнение промпта', 'Парсер обратной связи', 'Сжатие эпизодов', ...]`). Без привязки к коду — чисто справочный.
   - Текущие расходы Системной LLM за месяц — одна строка «Потрачено за месяц: $X.XX / $Y» (X = сумма, Y = лимит).

7. **Обнови UI Админки** — расширение блока «Расходы»:
   - **Селектор периода** в шапке: кнопки «Сегодня / 7 дней / 30 дней / Текущий месяц / Всё время» + «Свой период» (два date-picker'а). При выборе — перезапрос к `/api/team/admin/billing/summary`.
   - **Конвертация в рубли**: рядом с каждой суммой в долларах — мелким серым текстом рублёвый эквивалент (через `usd_to_rub_rate`). Формат: `$12.50 (≈1 125 ₽)`.
   - **Таблица расходов по агентам**: колонки «Сотрудник | Задач | Расход $». Строка «Системные функции» для `agent_id = null`. Сортировка по расходу desc.
   - **Таблица расходов по моделям**: колонки «Модель | Вызовов | Расход $». Сортировка по расходу desc.
   - **График расходов по дням**: простой bar chart (можно через CSS — div'ы с `height` пропорционально максимуму за период, или через библиотеку recharts если она есть). Ось X — даты, ось Y — $. Цвет — из `hokusai-tokens.css`.
   - Отдельная строка «Расходы на автономность» (где `source = 'autonomy'` в `team_api_calls`) — если `> 0`.
   - Отдельная строка «Расходы на Apify» (где `source = 'apify'` в `team_api_calls`) — если `> 0`.
   - **Кнопка «Обновить курс ₽»** — модальное окно с полем ввода числа + кнопка «Сохранить» → `PUT /api/team/admin/settings` (обновляет `usd_to_rub_rate` в `team_settings`). Если эндпоинта нет — создать.

**Что делать после сессии:**

1. Накатить миграцию `0031`.
2. В UI Админки → блок «Системная LLM» → выбрать провайдер и модель → сохранить. Поставить задачу, которая вызывает парсер обратной связи → в `team_api_calls` запись с `system_function = 'feedback_parser'` и правильным `provider/model`.
3. В блоке «Расходы» → выбрать «7 дней» → таблица по агентам видна, график по дням виден, рубли показаны.
4. Выбрать «Свой период» → задать диапазон → данные обновляются.
5. Закоммитить, push, деплой.

**Критерии готовности:**

- Блок «Системная LLM» в Админке: выбор провайдера/модели работает, настройки сохраняются.
- Все системные функции вызывают LLM через `systemLLMService` — в `team_api_calls` появляется `system_function`.
- Селектор периода в расходах: все 6 вариантов работают, данные перезапрашиваются.
- Таблица по агентам: видны агенты + строка «Системные функции».
- Таблица по моделям: видны все используемые модели.
- График по дням: отображается для выбранного периода.
- Конвертация в рубли: рядом с каждой суммой мелким текстом ₽.
- Кнопка «Обновить курс» работает.
- Никаких регрессий.

---

### Сессия 50 — Мониторинг NotebookLM и финализация Админки (этап 7, пункт 1)

**Цель:** Реализовать heartbeat-мониторинг воркера NotebookLM в Админке (индикатор зелёный/жёлтый/красный, кнопка «Прогнать тест»), дозакрыть открытые вопросы пункта 1.

**Что делать до сессии:**

- Убедиться, что миграция `0031` (Сессия 49) накачена. Следующая — `0032`.

**ТЗ для Claude Code:**

1. **Создай миграцию** `supabase/migrations/0032_notebooklm_heartbeat.sql`:
   ```sql
   CREATE TABLE IF NOT EXISTS team_notebooklm_heartbeat (
     id SERIAL PRIMARY KEY,
     status TEXT NOT NULL DEFAULT 'alive',
     version TEXT,
     last_task_id TEXT,
     last_task_name TEXT,
     created_at TIMESTAMPTZ DEFAULT now()
   );

   COMMENT ON TABLE team_notebooklm_heartbeat IS 'Heartbeat-записи от локального воркера NotebookLM. Последняя запись = текущее состояние.';

   CREATE INDEX idx_notebooklm_heartbeat_created ON team_notebooklm_heartbeat(created_at DESC);
   ```

2. **Создай сервис** `backend/src/services/team/notebookLMMonitorService.js`:
   - `async getStatus()`:
     - Читает последнюю запись из `team_notebooklm_heartbeat` по `created_at DESC LIMIT 1`.
     - Если записи нет — `{ status: 'unknown', message: 'Воркер ни разу не отправлял heartbeat' }`.
     - Если `created_at` младше 1 минуты — `{ status: 'green', lastSeen: created_at, version, lastTask }`.
     - Если от 1 до 5 минут — `{ status: 'yellow', ... }`.
     - Если больше 5 минут — `{ status: 'red', ... }`.
   - `async queueTestTask()`:
     - Вставляет в `team_notebooklm_queue` (таблица из пункта 16, Сессия 20) фиктивную задачу с `type: 'health_check'`, `payload: { test: true }`.
     - Возвращает `{ queued: true, taskId }`.
   - `async getTestResult(taskId)`:
     - Проверяет статус тестовой задачи. Возвращает `{ completed: boolean, result?, error? }`.

3. **Обнови маршруты** `routes/team/admin.js`:
   - `GET /api/team/admin/notebooklm/status` → `notebookLMMonitorService.getStatus()`.
   - `POST /api/team/admin/notebooklm/test` → `notebookLMMonitorService.queueTestTask()`.
   - `GET /api/team/admin/notebooklm/test/:taskId` → `notebookLMMonitorService.getTestResult(taskId)`.

4. **Обнови UI Админки** — блок «NotebookLM»:
   - Новый раздел на странице Админки — **«NotebookLM»** (после «Расходы»).
   - Индикатор статуса: круглый значок 🟢/🟡/🔴 + текст:
     - 🟢 «Онлайн — последний отклик X сек назад. Версия: Y».
     - 🟡 «Возможно занят — последний отклик X мин назад».
     - 🔴 «Офлайн — последний отклик X мин назад» (или «Нет данных»).
   - Если `lastTask` есть — под индикатором мелким текстом «Последняя задача: <имя>».
   - Кнопка **«Прогнать тест»**: при клике → POST `/notebooklm/test` → спиннер → поллинг `/test/:taskId` каждые 3 сек (макс 30 сек) → результат: «✅ Тест пройден» / «❌ Ошибка: <текст>» / «⏳ Таймаут — воркер не ответил за 30 секунд».
   - Авто-обновление статуса каждые 30 секунд (setInterval + GET `/notebooklm/status`).

5. **Финальная компоновка страницы Админки** — проверь порядок блоков:
   - **Безопасность** (whitelist email, жёсткие лимиты — из Сессии 2).
   - **Ключи и провайдеры** (расширение из Сессии 48).
   - **Системная LLM** (из Сессии 49).
   - **Расходы** (расширение из Сессии 49).
   - **NotebookLM** (эта сессия).
   - **Telegram** (настройки из Сессии 39).
   - **Проактивность команды** (тумблер из Сессии 23).
   - Если какие-то блоки разбросаны — сгруппируй. Между блоками — визуальные разделители (линия или отступ). Убедись, что все блоки используют CSS-переменные из `hokusai-tokens.css`.

**Что делать после сессии:**

1. Накатить миграцию `0032`.
2. В Админке → блок «NotebookLM» → индикатор показывает 🔴 «Нет данных» (воркер ещё не запущен).
3. Вручную вставить heartbeat-запись в Supabase Dashboard: `INSERT INTO team_notebooklm_heartbeat (status, version) VALUES ('alive', '0.1.0')` → индикатор переключился на 🟢.
4. Подождать 2 минуты → индикатор переключился на 🟡. Подождать 6 минут → 🔴.
5. Нажать «Прогнать тест» → должен показать ошибку/таймаут (воркера нет). Это ожидаемо — полная интеграция при запуске реального воркера.
6. Проверить компоновку всей страницы Админки — все блоки на местах, визуально чисто.
7. Закоммитить, push, деплой.

**Критерии готовности:**

- Таблица `team_notebooklm_heartbeat` создана.
- Индикатор в UI корректно переключается между 🟢/🟡/🔴 в зависимости от давности heartbeat.
- Кнопка «Прогнать тест» работает (ставит задачу в очередь, показывает результат/таймаут).
- Авто-обновление статуса каждые 30 секунд.
- Все блоки Админки сгруппированы в логичном порядке, стилизованы через `hokusai-tokens.css`.
- Никаких регрессий.

---

### Сессия 51 — Интеграционное тестирование пункта 1 и финализация этапа 7 (этап 7, пункт 1)

**Цель:** Прогнать полный end-to-end всех фич пункта 1 (провайдеры, Системная LLM, биллинг, NotebookLM-мониторинг), написать интеграционный тест, проверить пересечения с существующими сессиями.

**Что делать до сессии:**

- Убедиться, что Сессии 48–50 завершены.

**ТЗ для Claude Code:**

1. **Создай интеграционный тест-скрипт** `backend/scripts/test-p1.js`:
   - **Тест 1: Добавление OpenAI-compatible провайдера.**
     - `POST /api/team/admin/keys` с `{ provider: 'test_provider', api_key: 'test', base_url: 'https://httpbin.org/post', display_name: 'Test', is_openai_compatible: true }` → запись создана.
     - `GET /api/team/admin/keys` → тестовый провайдер виден в списке.
     - Cleanup: удаление тестовой записи.
   - **Тест 2: Пресеты провайдеров.**
     - `GET /api/team/admin/presets` → ответ содержит `deepseek`, `groq`, `perplexity`, `openrouter`, `ollama_cloud`.
   - **Тест 3: Системная LLM — чтение и запись.**
     - `GET /api/team/admin/system-llm` → возвращает `{ provider, model, budgetUsd }`.
     - `PUT /api/team/admin/system-llm` с новыми значениями → 200.
     - `GET /api/team/admin/system-llm` → значения обновились.
     - Восстановить исходные значения.
   - **Тест 4: Биллинг с фильтрами.**
     - `GET /api/team/admin/billing/summary?from=2020-01-01&to=2030-01-01` → возвращает `{ total_usd, total_rub, by_agent, by_model, by_function, by_day }`, все массивы.
     - `GET /api/team/admin/billing/summary?from=2020-01-01&to=2020-01-02` → `total_usd = 0` (пустой период).
   - **Тест 5: NotebookLM-мониторинг.**
     - `GET /api/team/admin/notebooklm/status` → возвращает `{ status }` (одно из `green/yellow/red/unknown`).
   - Лог на русском, summary: «Тесты п.1: 5/5 пройдено».
   - `npm run test:p1`.

2. **Проверь пересечения с Сессией 12 (agent_id в team_api_calls):**
   - Убедись, что записи с `agent_id` корректно агрегируются в `billing/summary?group_by=agent`.
   - Убедись, что записи с `system_function` (Сессия 49) корректно агрегируются отдельно.

3. **Проверь пересечения с Сессией 44 (batch):**
   - Batch-задачи (`source = 'batch'`) корректно отображаются в биллинге с правильной стоимостью (×0.5).

4. **Проверь пересечения с Сессией 22 (автономность):**
   - Расходы на самозадачи (`source = 'autonomy'`) видны отдельной строкой в расширенном биллинге.

5. **Удали тестовые данные** — метод `cleanupTestData()` в конце скрипта.

**Что делать после сессии:**

1. Запустить `npm run test:p1` — 5/5 тестов пройдено.
2. Полный end-to-end этапа 7:
   - Добавить DeepSeek → поставить задачу на DeepSeek → результат ✓.
   - Сменить Системную LLM на другую модель → поставить задачу с парсером обратной связи → расход записался с `system_function` ✓.
   - В биллинге → выбрать «30 дней» → график по дням + таблица по агентам + рубли ✓.
   - NotebookLM → индикатор показывает текущий статус ✓.
3. Закоммитить, push, деплой.

**Критерии готовности:**

- `npm run test:p1` — 5/5 пройдено.
- Универсальный адаптер: DeepSeek/Groq/Perplexity работают через UI без изменения кода.
- Системная LLM: переключение модели через UI, все системные функции используют выбранную модель.
- Биллинг: селектор периода, график по дням, таблицы по агентам/моделям/функциям, рубли — всё работает.
- NotebookLM: индикатор heartbeat + кнопка теста.
- Пересечения с batch, автономностью и agent_id корректны.
- Никаких регрессий во всех предыдущих 50 сессиях.
