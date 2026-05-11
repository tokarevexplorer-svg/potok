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
