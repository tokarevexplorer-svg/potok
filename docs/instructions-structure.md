# Структура bucket'а `team-prompts`

Сессия 4 этапа 2 развела bucket `team-prompts` на три логические папки. Это
описание текущего состояния и ссылки на пункты roadmap (`Claude_team_stage2.MD`),
которые её доопределяют.

```
team-prompts/
├── strategy/
│   ├── mission.md          (расширение содержимого — пункт 5, этап 1)
│   ├── goals.md            (расширение содержимого — пункт 5, этап 1)
│   └── author-profile.md   (опционально, пункт 9, этап 2)
├── roles/
│   └── <agent>.md          (пункт 12, этап 2)
├── task-templates/
│   ├── ideas-questions.md
│   ├── ideas-free.md
│   ├── research-direct.md
│   ├── write-text.md
│   └── edit-text-fragments.md
├── agent-skills/           (пункт 10, этап 4)
│   └── <agent>/<skill>.md
└── tools/                  (пункт 16, этап 3)
    └── <tool>.md
```

Все имена в Storage — латиница со слэшем и дефисом. Supabase Storage отбивает
ключи с пробелами и кириллицей (`Invalid key`), поэтому человекочитаемые
лейблы (Миссия, Цели на период, Свободные идеи и т.д.) живут только в UI —
в маппинге `FILE_LABELS` в `frontend/src/components/blog/team/InstructionsWorkspace.tsx`.

## История переезда (Сессия 4)

До Сессии 4 содержимое жило в двух bucket'ах:

- `team-database/context.md` → миссия команды.
- `team-database/concept.md` → цели на период.
- `team-prompts/ideas-free.md`, `ideas-questions.md`, `research-direct.md`,
  `write-text.md`, `edit-text-fragments.md` — пять шаблонов задач в корне.

Скрипт `backend/scripts/migrate-instructions.js`:

1. Чистит кириллические пути в `team-prompts` (страховка после первой
   неудачной попытки миграции — Supabase отбил `Стратегия команды/Миссия.md`
   с `Invalid key`).
2. Копирует `context.md` / `concept.md` в `team-prompts/strategy/mission.md`
   и `…/strategy/goals.md`.
3. Переносит пять шаблонов из корня в `task-templates/` (имена не меняются,
   только папка).

Скрипт идемпотентный — повторный запуск пропускает уже переехавшие файлы.

Оригиналы `context.md` / `concept.md` в bucket `team-database` остаются как
backup и **должны быть удалены вручную** через Supabase Dashboard после
проверки прода. См. чеклист «Что делать после сессии» в Сессии 4.

## Где это используется в коде

- `backend/src/services/team/promptBuilder.js` — читает `strategy/mission.md`
  и `strategy/goals.md` (с алиасами `{{context}}` / `{{concept}}` для
  backward compat) и кладёт их в `cacheableBlocks` под ключами
  `mission` / `goals`.
- `backend/src/services/team/taskHandlers.js` — `taskTemplateName(taskType)`
  возвращает путь вида `task-templates/<slug>.md`; при отсутствии нового
  файла `buildTaskPrompt` падает на старый плоский путь в корне и пишет
  предупреждение (страховка на случай, если на прод ещё не накатили
  миграцию).
- `backend/src/routes/team/instructions.js` — эндпоинт
  `GET /api/team/instructions/list` возвращает структуру для UI:
  `{ strategy: ["mission", "goals"], roles: [], templates: [...] }`.
- `frontend/src/components/blog/team/InstructionsWorkspace.tsx` — главная
  страница раздела «Инструкции», три блока (Стратегия команды / Должностные
  инструкции / Шаблоны задач) с редактором markdown. Лейблы файлов рендерит
  `displayLabel(slug)` через `FILE_LABELS`.
