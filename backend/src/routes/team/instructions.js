// Эндпоинты раздела «Инструкции» (Сессия 4 этапа 2).
//
// Сейчас единственный эндпоинт — список содержимого трёх логических папок
// bucket'а team-prompts: strategy/, roles/, task-templates/. Фронт
// (`/blog/team/instructions/`) делает один запрос и рендерит три блока с
// кликабельными файлами; русские лейблы («Стратегия команды» и т.п.) живут
// только в UI — в Storage всё на латинице, иначе Supabase отбивает ключи.
//
// Папка `roles/` появится в этапе 2 (пункт 12 roadmap) — сейчас она пуста и
// эндпоинт возвращает `roles: []`. Папки `agent-skills/` и `tools/` намеренно
// НЕ листим здесь — они появятся в отдельных этапах (пункт 10 этапа 4 и
// пункт 16 этапа 3).

import { Router } from "express";
import { listFiles } from "../../services/team/teamStorage.js";
import { requireAuth } from "../../middleware/requireAuth.js";

const router = Router();
const BUCKET = "team-prompts";

router.use(requireAuth);

// Возвращает имена .md-файлов в подпапке bucket'а team-prompts без расширения.
// Если папки нет — пустой массив. Сортируется по алфавиту.
async function listFolderTitles(folder) {
  let files;
  try {
    files = await listFiles(BUCKET, folder);
  } catch (err) {
    console.warn(`[team/instructions] не удалось получить список ${folder}:`, err?.message);
    return [];
  }
  return (files ?? [])
    .map((f) => (typeof f?.name === "string" ? f.name : ""))
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.replace(/\.md$/i, ""))
    .sort((a, b) => a.localeCompare(b, "ru"));
}

// =========================================================================
// GET /api/team/instructions/list
// Возвращает { strategy: [...], roles: [...], templates: [...] }.
// =========================================================================
router.get("/list", async (_req, res) => {
  try {
    const [strategy, roles, templates] = await Promise.all([
      listFolderTitles("strategy"),
      listFolderTitles("roles"),
      listFolderTitles("task-templates"),
    ]);
    return res.json({ strategy, roles, templates });
  } catch (err) {
    console.error("[team/instructions] list failed:", err);
    return res.status(500).json({ error: err.message ?? "Не удалось получить список" });
  }
});

export default router;
