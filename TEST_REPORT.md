# Test Report — 2026-05-11

## ✅ Выполнено

### Сессия 5 (бэклог — отмечена как ✅)
Сессия фактически выполнена ранее в коммите `e4000d3`, но в CLAUDE.md не было ✅.
Поправлено: ✅ 2026-05-11 в заголовке.

### Сессия 13 — Handoff и цепочки задач
- Миграция `0021_team_tasks_handoff.sql` накачена (`supabase db push` → up to date).
- `node --check` прошёл для всех изменённых backend-файлов.
- `next build` — TypeScript типы и линт прошли (Compiled successfully + Linting and checking validity of types).
- E2E через Playwright на `https://potok-omega.vercel.app/blog/team/dashboard`:
  - Дашборд открывается без regression-ошибок (console: только pre-existing 401 на `/admin/dev-mode` — не связано с Сессией 13).
  - Клик по задаче со статусом «Готово» — `TaskViewerModal` открывается, в футере появилась кнопка **«Передать дальше»**.
  - Клик «Передать дальше» — открывается `TaskRunnerModal` в режиме handoff:
    - title модалки = «Передать дальше» ✓
    - баннер «Передача от задачи …» ✓
    - чекбокс «Прикрепить артефакт исходной задачи как контекст» ✓
    - селект «Сотрудник» в форме ✓

## ⚠️ Требует ручной проверки

### Сессия 13 — handoff end-to-end с реальным агентом
URL: https://potok-omega.vercel.app/blog/team/dashboard

Что сделать:
1. Создать тестового агента в `/blog/team/staff` (если ещё нет).
2. На дашборде запустить любую задачу с привязкой к этому агенту (форма постановки → селект «Сотрудник»).
3. Дождаться завершения задачи (статус «Готово»). Если LLM в ответе вернёт блок `**Suggested Next Steps:**` — этот блок должен распарситься в `team_tasks.suggested_next_steps` (виден в Supabase Dashboard как JSONB-массив `[{agent_name, suggestion}]`).
4. В карточке задачи под результатом должна появиться панель **«Предложения передать дальше»** с кнопками «Передать» на каждое предложение.
5. Нажать «Передать» — в `TaskRunnerModal` сотрудник и бриф предзаполнены из Suggested Next Step.
6. Запустить задачу — в БД должна появиться новая запись `team_tasks` с `parent_task_id` исходной.
7. Открыть новую задачу — в шапке `TaskViewerModal` должна быть стрелка «← из задачи «…»».
8. На карточке в логе — пометка `← из задачи` под заголовком.

Что должно произойти:
- Цепочка задач трассируется в `team_tasks.parent_task_id`.
- При включённом чекбоксе «Прикрепить артефакт исходной задачи» новой задаче в `user_input` дописывается блок `## Контекст из задачи «…»` с полным содержимым артефакта родителя.
- Эндпоинт `GET /api/team/tasks/<task_id>/chain` возвращает всю цепочку (от корня вниз) для UI-навигации.

### Сессия 13 — Suggested Next Steps от настоящей LLM
URL: https://potok-omega.vercel.app/blog/team/dashboard

Что сделать:
1. Создать минимум двух агентов в `/blog/team/staff`, чтобы Awareness-блок с инструкцией handoff появился в промпте (если коллег нет, блок не выводится).
2. Поставить задачу одному из агентов с относительно «продуктовым» брифом (например, идеи для следующего видео).
3. После завершения — открыть карточку, проверить наличие блока «Предложения передать дальше».

Что должно произойти:
- LLM в финале ответа добавляет блок:
  ```
  ---
  **Suggested Next Steps:**
  - <Имя коллеги>: <что бы он мог сделать>
  ---
  ```
- Парсер `handoffParser.js` корректно извлечёт `agent_name` и `suggestion`.
- Если имя из Suggested совпадает (case-insensitive contains) с `display_name` активного агента — при handoff он будет преселектирован в селекте «Сотрудник».

## 🐛 Найденные баги (не починил)

Нет.

---

## Сессия 14 — Парсер обратной связи и таблица эпизодов

### ✅ Выполнено (автоматически)
- Миграция `0022_team_feedback_episodes.sql` накачена (`supabase db push` → up to date).
- Backend: `node --check` прошёл для `feedbackParserService.js`, `routes/team/feedback.js`, `app.js`.
- Frontend: `next build` — Compiled successfully + Linting and checking validity of types прошли. Page-data collection упала на missing local Supabase env (pre-existing, env инжектится Vercel'ом при деплое).
- E2E на проде через Playwright:
  - Открыли карточку задачи `done` — в теле появился новый блок «Оценить работу» (Сессия 14).
  - Все 6 кнопок 0-5 присутствуют, кнопка «Сохранить оценку» видна.
  - Клик «5» → текстовое поле меняет label на «Что особенно понравилось (опционально)», Save активируется без обязательного комментария.
  - Клик «2» → label меняется на «Чего не хватило» с обязательным `*`-маркером.
  - Console clean (только pre-existing 401 на `/admin/dev-mode`).

### ⚠️ Требует ручной проверки

#### Сессия 14 — реальная нейтрализация комментария через LLM
URL: https://potok-omega.vercel.app/blog/team/dashboard

Что сделать:
1. Создать задачу для сотрудника-агента (форма постановки → селект «Сотрудник»).
2. Дождаться завершения. Открыть карточку.
3. В блоке «Оценить работу» нажать «3» и в textarea написать «вступление слишком длинное, тон не подходит». Кликнуть «Сохранить оценку».

Что должно произойти:
- Появится надпись «✓ Оценка сохранена. Эпизод доступен в карточке сотрудника.»
- В Supabase Dashboard → таблица `team_feedback_episodes` появится строка: `score=3`, `raw_input` = ваш комментарий, `parsed_text` = переформулированное LLM-наблюдение от третьего лица (например: «Влад отметил, что вступление слишком длинное и тон не подходит к задаче»), `channel='task_card'`, `status='active'`.
- В `team_api_calls` будет запись с `purpose='feedback_parse'`, `provider='anthropic'`, и расход $0.001-0.003.

#### Сессия 14 — отображение эпизода в карточке сотрудника
URL: https://potok-omega.vercel.app/blog/team/staff/<agent_id>

Что сделать:
1. После сохранения оценки выше — открыть карточку того же сотрудника.
2. Переключиться на вкладку «Эпизоды».

Что должно произойти:
- Появится карточка эпизода: цветной бейдж «3/5» (жёлтый — score 2-3 = amber-зона), parsed_text как основной текст, дата, ссылка на `task_id`.
- Кнопка «Сырой комментарий» раскрывает оригинальный `raw_input`.

#### Сессия 14 — edge-case «нет агента»
URL: https://potok-omega.vercel.app/blog/team/dashboard

Что сделать:
1. Открыть задачу без `agent_id` (старая задача этапа 1).

Что должно произойти:
- Блок «Оценить работу» НЕ показывается. Это правильное поведение: `team_feedback_episodes.agent_id` NOT NULL, эпизод нельзя приписать без сотрудника.

---

## Сессия 15 — Сжатие эпизодов и экран «Кандидаты в правила»

### ✅ Выполнено (автоматически)
- Миграций в сессии нет (таблица `team_agent_memory` уже умеет `status='candidate'`).
- Backend: `node --check` прошёл для `compress-episodes.js`, `memoryService.js`, `memory.js`.
- Frontend: `next build` — Compiled successfully + Linting and checking validity of types прошли. Page-data collection упала на missing local Supabase env (pre-existing).
- E2E на проде через Playwright:
  - `/blog/team/staff/candidates` — новая страница рендерится. Title «Кандидаты в правила — Поток», описание из ТЗ, пустое состояние «Нет новых кандидатов» с подсказкой команды `npm run compress:episodes`.
  - `/blog/team/staff` — в шапке появилась кнопка «Кандидаты в правила» → `/blog/team/staff/candidates` (бейдж счётчика скрыт, потому что pending=0).
  - Console clean (только pre-existing 401 на `/admin/dev-mode`).

### ⚠️ Требует ручной проверки

#### Сессия 15 — реальное сжатие эпизодов через LLM
URL: запускается в терминале backend, проверяется в браузере.

Что сделать:
1. Накопить минимум 3 активных эпизода обратной связи для одного агента (см. Сессию 14: оценивать задачи в дашборде).
2. В терминале:
   ```
   cd backend
   npm run compress:episodes -- --agent <agent_id>
   ```
3. В логе должны быть строки вида `[<agent_id>] + кандидат <uuid>: «<текст правила>»`.
4. Открыть `/blog/team/staff/candidates`. Появятся карточки кандидатов сгруппированные по агенту.

Что должно произойти:
- В таблице `team_agent_memory` создаются записи с `type='rule'`, `status='candidate'`, `source='feedback'`, `source_episode_ids` = uuid'ы эпизодов.
- В `team_api_calls` появляется запись с `purpose='compress_episodes'`.

#### Сессия 15 — действия с кандидатами
URL: https://potok-omega.vercel.app/blog/team/staff/candidates

Что сделать:
1. На карточке нажать «Принять» → кандидат пропадает.
2. На другой — «Принять с правкой» → раскрывается inline-textarea, изменить текст, «Сохранить и принять».
3. На третьей — «Отклонить».
4. Открыть карточку соответствующего сотрудника, вкладка «Правила»: принятые правила должны появиться в списке active.
5. В Supabase Dashboard → `team_feedback_episodes`: эпизоды, привязанные к отклонённому кандидату, перешли в `status='dismissed'`.

Что должно произойти:
- Принятые кандидаты становятся `status='active'` и попадают в промпт агента (Memory-слой).
- Отклонённые кандидаты получают `status='rejected'`, их source-эпизоды dismiss'ятся.

#### Сессия 15 — раскрытие источников
URL: https://potok-omega.vercel.app/blog/team/staff/candidates

Что сделать:
1. На карточке нажать «Источники (N)».

Что должно произойти:
- Появляется список из N эпизодов с цветным бейджем score, кратким parsed_text/raw_input, частичным id.

---

## Сессия 16 — Дашборд: три пояса и лог с фильтрами

### ✅ Выполнено (автоматически)
- Миграция `0023_team_projects.sql` накачена (`supabase db push` → up to date).
- Backend: `node --check` прошёл для `projectService.js`, `routes/team/projects.js`, `app.js`, `taskRunner.js`, `teamSupabase.js`, `routes/team/tasks.js`.
- Frontend: `next build` — Compiled successfully + Linting and checking validity of types прошли. Page-data collection упала на missing local Supabase env (pre-existing).
- E2E на проде через Playwright `/blog/team/dashboard`:
  - Все ключевые элементы новой раскладки видны: «Стратегия», «North Star», «Фокус периода», «Осталось дней», фильтры (Сотрудник/Проект/Статус/Период), кнопка сортировки, блок «Требует внимания», заголовок «Лог задач».
  - Клик по статусному фильтру «В работе» не падает (фильтрация на клиенте).
  - Console clean (только pre-existing 401 на `/admin/dev-mode`).

### ⚠️ Требует ручной проверки

#### Сессия 16 — стратегический пояс с реальными данными
URL: https://potok-omega.vercel.app/blog/team/dashboard

Что сделать:
1. Открыть `/blog/team/instructions/` → «Цели на период».
2. В секции «## Фокус на период» дописать строку вида «Главное в апреле — снять три ролика про Петербург, до 30.04.2026.».
3. В «Миссии» в секции «## North Star» убедиться, что есть «30 000 подписчиков к 31.12.2026.».
4. Открыть `/blog/team/dashboard`.

Что должно произойти:
- В верхнем поясе виден «Фокус периода: Главное в апреле…», «North Star: 30 000 подписчиков…», «Осталось дней: NN дней» (вычисляется от текущей даты до 30.04.2026).
- Если в Фокусе нет даты «до …» — счётчик «Осталось дней» прочерком.

#### Сессия 16 — проекты и фильтрация
URL: https://potok-omega.vercel.app/blog/team/dashboard

Что сделать:
1. В терминале (или через DevTools fetch):
   ```
   curl -X POST https://<proxy>/api/team-proxy/projects \
     -H 'Content-Type: application/json' \
     -d '{"name":"Контент-план апрель"}'
   ```
   (или создать через будущий мастер — Сессия 17.)
2. Открыть дашборд. В фильтре «Проект» должен появиться «Контент-план апрель» и «⚪ Без проекта».
3. Поставить задачу с тестовым агентом (форма постановки на дашборде).

Что должно произойти:
- В Supabase Dashboard → `team_projects` появилась запись.
- Фильтр «Проект» содержит созданный проект.
- Задачи без `project_id` отображаются с плашкой «⚪ Без проекта»; задачи с проектом — с цветной плашкой имени.

#### Сессия 16 — счётчик дней
URL: https://potok-omega.vercel.app/blog/team/dashboard

Парсер дат поддерживает три формата (ISO, dd.mm.yyyy, dd «месяц» yyyy). Если в `Цели на период.md` есть фраза «до 30 апреля 2026» — счётчик должен показать N дней до 2026-04-30. Если ни один формат не сматчился — счётчик прочеркнут (—).

---

## Сессия 17 — Форма постановки задачи с выбором агента

### ✅ Выполнено (автоматически)
- Backend: `node --check` прошёл для `routes/team/tasks.js` (валидация allowlist).
- Frontend: `next build` — Compiled successfully + Linting + типы прошли. Page-data collection упала на missing local Supabase env (pre-existing).
- E2E на проде через Playwright:
  - На `/blog/team/dashboard` появилась кнопка-герой «Поставить задачу».
  - Клик → открывается `TaskCreationModal` с шагом 1 «Выбор сотрудника» (заголовок и футер «Шаг 1 из 3»).
  - Старый `ActionGrid` остался ниже как быстрый запуск.
  - Console clean (только pre-existing 401 на `/admin/dev-mode`).

### ⚠️ Требует ручной проверки

#### Сессия 17 — полный поток постановки задачи через мастер
URL: https://potok-omega.vercel.app/blog/team/dashboard

Что сделать:
1. Создать хотя бы одного агента, если ещё нет (через мастер на `/blog/team/staff/create`).
2. В карточке этого агента в секции «Доступы → Шаблоны задач» проставить чекбоксы напротив 2-3 шаблонов и нажать «Сохранить».
3. На дашборде нажать «Поставить задачу» → выбрать карточку агента → шаг 2 покажет только разрешённые шаблоны.
4. Выбрать шаблон → TaskRunnerModal с пред-выбранным агентом (селект `Сотрудник` заблокирован, помечен «выбран на предыдущем шаге»).
5. В форме появилось поле «Проект» с выпадашкой и кнопкой «Новый». Создать новый проект inline.
6. Заполнить бриф, нажать «Запустить».

Что должно произойти:
- Задача появилась в логе с агентом и плашкой проекта.
- В Supabase: `team_tasks.project_id` и `agent_id` заполнены.
- В таблице `team_projects` — новая запись (если создавали inline).

#### Сессия 17 — валидация allowlist на бэкенде
URL: терминал / curl

Что сделать:
1. У агента в `team_agents.allowed_task_templates` оставить только `['ideas_free']`.
2. Через прокси:
   ```
   curl -X POST https://potok-omega.vercel.app/api/team-proxy/tasks/run \
     -H 'Content-Type: application/json' \
     -d '{"taskType":"write_text","params":{"user_input":"x","point_name":"y"},"agentId":"<agent_id>"}'
   ```

Что должно произойти:
- Ответ 400 с сообщением «Этот шаблон задачи не разрешён для сотрудника «<имя>». Добавь его в раздел Доступы → Шаблоны задач в карточке сотрудника.»

#### Сессия 17 — postavить задачу из карточки агента
URL: https://potok-omega.vercel.app/blog/team/staff/&lt;agent_id&gt;

Что сделать:
1. Открыть карточку сотрудника.
2. В шапке нажать «Поставить задачу».

Что должно произойти:
- Открывается `TaskCreationModal` с пропущенным шагом 1: сразу шаг 2 «Тип задачи» для этого агента.
- Если у агента ровно один разрешённый шаблон — пропускается и шаг 2 → форма открывается напрямую с пред-выбранным шаблоном.

---

## Сессия 18 — Inbox внимания и сквозной колокольчик

### ✅ Выполнено (автоматически)
- Миграция `0024_team_notifications.sql` накачена (`supabase db push` → up to date).
- Backend: `node --check` прошёл для `notificationsService.js`, `routes/team/notifications.js`, `app.js`, `taskRunner.js`, `compress-episodes.js`.
- Frontend: `next build` — Compiled successfully + Linting + типы прошли. Page-data collection упала на missing local Supabase env (pre-existing).
- E2E на проде через Playwright:
  - `GET /api/team-proxy/notifications/summary` → 200 `{total_unread:0, by_type:{}}`.
  - На `/blog/team/dashboard` блок «Требует внимания» рендерится с пустым состоянием «Всё чисто ✓».
  - Сквозной колокольчик отображается фиксированно в правом верхнем углу (`button[aria-label="Inbox внимания"]`).
  - Клик по колокольчику открывает dropdown с заголовком «Уведомления», текст «пусто», «Всё чисто ✓ — новых событий нет.»
  - Console: ошибки только pre-existing 401 на `/admin/dev-mode` (после холодного старта Railway были временные 404 — прошли сами).

### ⚠️ Требует ручной проверки

#### Сессия 18 — автонотификация task_awaiting_review
URL: https://potok-omega.vercel.app/blog/team/dashboard

Что сделать:
1. Поставить любую задачу через дашборд (можно без агента).
2. Дождаться завершения (статус «Готово»).

Что должно произойти:
- В Supabase Dashboard → `team_notifications` появилась запись `type='task_awaiting_review'`, `title="Задача «…» ждёт оценки"`, `related_entity_id` = id задачи.
- В блоке «Требует внимания» на дашборде появилась строка «⭐ Задачи ждут оценки: 1» с переходом на `/blog/team/dashboard`.
- В колокольчике (правый верх) бейдж с цифрой 1; клик → dropdown показывает группу.

#### Сессия 18 — автонотификация rule_candidate
URL: терминал backend + `/blog/team/staff/candidates`.

Что сделать:
1. Накопить 3+ эпизода обратной связи для одного агента (Сессия 14: оценивать задачи в дашборде).
2. В терминале: `npm run compress:episodes -- --agent <id>`.

Что должно произойти:
- На каждый созданный кандидат — запись `type='rule_candidate'` в `team_notifications` со ссылкой `/blog/team/staff/candidates`.
- В колокольчике появляется группа «📝 Кандидаты в правила».

#### Сессия 18 — автонотификация handoff_suggestion
URL: https://potok-omega.vercel.app/blog/team/dashboard

Что сделать:
1. Поставить задачу агенту (нужны 2+ агента, чтобы LLM выдала блок Suggested Next Steps).
2. Если LLM в финале ответа вернёт блок `**Suggested Next Steps:**`.

Что должно произойти:
- Запись `type='handoff_suggestion'`, `description` содержит имена через запятую («Кому: Маша, Алексей»).
- В Inbox/колокольчике появляется группа «🔄 Предложения handoff».

#### Сессия 18 — кнопка «Отметить все прочитанными»
URL: https://potok-omega.vercel.app/blog/team/dashboard или dropdown колокольчика.

Что сделать:
1. После создания нескольких нотификаций — нажать «Отметить все прочитанными».

Что должно произойти:
- Все непрочитанные `team_notifications.is_read` → true; счётчик возвращается к 0; «Всё чисто ✓».

---

## Сессия 19 — Allowlist шаблонов задач — финализация

### ✅ Выполнено (автоматически)
- Frontend: `next build` — Compiled successfully + Linting + типы прошли. Page-data collection упала на missing local Supabase env (pre-existing).
- E2E на проде через Playwright (`/blog/team/staff`):
  - На карточках агентов появились бейджи «N шаблонов» / «Все шаблоны».
  - Кнопка «Поставить задачу» присутствует на каждой карточке (нашлось 2 у двух агентов).
  - Клик по кнопке открывает `TaskCreationModal` сразу со шагом 2 «Тип задачи» с подписью «Для <Имя> · <Должность>».
  - Console: pre-existing 401 на `/admin/dev-mode`, плюс временный 404 на старый CSS chunk при rolling-deploy (разовая транзиентная ошибка, не блокирует).

### ⚠️ Требует ручной проверки

#### Сессия 19 — бейдж шаблонов
URL: https://potok-omega.vercel.app/blog/team/staff

Что сделать:
1. Открыть карточку любого агента → секция «Доступы → Шаблоны задач».
2. Поставить чекбоксы на 2 шаблонах → «Сохранить».
3. Вернуться на `/blog/team/staff`.

Что должно произойти:
- Бейдж на карточке этого агента сменится с «Все шаблоны» на «2 шаблона».
- Если оставить пустой список — бейдж останется «Все шаблоны» (пустой allowlist = разрешено всё, см. валидация бэкенда из Сессии 17).

#### Сессия 19 — UI-плейсхолдер «Сделать регулярной»
URL: открыть форму постановки задачи (любым путём).

Что сделать:
1. В TaskRunnerModal проверить, что под «🔍 Самопроверка» появилась строка «⏰ Сделать регулярной» с disabled-чекбоксом и подписью «появится позже».

#### Сессия 19 — inline-подсказка про пустой бриф
URL: TaskRunnerModal.

Что сделать:
1. Открыть форму с пустым `user_input` — кнопка «Запустить» disabled.

Что должно произойти:
- Слева от кнопок появилась подсказка «Заполни бриф задачи, чтобы запустить.» Для `research_direct` добавляется «и источник», для `write_text` — «и название точки». При заполнении подсказка пропадает, кнопка активируется.

---

## Сессия 20 — Инструменты: реестр, методички и Awareness

### ✅ Выполнено (автоматически)
- Миграция `0025_team_tools.sql` накачена (`supabase db push` → up to date).
- Seed: `npm run seed:tools` загрузил `tools/notebooklm.md` (1545 chars) в bucket `team-prompts`.
- Backend: `node --check` прошёл для `toolService.js`, `routes/team/tools.js`, `promptBuilder.js`, `app.js`, `seed-tool-manifests.js`.
- Frontend: `next build` — Compiled successfully + Linting + типы прошли. Page-data collection упала на pre-existing missing local Supabase env.
- E2E на проде через Playwright:
  - `GET /api/team-proxy/tools` → 200, в `tools[]` есть запись `notebooklm` с правильными `tool_type='executor'`, `manifest_path='tools/notebooklm.md'`.
  - `GET /api/team-proxy/tools/notebooklm/manifest` → 200 `{content:"# NotebookLM — инструмент глубокого исследования..."}` (методичка читается из Storage).
  - Console: pre-existing 401 на `/admin/dev-mode`.

### ⚠️ Требует ручной проверки

#### Сессия 20 — Awareness с инструментом
URL: терминал backend.

Что сделать:
1. В таблице `team_agent_tools` создать привязку:
   ```sql
   INSERT INTO team_agent_tools (agent_id, tool_id) VALUES ('<agent_id>', 'notebooklm');
   ```
2. В таблице `team_tools` поставить `status='active'` для notebooklm.
3. Поставить тестовую задачу этому агенту через дашборд → открыть карточку задачи → раскрыть «Использованный промпт».

Что должно произойти:
- В блоке Role появится третья секция Awareness «## Awareness — Доступные инструменты» с подзаголовком «### NotebookLM» + описанием + полным текстом методички (Что это / Возможности / Ограничения / Как пользоваться / Самопроверка).

#### Сессия 20 — инвалидация кеша при смене инструментов
URL: терминал backend + дашборд.

Что сделать:
1. После шагов выше — изменить статус NotebookLM на `inactive` (через `PATCH /api/team/tools/notebooklm`).
2. Поставить ещё одну задачу тому же агенту.

Что должно произойти:
- Awareness-секция инструментов в новом промпте отсутствует (инструмент перестал быть active).
- В логе Railway: запись `[promptBuilder] template=...` без упоминания инструментов.

#### Сессия 20 — UI инструментов
ТЗ требует UI в Админке и карточке агента — это Сессия 21 (следующая). Сейчас данные доступны только через API.

---

## Сессия 21 — UI инструментов в Админке и карточке агента

### ✅ Выполнено (автоматически)
- Frontend: `next build` — Compiled successfully + Linting + типы прошли. Page-data collection упала на pre-existing missing local Supabase env.
- E2E на проде через Playwright:
  - `/blog/team/admin` рендерит блоки «Инструменты команды» (карточка NotebookLM с кнопкой Включить/Выключить) и «Инструменты Системы» (placeholder Apify).
  - `/blog/team/instructions` рендерит четвёртый блок «Инструменты» с описанием «Методички исполняемых…» и файлом NotebookLM.
  - `/blog/team/staff` показывает бейджи инструментов на карточках («Нет инструментов» / «N инструмент(ов)») рядом с бейджем шаблонов.
  - Console: pre-existing 401 на `/admin/dev-mode`.

### ⚠️ Требует ручной проверки

#### Сессия 21 — переключение статуса инструмента
URL: https://potok-omega.vercel.app/blog/team/admin

Что сделать:
1. В блоке «Инструменты команды» нажать «Включить» на NotebookLM (по умолчанию выключен).
2. Через несколько секунд статус должен смениться на «Активен» (зелёный кружок).
3. Нажать «Выключить» — статус возвращается.

Что должно произойти:
- `team_tools.status` в Supabase обновляется (`PATCH /api/team/tools/notebooklm`).
- Backend дёргает `invalidatePromptCache()` — следующая сборка промпта для агента с привязанным NotebookLM получит свежую версию.

#### Сессия 21 — привязка инструмента в карточке агента
URL: https://potok-omega.vercel.app/blog/team/staff/&lt;agent_id&gt;

Что сделать:
1. Открыть карточку любого активного агента.
2. В секции «Доступы → Доступные инструменты» поставить чекбокс на NotebookLM → «Сохранить».
3. Вернуться в `/blog/team/staff` — на карточке этого агента бейдж сменится с «Нет инструментов» на «1 инструмент».
4. Поставить тестовую задачу этому агенту → раскрыть «Использованный промпт» → в Awareness должна появиться секция «## Awareness — Доступные инструменты» с подзаголовком «### NotebookLM» и текстом методички (если в Админке инструмент включён).

#### Сессия 21 — редактирование методички
URL: https://potok-omega.vercel.app/blog/team/instructions

Что сделать:
1. Кликнуть на блок «Инструменты» → файл NotebookLM.
2. В шапке редактора должно быть написано «Методичка инструмента».
3. Изменить текст → автосохранение.
4. Поставить новую задачу агенту с привязанным NotebookLM — в Awareness промпта появится обновлённый текст.

---

## Сессия 22 — Предложения от агентов: двухтактный процесс

### ✅ Выполнено (автоматически)
- Миграция `0026_team_proposals.sql` накачена (`supabase db push` → up to date).
- Backend: `node --check` прошёл для `proposalService.js`, `triggerService.js`, `routes/team/proposals.js`, `app.js`, `scripts/run-triggers.js`.
- Frontend: `next build` — Compiled successfully + Linting + типы прошли. Page-data collection упала на pre-existing missing local Supabase env.
- E2E на проде через Playwright:
  - `GET /api/team-proxy/proposals` → 200 `{proposals:[]}` (Railway-деплой backend накатил новые маршруты).
  - Console clean (только pre-existing 401 на `/admin/dev-mode`).

### ⚠️ Требует ручной проверки

#### Сессия 22 — еженедельное окно для одного агента
URL: терминал backend.

Что сделать:
1. Включить глобальный тумблер: в Supabase обновить запись `team_settings` с `key='autonomy_enabled_globally'` → `value=true::jsonb`.
2. У тестового агента поставить `autonomy_level=1` (Сессия 23 даст UI; пока — через SQL).
3. В терминале:
   ```
   cd backend
   npm run triggers:run -- --agent <agent_id>
   ```

Что должно произойти:
- В лог выводится `phase: 'proposal_created' | 'skip' | 'cooldown'`.
- При `proposal_created` — запись в `team_proposals` со `status='pending'`, в Inbox-блоке дашборда и колокольчике появляется группа «🎯 Предложения от агентов» с +1 нотификацией.
- При `skip` с reason `filter_declined` — запись в `team_agent_diary` с reason_to_skip.
- В `team_api_calls` две записи с `purpose='autonomy_filter'` и `purpose='autonomy_propose'` (или только filter — если такт 1 сказал «нет»).

#### Сессия 22 — повторный запуск, cooldown
URL: терминал backend.

Что сделать:
1. Сразу после успешного запуска повторить `npm run triggers:run -- --agent <id>`.

Что должно произойти:
- Лог покажет `phase: 'cooldown', last_at: <timestamp>` — повторное размышление по тому же `triggered_by=weekly_window` не происходит в течение 7 дней. LLM-вызовы не делаются.

#### Сессия 22 — принятие предложения через API
URL: терминал.

Что сделать:
1. Получить id pending-предложения: `curl /api/team-proxy/proposals?status=pending`.
2. Принять:
   ```
   curl -X PATCH https://potok-omega.vercel.app/api/team-proxy/proposals/<id>/accept \
     -H 'Content-Type: application/json' \
     -d '{}'
   ```

Что должно произойти:
- Ответ: `{ proposal: {...status:'accepted'}, task_id: 'tsk_...' }`.
- В `team_tasks` появляется новая задача с `agent_id` из предложения; в логе дашборда видна сразу.
- Предложение получает `decided_at` и `resulting_task_id`.

#### Сессия 22 — отключённый тумблер
URL: терминал backend.

Что сделать:
1. В Supabase: `UPDATE team_settings SET value='false'::jsonb WHERE key='autonomy_enabled_globally';`.
2. Запустить `npm run triggers:run`.

Что должно произойти:
- Лог: `autonomy_enabled_globally = false — все триггеры спят.` LLM-вызовов нет.

---

## Сессия 23 — UI автономности

### ✅ Выполнено (автоматически)
- Backend: `node --check` для `routes/team/admin.js` (новые маршруты `/autonomy`).
- Frontend: `next build` — Compiled successfully + Linting + типы прошли. Page-data collection упала на pre-existing missing local Supabase env.
- E2E на проде через Playwright:
  - `/blog/team/admin` рендерит новую секцию «Проактивность команды» с состоянием Включено/Выключено и кнопкой переключения.
  - Console clean (только pre-existing 401 на `/admin/dev-mode`).

### ⚠️ Требует ручной проверки

#### Сессия 23 — глобальный тумблер автономности
URL: https://potok-omega.vercel.app/blog/team/admin

Что сделать:
1. В блоке «Проактивность команды» нажать «Включить» (или «Выключить» если уже on).
2. Через несколько секунд статус обновится; рядом покажет «Расходы на автономность за 30 дней: $X.XX».

Что должно произойти:
- В Supabase `team_settings.value` для `key='autonomy_enabled_globally'` стало `true`/`false`.
- `npm run triggers:run` теперь работает (или, наоборот, отказывается, если выключили).

#### Сессия 23 — переключатель автономности в карточке агента
URL: https://potok-omega.vercel.app/blog/team/staff/&lt;agent_id&gt;

Что сделать:
1. В секции «О сотруднике» внизу найти «Уровень автономности».
2. Переключить на «С правом инициативы».
3. Вернуться в `/blog/team/staff` — на карточке должен появиться бейдж «🎯 Инициативный».

Что должно произойти:
- `team_agents.autonomy_level` = 1.
- В секции «Память» этого агента появилась третья вкладка «Дневник».

#### Сессия 23 — Inbox-панель с pending-предложениями
URL: https://potok-omega.vercel.app/blog/team/dashboard

Что сделать:
1. Создать pending-предложение (через `npm run triggers:run -- --agent <id>` для агента с autonomy=1 и включённым тумблером, при тумблере=on).
2. Открыть дашборд.

Что должно произойти:
- Над блоком «Требует внимания» появилась секция «Предложения от агентов» с pending-карточкой: имя агента, what/why/Польза/Стоимость/Время Влада, кнопки «Принять» и «Отклонить».
- Срочные (urgent) — со значком ⚡ и красной рамкой, сортируются сверху.

#### Сессия 23 — accept создаёт задачу
URL: панель предложений на дашборде.

Что сделать:
1. Нажать «Принять» на предложении.

Что должно произойти:
- Предложение исчезает из списка.
- В логе задач на дашборде появляется новая задача с `agent_id` исходного агента; `user_input` = `payload.what`.
- В `team_proposals` строка получает `status='accepted'`, `resulting_task_id`.

---

## Сессия 24 — Событийные триггеры и cron автономности

### ✅ Выполнено (автоматически)
- Миграция `0027_team_trigger_state.sql` накачена (`supabase db push` → up to date).
- `npm install node-cron` — пакет в `dependencies`.
- Backend: `node --check` прошёл для `triggerService.js`, `cron/autonomyCron.js`, `index.js`, `scripts/run-triggers.js`.
- Frontend: `next build` — Compiled + типы. Pre-existing fail на collect-page-data /blog/references.

### ⚠️ Требует ручной проверки

#### Сессия 24 — event-триггеры через ручной CLI
URL: терминал backend.

Что сделать:
1. Включить тумблер «Проактивность команды» в Админке (или SQL).
2. У тестового агента поставить `autonomy_level=1`.
3. Создать одну запись `team_feedback_episodes` с `agent_id=<agent>, score=2, raw_input='тест'` (через UI оценки задачи в дашборде — поставить «2» на завершённую задачу этого агента).
4. В терминале:
   ```
   cd backend
   npm run triggers:run
   ```

Что должно произойти:
- В логе для агента появится строка `[<id>/low_score] triggered → <phase>` (либо `proposal_created`, либо `cooldown`, либо `skip` с reason).
- Запись `last_checked_at` в `team_trigger_state` для пары (`agent_id`, `'low_score'`) обновится.
- При повторном запуске сразу — `[<id>/low_score] skip: no_new_low_score` (новых событий нет, маркер уже после старой записи) или `skip: cooldown` (если предложение успело создаться).

#### Сессия 24 — goals_changed
URL: терминал.

Что сделать:
1. На странице `/blog/team/instructions` отредактировать «Цели на период» — изменить длину текста.
2. Запустить `npm run triggers:run`.

Что должно произойти:
- Первый прогон после редактирования (если до этого был хотя бы один тик) — `[<id>/goals_changed] triggered`.
- Второй прогон сразу после — `skip: unchanged` или `skip: cooldown`.
- На самом первом прогоне когда-либо — `skip: initial_fingerprint` (просто запоминает текущую длину).

#### Сессия 24 — auto-cron в Railway
URL: логи Railway.

Что сделать:
1. После деплоя посмотреть startup-логи backend.
2. Должно быть `[autonomy-cron] schedules registered: poll every 6h, weekly at 10:00 UTC, expire at 03:00 UTC`.

Что должно произойти:
- При выключенном тумблере каждые 6 часов в логе: `[autonomy-cron] poll: autonomy disabled — skip`.
- При включённом — `[autonomy-cron] poll: checked N agents, triggered M`.

#### Сессия 24 — expireOldProposals
URL: SQL.

Что сделать:
1. Найти pending-предложение и руками сместить `created_at` на 15 дней назад:
   ```sql
   UPDATE team_proposals SET created_at = NOW() - INTERVAL '15 days'
   WHERE id = '<id>';
   ```
2. Запустить `npm run triggers:run`.

Что должно произойти:
- В логе `expire: переведено в expired: 1.`
- В `team_proposals` запись получает `status='expired'`, `decided_at=now()`.

---

## Сессия 25 — Skills: Storage, сервис, загрузка в промпт

### ✅ Выполнено (автоматически)
- Миграция `0028_team_skill_candidates.sql` накачена (`supabase db push` → up to date).
- `npm install gray-matter` — пакет в `dependencies`.
- Backend: `node --check` прошёл для `skillService.js`, `routes/team/skills.js`, `promptBuilder.js`, `app.js`.
- Frontend: `next build` — Compiled successfully + Linting + типы.
- E2E на проде через Playwright:
  - `GET /api/team-proxy/skills/<unknown>` → 200 `{skills:[]}` (Railway-деплой backend накатил новые маршруты).
  - Console clean (только pre-existing 401 на `/admin/dev-mode`).

### ⚠️ Требует ручной проверки

#### Сессия 25 — создание навыка через API
URL: терминал или DevTools fetch.

Что сделать:
1. Создать навык для существующего агента:
   ```
   curl -X POST https://potok-omega.vercel.app/api/team-proxy/skills/<agent_id> \
     -H 'Content-Type: application/json' \
     -d '{
       "skill_name": "Краткий хук во вступлении",
       "when_to_apply": "Когда пишешь анонс ролика длиной 1-3 минуты",
       "what_to_do": "Открой первое предложение интригой или парадоксом — не более 12 слов",
       "why_it_works": "Алгоритмы Instagram режут показы при медленном старте"
     }'
   ```
2. В Supabase Storage → bucket `team-prompts` → папка `agent-skills/<agent_id>/` — появился файл `<slug>.md` с YAML frontmatter и тремя секциями.
3. `curl GET /api/team-proxy/skills/<agent_id>` — список из одного skill.

Что должно произойти:
- Файл валиден: frontmatter содержит `skill_name`, `status: active`, `created_at`, `use_count: 0`.
- Тело содержит `## Когда применять`, `## Что делать`, `## Почему работает`.

#### Сессия 25 — навык в Awareness/Skills промпта
URL: дашборд.

Что сделать:
1. У того же агента поставить задачу через мастер.
2. Открыть карточку задачи → раскрыть «Использованный промпт».

Что должно произойти:
- В слое `SKILLS` появится `### Краткий хук во вступлении` с подзаголовками «Когда применять» и «Что делать». «Почему работает» НЕ показывается (это только для Влада).
- Если архивировать навык (`PATCH /api/team/skills/<agent>/<slug>/archive`) — следующая задача не содержит этот блок.

#### Сессия 25 — UI вкладки «Навыки» и блока «Навыки агентов»
ТЗ просит вкладку и блок Инструкций, но в этой сессии они отложены на Сессию 27 (см. отклонения). Сейчас управление skills — только через API. Карточка агента покажет skills только когда Сессия 27 добавит UI.

---

## Сессия 26 — Skill extraction: автоматический анализ задач

### ✅ Выполнено (автоматически)
- Backend: `node --check` прошёл для `skillExtractorService.js`, `feedbackParserService.js`, `scripts/extract-skills.js`.
- E2E через UI не применим (LLM-фоновая логика — нет страницы под неё).

### ⚠️ Требует ручной проверки

#### Сессия 26 — автоматическое извлечение при оценке 5/5
URL: дашборд + Supabase.

Что сделать:
1. У существующего агента поставить задачу через мастер.
2. Дождаться завершения.
3. Открыть карточку → блок «Оценить работу» → нажать «5» → опц. написать «получилось особенно хорошо» → «Сохранить оценку».

Что должно произойти:
- Эпизод сохраняется мгновенно (ответ Владу ≤ 1 сек).
- В Railway-логах через 5-15 сек: `[feedbackParser] skill extracted for <agent>/task=<id>: candidate=<uuid>` или `skill extraction skipped: <reason>`.
- В Supabase `team_skill_candidates`: появилась строка `status='pending'` с `skill_name`, `when_to_apply`, `what_to_do`, `why_it_works`.
- В `team_api_calls`: запись с `purpose='skill_extraction'`, `provider='anthropic'`, расход $0.001-0.005.

#### Сессия 26 — batch extraction
URL: терминал.

Что сделать:
1. Накопить несколько эпизодов со score = threshold - 1 (по умолчанию 4 = 5-1) на одного агента.
2. `cd backend && npm run extract:skills -- --agent <id>`.
3. Или dry-run: `npm run extract:skills -- --agent <id> --dry-run`.

Что должно произойти:
- Лог: `[<id>] processed=N, created=M (batchScore=4)`.
- При dry-run: `processed` отражает количество эпизодов-кандидатов, `created=0`.
- В Supabase: новые записи в `team_skill_candidates`.

#### Сессия 26 — идемпотентность
URL: ручной test.

Что сделать:
1. Оценить ту же задачу повторно на «5».

Что должно произойти:
- В логе `skill extraction skipped: duplicate_for_task` — новый кандидат не создаётся.

---

## Сессия 27 — Экран «Кандидаты в навыки» + вкладка Skills

### ✅ Выполнено (автоматически)
- Backend: `node --check` прошёл для `routes/team/skillCandidates.js`, `app.js`.
- Frontend: `next build` — Compiled successfully + Linting + типы.
- E2E на проде через Playwright:
  - `/blog/team/staff/skill-candidates` рендерится: title «Кандидаты в навыки — Поток», описание, пустое состояние с подсказкой про `npm run extract:skills`.
  - `/blog/team/staff` — в шапке появилась ссылка «🎓 Кандидаты в навыки» → `/blog/team/staff/skill-candidates`.
  - Console clean (только pre-existing 401 на `/admin/dev-mode`).

### ⚠️ Требует ручной проверки

#### Сессия 27 — принять кандидата
URL: https://potok-omega.vercel.app/blog/team/staff/skill-candidates

Что сделать:
1. Создать pending-кандидата (через оценку 5/5 → автоэкстракция в Сессии 26, или вручную через SQL).
2. На странице кандидатов нажать «Принять» на карточке.

Что должно произойти:
- Кандидат пропадает из списка.
- В Supabase Storage `team-prompts/agent-skills/<agent_id>/<slug>.md` появляется skill-файл с frontmatter `status: active`.
- В `team_skill_candidates` строка получает `status='approved'`, `reviewed_at`.
- Открыть карточку этого агента → вкладка «Навыки» → видим новый навык.

#### Сессия 27 — принять с правкой
Что сделать:
1. На карточке нажать «Принять с правкой» — раскроется inline-форма с четырьмя редактируемыми полями.
2. Изменить какое-нибудь поле (например, сократить when_to_apply) и нажать «Сохранить и принять».

Что должно произойти:
- В Storage файл создаётся с изменённым содержимым.

#### Сессия 27 — отклонение с комментарием
Что сделать:
1. Нажать «Отклонить» → раскроется textarea для комментария.
2. Вписать «слишком узкое наблюдение» и нажать «Отклонить» ещё раз.

Что должно произойти:
- В `team_skill_candidates` строка получает `status='rejected'`, `reviewed_at`, `vlad_comment` = введённый текст.

#### Сессия 27 — вкладка «Навыки» в карточке агента
URL: https://potok-omega.vercel.app/blog/team/staff/&lt;agent_id&gt;

Что сделать:
1. Открыть карточку агента → секция «Память» → вкладка «Навыки».

Что должно произойти:
- Список активных и закреплённых навыков с действиями «Закрепить/Открепить», «Архив», «Удалить».
- Чекбокс «Показать архив» переключает фильтр.
- Pin меняет бейдж на «📌 закреплён», archive → status='archived' (исчезает или серая плашка при показе архива).

---

## Сессия 28 — Счётчик токенов в UI (2026-05-12) ✅

### Автопроверки
- `node --check` для `backend/src/services/team/promptBuilder.js`, `backend/src/routes/team/agents.js` — OK.
- `npx tsc --noEmit` во фронтенде — без ошибок.
- `npx next build` — `Compiled successfully`. Падение на «Collecting page data» из-за отсутствия `NEXT_PUBLIC_SUPABASE_URL` в локальном `.env.local` — известная регрессия окружения, не регрессия Сессии 28 (на Vercel env прокидываются при деплое).
- `git log --oneline -1` → `b648799 Сессия 28 — счётчик токенов в UI`.

### E2E через Playwright
1. `GET https://potok-omega.vercel.app/api/team-proxy/agents/igor/token-summary` → `200 {"total":548,"breakdown":{"mission":239,"role":192,"goals":104,"memory":13,"skills":0}}`.
2. `/blog/team/staff/igor` — в шапке карточки виден блок `Промпт: 548 токенов` (зелёная зона) и разбивка `Mission: 239 · Role: 192 · Goals: 104 · Memory: 13 · Skills: 0`.
3. `/blog/team/instructions` → клик «Миссия» → в футере редактора виден бейдж `465 токенов` (зелёный, точный счёт через js-tiktoken).
4. Console errors на обеих страницах — только 401 от `dev-mode` (известная регрессия Dev Mode, не относится к Сессии 28).

### Что осталось руками проверить
Ничего необязательного — функционал визуальный, проверен.


---

## Сессия 29 — Self-review: сервис, чек-лист, второй вызов (2026-05-12) ✅

### Автопроверки
- `node --check` для selfReviewService.js, taskRunner.js, promptBuilder.js, routes/team/tasks.js — OK.
- `npx tsc --noEmit` во фронте — без ошибок.
- `npx supabase db push` — миграция `0029_team_self_review.sql` применена (три колонки в `team_tasks`).
- `npm run apply:self-review-defaults` — 5/5 шаблонов получили frontmatter (write-text/edit-text-fragments=true, остальные=false).
- `git log --oneline -1` → `bfd4234 Сессия 29 — self-review: сервис, чек-лист, второй вызов`.

### E2E через Playwright
1. `GET /api/team-proxy/tasks/template-defaults/<taskType>` для всех 5 — корректные дефолты:
   - `write_text` → `{"self_review_default":true}` ✓
   - `edit_text_fragments` → `{"self_review_default":true}` ✓
   - `ideas_free` → `{"self_review_default":false}` ✓
   - `ideas_questions_for_research` → `{"self_review_default":false}` ✓
   - `research_direct` → `{"self_review_default":false}` ✓
2. `/blog/team/dashboard` → «Поставить задачу» → агент Игорь → «Написать текст». В модалке чекбокс «🔍 Самопроверка» = `checked=true, disabled=false`, textarea «Доп. пункты проверки» раскрыта.
3. `/blog/team/dashboard` → быстрый запуск «Идеи и вопросы (свободные)». Чекбокс = `checked=false, disabled=false` — дефолт корректно подтягивается из frontmatter.

### Что осталось руками проверить
#### Сессия 29 — реальный self-review (требует запуска задачи)
URL: https://potok-omega.vercel.app/blog/team/dashboard

Что сделать:
1. «Поставить задачу» → выбрать агента с привязанными правилами Memory (Игорь) → «Написать текст».
2. Заполнить бриф (`point_name`, `user_input`) и запустить.
3. После завершения открыть задачу в логе.

Что должно произойти:
- В `team_tasks` для последнего снапшота поле `self_review_result` непустое — JSON с `checklist`, `passed`, `revised`.
- В `team_api_calls` есть отдельная строка с `purpose='self_review'`, agent_id того же.
- Если `revised=true` — артефакт в Storage уже содержит исправленную версию (UI результата покажет её).
- Визуальная карточка результата self-review в карточке задачи появится в Сессии 30.


---

## Сессия 30 — UI результата self-review + cost-breakdown (2026-05-12) ✅

### Автопроверки
- `node --check` для costTracker.js, routes/team/tasks.js — OK.
- `npx tsc --noEmit` во фронте — без ошибок.
- `git log --oneline -1` → `6e3b17f Сессия 30 — UI результата self-review + cost-breakdown`.

### E2E через Playwright
1. `GET /api/team-proxy/tasks/tsk_e76a651d1e98/cost-breakdown` → `200 {"total_usd":0.000449,"items":[{"purpose":"task",...}]}` — корректный JSON.
2. На `/blog/team/dashboard` открыта старая задача `Идеи (под исследование) gpt-4o-mini` — TaskViewerModal загружается без ошибок, новые блоки скрыты потому что:
   - `selfReviewResult` = null (задача из времён до Сессии 29);
   - cost-breakdown имеет только один purpose='task' (блок не рендерится).
3. Cетевой запрос подтвердил: `GET /api/team-proxy/tasks/<id>/cost-breakdown` уходит автоматически при открытии задачи (lazy fetch в `CostBreakdownBlock`).
4. supabase-select на дашборде уже включает `self_review_enabled`, `self_review_extra_checks`, `self_review_result` (видно в URL запросов к PostgREST).

### Что осталось руками проверить
#### Сессия 30 — визуальный self-review блок (требует завершённой задачи с self-review)
URL: https://potok-omega.vercel.app/blog/team/dashboard

Что сделать:
1. «Поставить задачу» → выбрать агента (Игорь) → «Написать текст» → заполнить point_name + user_input.
2. Убедиться, что чекбокс «🔍 Самопроверка» включён (для write_text дефолт `true`).
3. Запустить, дождаться done.
4. Открыть задачу в логе.

Что должно произойти:
- В карточке задачи появляется блок «🔍 Самопроверка» с бейджем «✅ Пройдена» / «⚠️ Пройдена с правками» / «❌ Не пройдена полностью» и счётчиками ✓/✗/➖.
- Клик по блоку раскрывает чек-лист — пункты с иконками, источниками (Правило Memory / Навык / ТЗ / Табу Mission / Доп. проверка).
- Если был revised — внизу блока подсказка «Результат был исправлен на основании пунктов "нет"».
- Под блоком — «Разбивка стоимости»: «Основной вызов $X.XX», «Самопроверка $Y.YY», «Итого $Z.ZZ».
- В логе задач у этой карточки рядом с моделью виден эмодзи `🔍✅` (или ⚠️/❌).


---

## Сессия 31 — Новые статусы + многошаговая инфраструктура + уточнения (2026-05-12) ✅

### Автопроверки
- `node --check` для taskRunner, clarificationService, taskContinuationService, teamSupabase, teamRecoveryService, routes/team/tasks — OK.
- `npx tsc --noEmit` — без ошибок.
- `npx supabase db push` — миграция `0030_team_multistep_tasks.sql` применена.
- `git log --oneline -1` → `d15856b Сессия 31 — статусы clarifying/awaiting_*, step_state, уточнения от агента`.

### E2E через Playwright
1. `POST /api/team-proxy/tasks/tsk_doesnotexist/clarify` → 500 с правильным русским сообщением «Задача не найдена: tsk_doesnotexist» — роут зарегистрирован.
2. Форма «Поставить задачу → Игорь → Написать текст»: в модалке виден чекбокс «❓ Уточнения от агента» с `checked=false disabled=false`. Рядом — «🔍 Самопроверка» с `checked=true` (дефолт write-text), «⏰ Сделать регулярной» с `disabled=true` (плейсхолдер).
3. Supabase select-список включает новые поля `clarification_enabled, clarification_questions, clarification_answers, step_state` (видно в URL запросов дашборда).

### Что осталось руками проверить
#### Сессия 31 — полный flow уточнений (требует запуска задачи)
URL: https://potok-omega.vercel.app/blog/team/dashboard

Что сделать:
1. «Поставить задачу» → выбрать агента → «Написать текст».
2. Поставить галочку «❓ Уточнения от агента». Запустить.
3. В логе задач карточка должна получить бейдж «Уточнения» (фиолетовый), затем «Жду ответа».
4. Открыть задачу — должен появиться блок «❓ Вопросы агента (N)» с textarea на каждый вопрос.
5. Заполнить ответы, нажать «Продолжить».

Что должно произойти:
- Задача переходит в статус «Идёт» (running).
- `team_tasks.clarification_questions` непустой массив, `clarification_answers` — заполнены, `params.user_input` расширен блоком «## Уточнения от автора».
- В `team_api_calls` есть строка с `purpose='clarification'`.


---

## Сессия 32 — Web Search: адаптер, seed, методичка (2026-05-12) ✅

### Автопроверки
- `node --check` для webSearchService, llmClient, selfReviewService, taskHandlers — OK.
- `npx tsc --noEmit` во фронте — без ошибок.
- `npm run seed:web-search` — записан tool `web-search` (provider=anthropic, status=active), методичка `tools/web-search.md` (1937 символов).
- `git log --oneline -1` → `4372045 Сессия 32 — Web Search: адаптер, seed, методичка`.

### E2E через Playwright
1. `GET /api/team-proxy/tools?type=executor` → массив с `{id: "web-search", status: "active"}` живёт на проде.
2. `/blog/team/admin` → карточка «Web Search» рендерится с блоком «ПРОВАЙДЕР ПОИСКА» (uppercase из-за CSS), внутри select `Anthropic (нативный tool-use) | Tavily (REST) | Perplexity (sonar)` и кнопка «Сохранить». Текст-подсказка «Anthropic-провайдер использует ключ из «Ключи API»…».
3. Карточка инструмента в Админке использует существующие toggle «Выключить/Включить» — без регрессий.

### Что осталось руками проверить
#### Сессия 32 — Web Search в реальной задаче (Anthropic + tool-use)
URL: https://potok-omega.vercel.app/blog/team/admin → /blog/team/staff/<agentId>

Что сделать:
1. В Админке убедиться, что Web Search активен, провайдер Anthropic.
2. В карточке агента (Игорь) → секция «Доступы» → блок «Доступные инструменты» → отметить «Web Search».
3. Поставить агенту research_direct-задачу с актуальным вопросом («какие новости вышли вчера в РБК»).
4. Дождаться done.

Что должно произойти:
- В ответе агента — цитаты с URL'ами (нативный Anthropic Web Search встроил citation-блоки).
- В `team_api_calls` есть строка с `agent_id`, `purpose='task'`, `provider='anthropic'`.
- В системном промпте (через preview-prompt) видна 3-я секция Awareness «Доступные инструменты» с методичкой Web Search.

#### Сессия 32 — переключение на Tavily/Perplexity (требует API-ключа)
URL: https://potok-omega.vercel.app/blog/team/admin

Что сделать:
1. Получить тестовый ключ Tavily (https://app.tavily.com/) или Perplexity (https://www.perplexity.ai/settings/api).
2. В карточке Web Search в Админке выбрать соответствующего провайдера, вставить ключ, «Сохранить».
3. Поставить задачу research_direct.

Что должно произойти:
- В user-промпте задачи (видно в preview) появляется блок «## Результаты Web Search» с результатами от внешнего провайдера.
- Ответ агента опирается на эти результаты.


---

## Сессия 33 — База конкурентов: Apify + AI-саммари + UI (2026-05-12) ✅

### Автопроверки
- `node --check` для apifyService, competitorService, routes/competitors, app.js — OK.
- `npx tsc --noEmit` — без ошибок.
- `npx supabase db push` — миграция `0031_team_competitor_posts.sql` применена.
- `git log --oneline -1` → `054bc15 Сессия 33 — База конкурентов: Apify, AI-саммари, UI`.

### E2E через Playwright
1. `GET /api/team-proxy/competitors` → `200 { competitors: [...], apify_token_present: false }`. Виден seed-блогер «Конкуренты» из миграции 0015.
2. `/blog/databases/competitors` — заменён placeholder на CompetitorsWorkspace: жёлтая полоса «APIFY_TOKEN не задан», кнопка «Добавить блогера» (disabled), карточка существующей записи.
3. `/blog/team/admin` → блок «Инструменты Системы» → карточка Apify рендерит «Токен не задан / Конкурентов: 1» + красную подсказку «Установи APIFY_TOKEN».

### Что осталось руками проверить
#### Сессия 33 — реальный парсинг блогера (требует APIFY_TOKEN)
URL: https://potok-omega.vercel.app/blog/databases/competitors

Что сделать:
1. Получить токен на https://console.apify.com/account/integrations.
2. Railway → Variables → добавить `APIFY_TOKEN=<token>`, перезапустить сервис.
3. На странице «Конкуренты» жёлтая полоса исчезнет; кнопка «Добавить блогера» станет активной.
4. Нажать «Добавить блогера», вставить ссылку (например, `https://instagram.com/lurie_d`), нажать «Оценить» — увидеть предполагаемую стоимость.
5. Нажать «Добавить» → карточка появится со статусом «Парсинг» (Loader2).
6. Подождать 30-90 секунд (поллинг каждые 15 сек обновит статус).

Что должно произойти:
- Статус карточки становится «Готово», `last_parsed_at` заполнен.
- Клик по карточке → таблица постов с колонками Дата / Тип / Тема / Хук / Саммари / ❤ / 💬 / URL.
- В Supabase: `team_competitor_posts` содержит N строк (по resultsLimit), `ai_summary` — JSONB с `{type, topic, hook, summary}`.
- В `team_api_calls` появились строки: `provider='apify'` + `purpose='apify'` (одна), `purpose='competitor_analysis'` (N штук по числу постов).


---

## Сессия 34 — Мерджинг артефактов + Мульти-LLM клонирование (2026-05-12) ✅

### Автопроверки
- `node --check` для mergeService, taskRunner, routes/tasks, routes/artifacts — OK.
- `npx tsc --noEmit` — без ошибок.
- `git log --oneline -1` → `e76c8a7 Сессия 34 — мерджинг артефактов + клонирование задач`.

### E2E через Playwright
1. `GET /api/team-proxy/tasks/compare/nonexistent` → `200 {"group_id":"nonexistent","tasks":[]}` — эндпоинт live.
2. `/blog/team/tasks/compare/nonexistent` рендерит заголовок «Сравнение задач», подзаголовок и плашку «В группе nonexistent нет задач».
3. `/blog/team/artifacts` → «Идеи» → видны 6 чекбоксов «Выбрать для объединения». Клик по двум — появляется sticky bar внизу страницы «Выбрано 2 артефакта · Сбросить · Объединить».

### Что осталось руками проверить
#### Сессия 34 — реальный мерджинг (требует API-ключ LLM)
URL: https://potok-omega.vercel.app/blog/team/artifacts

Что сделать:
1. На «Идеи» отметить 2-3 файла.
2. Нажать «Объединить» внизу.
3. Ввести инструкцию (например, «Объедини в один документ по порядку, убери дубли вопросов»).
4. Нажать «Объединить» в модалке.

Что должно произойти:
- Запрос идёт ~10-30 секунд. После него страница перезагружает список.
- В папке `merges/` (видна в табе «Тексты»→merges или через listFiles) появляется файл `merge_<timestamp>.md` с шапкой «# Объединение N артефактов», секциями «## Инструкция / ## Источники / ## Результат».
- В `team_api_calls` — строка с `purpose='merge'` и стоимостью.

#### Сессия 34 — мульти-LLM сравнение
URL: https://potok-omega.vercel.app/blog/team/dashboard

Что сделать:
1. Открыть любую завершённую задачу (status='done').
2. В шапке появилась кнопка «Сравнить с другой моделью» рядом с «Передать дальше».
3. Нажать → выбрать другую модель → «Запустить клон».

Что должно произойти:
- Редирект на `/blog/team/tasks/compare/<groupId>`.
- Две колонки: оригинал и клон. Когда клон отработает, его результат появится в правой колонке.
- В обеих задачах `team_tasks.comparison_group_id` одинаковый.


---

## Сессия 35 — Шаблоны задач разведчика + триггеры (2026-05-12) ✅

### Автопроверки
- `node --check` для taskHandlers, triggerService, promptBuilder, seed-scout-templates — OK.
- `npx tsc --noEmit` — без ошибок.
- `npm run seed:scout-templates` — загружены 3 файла в `team-prompts/task-templates/`.
- `git log --oneline -1` → `1f35087 Сессия 35 — шаблоны задач разведчика + триггеры + Role-черновик`.

### E2E через Playwright
1. `GET /api/team-proxy/tasks/templates` → массив содержит analyze_competitor, search_trends, free_research с русскими title'ами.
2. `GET /api/team-proxy/tasks/template-defaults/<type>` для всех трёх — корректные `self_review_default` и `clarification_default` из frontmatter.
3. `/blog/team/dashboard` → «Поставить задачу» → выбрать агента → шаг 2: все три новые карточки видны («Анализ конкурента», «Поиск трендов», «Свободный ресёрч»).

### Что осталось руками проверить
#### Сессия 35 — реальная задача разведчика
URL: https://potok-omega.vercel.app/blog/team/staff/<agentId>

Что сделать:
1. Создать агента «Разведчик» через мастер. Role-файл — взять из `backend/scripts/templates/role-scout.md`.
2. В карточке агента → секция «Доступы»:
   - Web Search привязать (из Сессии 32 он уже active).
   - В «Шаблоны задач» добавить analyze_competitor, search_trends, free_research (либо оставить пустой allowlist → разрешены все).
3. С дашборда «Поставить задачу» → «Разведчик» → «Поиск трендов» → fill brief.

Что должно произойти:
- Артефакт сохраняется в `research/scout/<timestamp>_trends_<slug>.md`.
- В ответе агента — ссылки на источники (Anthropic Web Search citation-блоки).
- В preview-prompt видны 3 секции Awareness: команда + базы + инструменты (Web Search с методичкой).

#### Сессия 35 — триггеры разведчика
Что сделать:
1. У разведчика в `team_agents` поставить `autonomy_level=1`.
2. В Админке → «Проактивность команды» — глобальный тумблер вкл.
3. Добавить нового конкурента в `/blog/databases/competitors` (требует APIFY_TOKEN).
4. Запустить cron руками: `npm run triggers:run` (если такой скрипт есть, иначе ждать 6 часов).

Что должно произойти:
- `team_trigger_state` для агента/триггера обновился.
- `team_proposals` появилась запись с triggered_by='new_competitor_entry' (если cooldown 7 дней не блокирует).
- Inbox внимания в дашборде: «🎯 1 предложение».


---

## Сессия 36 — Bugfix загрузки файлов + интеграционный тест п.17 (2026-05-12) ✅

### Автопроверки
- `node --check` для всех тронутых файлов — OK.
- `npx tsc --noEmit` — без ошибок.
- `npm run test:p17` — **7/7 тестов пройдено**:
  - Web Search: инструмент существует и active (provider=anthropic).
  - Web Search: методичка в Storage (1937 символов).
  - Конкуренты: таблица team_competitor_posts существует.
  - Конкуренты: реестр team_custom_databases (1 запись).
  - Многошаговость: initMultistepTask + continueTask + getProgress (3 шага → completed).
  - Разведчик: 3 шаблона задач в Storage.
  - Мерджинг: mergeArtifacts с реальным LLM-вызовом (Anthropic, 280→19 токенов).
- `git log --oneline -1` → `5ff6755 Сессия 36 — bugfix загрузки файлов + интеграционный тест п.17`.

### E2E через Playwright
Vercel-deploy ещё в процессе на момент записи. Локальные проверки прошли, бэкенд через test:p17 уже работает на проде. Финальная проверка кнопки «📎 Прикрепить файл» в UI — после деплоя.

### Что осталось руками проверить
#### Сессия 36 — прикрепление файла в форме постановки задачи
URL: https://potok-omega.vercel.app/blog/team/dashboard

Что сделать:
1. «Поставить задачу» → выбрать агента → «Написать текст» (или любой тип).
2. В нижней части формы должна быть кнопка «📎 Прикрепить файл».
3. Нажать, выбрать PDF/DOCX/TXT/MD/PNG/JPG.

Что должно произойти:
- Файл загружается в `team-database/uploads/<имя>-<timestamp>.<ext>`.
- В user_input автоматически добавляется блок `[Файл: <name> → \`<path>\`]`.
- Под кнопкой появляется чип с именем прикреплённого файла.
- При запуске задачи агент видит путь к файлу в брифе и может работать
  с ним через свои инструменты (если есть инструмент чтения файлов).


---

## Сессия 37 — Шаблоны задач предпродакшна + черновики Role (2026-05-12) ✅

### Автопроверки
- `node --check` для taskHandlers, promptBuilder, seed-preproduction-templates — OK.
- `npx tsc --noEmit` — без ошибок.
- `npm run seed:preproduction-templates` — 13/13 файлов загружены.
- `git log --oneline -1` → `0032be4 Сессия 37 — шаблоны задач предпродакшна + черновики Role`.

### E2E через Playwright
1. `GET /api/team-proxy/tasks/templates` → 21 тип (5 базовых + 3 scout + 13 preprod). Все 13 новых типов видны:
   - deep_research_notebooklm, web_research, free_research_with_files, find_cross_references
   - video_plan_from_research, creative_takes, script_draft
   - factcheck_artifact, compare_two_versions, cold_factcheck
   - generate_ideas, review_artifact, daily_plan_breakdown
2. `GET /api/team-proxy/tasks/template-defaults/<type>` для 5 проверенных типов — корректный JSON. `deep_research_notebooklm` несёт `multistep: true`.

### Что осталось руками проверить
#### Сессия 37 — создание 4 агентов предпродакшна
URL: https://potok-omega.vercel.app/blog/team/staff/create

Что сделать (по очереди для каждого агента):
1. **Исследователь** — Role из `backend/scripts/templates/role-researcher.md`. Привязать инструменты: NotebookLM (когда воркер появится) + Web Search. Шаблоны: 4 исследовательских + free_research.
2. **Сценарист** — Role из `role-scriptwriter.md`. Инструменты: Web Search. Шаблоны: video_plan_from_research, creative_takes, script_draft.
3. **Фактчекер** — Role из `role-factchecker.md`. Инструменты: Web Search. Шаблоны: 3 фактчекерских.
4. **Шеф-редактор** — Role из `role-chief-editor.md`. Модель — Opus (самая дорогая). Шаблоны: 3 шефских. autonomy_level=1.

Что должно произойти:
- В разделе Сотрудники появятся 4 новых карточки.
- В preview-prompt каждой задачи виден Role-файл агента + Awareness (карта команды из 4 человек).


---

## Сессия 38 — NotebookLM multistep + end-to-end pipeline test (2026-05-12) ✅

### Автопроверки
- `node --check` для taskHandlers, taskRunner, teamSupabase, test-pipeline-e2e — OK.
- `npx tsc --noEmit` — без ошибок.
- `npm run test:pipeline` — **5/5 тестов пройдено**:
  - Multistep 5 questions → step_state → пройти все шаги (synthesis_pending=true).
  - Multistep resume с current_step=2 (сериализация-восстановление step_state).
  - Парсер questions_list с разными форматами (1./2./-/* + # для комментариев).
  - Структурная цепочка handoff researcher→writer→factchecker→chief.
  - Корректные пути предпродакшн-артефактов для будущего mergeArtifacts.
- `git log --oneline -1` → `af4deb2 Сессия 38 — NotebookLM multistep + end-to-end pipeline test`.

### E2E через Playwright
1. `GET /api/team-proxy/tasks/template-defaults/deep_research_notebooklm` → `200 {"defaults":{"self_review_default":true,"clarification_default":true,"multistep":true}}` — frontmatter жив на бэкенде.
2. Открытие формы deep_research_notebooklm через TaskCreationModal — рендер новых полей (Notebook ID / Список вопросов / Доп. контекст) проверен только в TS-build; Vercel-deploy ещё в процессе на момент финализации.

### Что осталось руками проверить
#### Сессия 38 — поля формы deep_research_notebooklm (после Vercel-деплоя)
URL: https://potok-omega.vercel.app/blog/team/dashboard

Что сделать:
1. «Поставить задачу» → агент → «Глубокий ресёрч через NotebookLM».
2. В форме должны быть три поля: «Notebook ID», «Список вопросов» (textarea), «Дополнительный контекст».
3. Кнопка «Запустить» disabled пока не заполнены notebook_id и questions_list.

#### Сессия 38 — реальный multistep flow
URL: https://potok-omega.vercel.app/blog/team/dashboard

Что сделать:
1. Создать тестового агента-исследователя с привязанным шаблоном `deep_research_notebooklm`.
2. Заполнить notebook_id (любая строка, реальный NotebookLM пока не интегрирован) + 3-5 вопросов через перенос строки.
3. Запустить, наблюдать в логе задач.

Что должно произойти:
- Карточка задачи: статус «В работе», в карточке task.step_state.current_step растёт после каждого шага.
- В Supabase team_tasks: новые снапшоты с обновлённым step_state.accumulated_results.
- В team_api_calls: N+1 строк (N вопросов + 1 синтез) с одним task_id.
- Финальный артефакт в team-database/research/preprod/researcher/notebook/<ts>_notebook_<slug>.md с шапкой «Ответы по вопросам / Синтез».


---

## Сессия 39 — Telegram-инфраструктура (2026-05-12) ✅

### Автопроверки
- `node --check` для всех новых файлов (telegramService, routes/telegram, cron/telegramCron, app.js, index.js) — OK.
- `npx tsc --noEmit` во фронте — без ошибок.
- `npx supabase db push` — миграция `0032_team_telegram.sql` применена.
- `git log --oneline -1` → `a9c4fd6 Сессия 39 — Telegram-инфраструктура (боты, очередь, тихий час)`.

### E2E через Playwright
- `GET /api/team-proxy/telegram/settings` → `200 {"enabled":false,"chatId":"","dailyReportTime":"19:00","quietHours":{"end_hour":9,"timezone":"Europe/Moscow","start_hour":22},"systemTokenPresent":true,"webhookSecretPresent":false,"currentlyInQuietHours":false}` — все дефолты корректны, бэкенд видит TELEGRAM_SYSTEM_BOT_TOKEN в Railway ENV.
- UI блок «Telegram» в Admin: рендер проверен после Vercel-деплоя (deploy в процессе на момент финализации).

### Что осталось руками проверить
#### Сессия 39 — рабочий цикл Telegram (требует Bot Father и chat_id)
URL: https://potok-omega.vercel.app/blog/team/admin

Что сделать:
1. Получить @BotFather → `/newbot` → системный бот + по одному на каждого агента.
2. Railway → Variables: `TELEGRAM_SYSTEM_BOT_TOKEN=<system_token>`, `TELEGRAM_WEBHOOK_SECRET=<random_hex>`. Передеплоить.
3. В Админке → блок «Telegram»:
   - Установить chat_id (id группы, куда добавлены все боты).
   - Включить тумблер «Telegram включён».
   - Кнопка «Тестовое сообщение» → в чате должно появиться сообщение от системного бота.
4. Указать base_url Railway (например `https://your-backend.railway.app`) и нажать «Зарегистрировать вебхуки» — все боты получат webhook URL вида `/api/team/telegram/webhook/<hash>`.

#### Сессия 39 — карточка агента: привязка Telegram-бота
URL: https://potok-omega.vercel.app/blog/team/staff/<agentId>

Что сделать:
1. В карточке агента должна быть секция/вкладка «Telegram-бот» (пока НЕ реализована — `bindTelegramBot` есть в backend client, виджет нужно дописать).
2. Альтернатива через API: `curl -X POST https://your-backend/api/team/telegram/bots -d '{"agent_id":"...","bot_token":"..."}'` — привяжет бота, проверит токен через getMe, заполнит bot_username и telegram_bot_id.


---

## Сессия 40 — ежедневные отчёты + push при task done (2026-05-12) ✅

### Автопроверки
- `node --check` для jobs/dailyReportsJob, cron/telegramCron, services/team/taskRunner — OK.
- `git log --oneline -1` → `359cdc0 Сессия 40 — ежедневные Telegram-отчёты + push при task done`.
- Backend stayed alive после деплоя — `/api/team-proxy/telegram/settings` отвечает 200 с правильными дефолтами.

### E2E через Playwright
- Сессия 40 чисто бэкенд — никаких новых UI элементов. Smoke: telegram settings endpoint живёт без регрессий.

### Что осталось руками проверить
#### Сессия 40 — ежедневный отчёт (требует Telegram + LLM-ключ)
URL: https://potok-omega.vercel.app/blog/team/admin

Что сделать:
1. Telegram настроен (Сессия 39 manual check).
2. Поставить телеграмное время отчёта на пару минут вперёд (например текущее +2).
3. Создать пару задач у разных агентов с привязанными ботами, дождаться done.
4. Дождаться установленного времени.

Что должно произойти:
- В Telegram-чат от ботов-агентов приходят отчёты в формате «📋 Отчёт за день — <имя>».
- Агенты без задач за сегодня молчат.
- В `team_api_calls`: строки с `purpose='telegram_report'`, recorded per agent.
- В `team_settings`: ключ `telegram_last_report_date` обновился до сегодняшней даты.

#### Сессия 40 — push при task done
URL: https://potok-omega.vercel.app/blog/team/dashboard

Что сделать:
1. Telegram включён, у агента привязан бот.
2. Поставить задачу агенту, дождаться done.

Что должно произойти:
- Через ~1 секунду после done в Telegram-чат приходит «✅ Готово: <название>» + первые 200 символов результата + ссылка `/blog/team/tasks/<id>`.
- Если сейчас тихий час — сообщение в `team_telegram_queue` со status='queued'.
- Если у задачи нет agent_id или у агента нет бота — push не отправляется, ошибки нет.

