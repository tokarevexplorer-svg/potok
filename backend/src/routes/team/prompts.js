// REST-эндпоинты для записи шаблонов промптов в bucket team-prompts.
//
// Чтение (список и контент шаблонов) фронт делает напрямую через
// teamPromptsService — здесь только запись, требующая service-role.

import { Router } from "express";
import { uploadFile } from "../../services/team/teamStorage.js";

const router = Router();
const BUCKET = "team-prompts";

// Имя шаблона должно быть простым: только латиница/цифры/дефис/подчёркивание/точка.
// Никаких слэшей — у нас плоская структура шаблонов.
const NAME_REGEX = /^[A-Za-z0-9_-]+(?:\.md)?$/;

// =========================================================================
// POST /api/team/prompts
// Body: { name, content }
// Создаёт или обновляет шаблон. Имя без расширения — добавим .md
// автоматически (как в promptBuilder при чтении).
// =========================================================================

router.post("/", async (req, res) => {
  const { name, content } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "name обязателен" });
  }
  const trimmed = name.trim();
  if (!NAME_REGEX.test(trimmed)) {
    return res.status(400).json({
      error: "name может содержать только латиницу, цифры, дефис, подчёркивание и опционально .md",
    });
  }
  if (typeof content !== "string") {
    return res.status(400).json({ error: "content должен быть строкой" });
  }

  const filename = trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;
  try {
    await uploadFile(BUCKET, filename, content);
    return res.json({ ok: true, name: filename });
  } catch (err) {
    console.error(`[team] prompts upload ${filename} failed:`, err);
    return res.status(500).json({ error: err.message ?? "Не удалось сохранить шаблон" });
  }
});

export default router;
