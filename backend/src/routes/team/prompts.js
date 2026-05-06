// REST-эндпоинты для записи и доработки шаблонов промптов в bucket team-prompts.
//
// Чтение (список и контент шаблонов) фронт делает напрямую через
// teamPromptsService — здесь только запись и LLM-доработка, требующая
// service-role и/или ключей провайдеров.

import { Router } from "express";
import { uploadFile } from "../../services/team/teamStorage.js";
import { call as llmCall, LLMError } from "../../services/team/llmClient.js";
import { recordCall } from "../../services/team/costTracker.js";

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

// =========================================================================
// POST /api/team/prompts/refine
// Body: { content, instruction, modelChoice? }
// Просит LLM улучшить шаблон по инструкции пользователя. Возвращает только
// новый текст — фронт сам решит, заменить ли существующий шаблон.
// Сам файл НЕ перезаписываем — пользователь увидит результат, отредактирует
// при необходимости и нажмёт «Сохранить».
// =========================================================================

const REFINE_SYSTEM_PROMPT = `Ты — редактор промптов для LLM-задач.
Тебе дают исходный шаблон промпта (markdown с секциями ## System и опционально ## User, плейсхолдерами вида {{name}}) и инструкцию, как его улучшить.
Твоя задача — переписать шаблон, выполнив инструкцию, и сохранив:
- структуру с заголовками ## System / ## User (если они были)
- все плейсхолдеры {{name}} в неизменном виде (нельзя удалять или переименовывать существующие, можно добавлять новые)
- общий смысл и роль промпта (если инструкция явно не просит сменить роль)

Верни ТОЛЬКО новый текст шаблона, без обёрток вроде "Вот улучшенный шаблон:" и без комментариев.`;

router.post("/refine", async (req, res) => {
  const { content, instruction, modelChoice } = req.body ?? {};
  if (typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ error: "content обязателен" });
  }
  if (typeof instruction !== "string" || !instruction.trim()) {
    return res.status(400).json({ error: "instruction обязателен" });
  }

  // Дефолт — Anthropic Sonnet 4.5: лучше всех держит структуру и
  // плейсхолдеры. Можно перебить через modelChoice.
  const provider = (modelChoice && typeof modelChoice.provider === "string"
    ? modelChoice.provider
    : "anthropic");
  const model = (modelChoice && typeof modelChoice.model === "string"
    ? modelChoice.model
    : "claude-sonnet-4-5");

  const userPrompt = `Исходный шаблон:\n\n---\n${content}\n---\n\nИнструкция: ${instruction}`;

  try {
    const result = await llmCall({
      provider,
      model,
      systemPrompt: REFINE_SYSTEM_PROMPT,
      userPrompt,
      cacheableBlocks: [],
      maxTokens: 4096,
    });

    // Пишем в журнал расходов — без task_id, чтобы было видно в админке.
    await recordCall({
      provider,
      model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      cachedTokens: result.cachedTokens,
      taskId: null,
      success: true,
    });

    return res.json({
      content: result.text,
      tokens: {
        input: result.inputTokens,
        output: result.outputTokens,
        cached: result.cachedTokens,
      },
      provider,
      model,
    });
  } catch (err) {
    const message = err instanceof LLMError ? err.message : (err.message ?? "Не удалось доработать промпт");
    // Журналируем ошибочный вызов — для статистики падений.
    try {
      await recordCall({
        provider,
        model,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        taskId: null,
        success: false,
        error: message,
      });
    } catch (recErr) {
      console.warn("[team] prompts refine: не удалось записать в журнал:", recErr.message);
    }
    console.error("[team] prompts refine failed:", err);
    return res.status(500).json({ error: message });
  }
});

export default router;
