import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import videosRouter from "./routes/videos.js";
import thumbnailsRouter from "./routes/thumbnails.js";
import reprocessRouter from "./routes/reprocess.js";
import teamTasksRouter from "./routes/team/tasks.js";
import teamArtifactsRouter from "./routes/team/artifacts.js";
import teamPromptsRouter from "./routes/team/prompts.js";
import teamInstructionsRouter from "./routes/team/instructions.js";
import teamAdminRouter from "./routes/team/admin.js";
import teamFilesRouter from "./routes/team/files.js";
import teamVoiceRouter from "./routes/team/voice.js";
import teamDatabasesRouter from "./routes/team/databases.js";
import teamMemoryRouter from "./routes/team/memory.js";
import teamAgentsRouter from "./routes/team/agents.js";
import teamFeedbackRouter from "./routes/team/feedback.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: (origin, cb) => {
        // Без origin (curl, health-чеки) — разрешаем.
        if (!origin) return cb(null, true);
        if (env.frontendOrigins.includes(origin)) return cb(null, true);
        return cb(new Error(`CORS: origin ${origin} не разрешён`));
      },
    }),
  );

  // JSON-парсер увеличен до 5 МБ — write_text промпты с research-блоками
  // и AI-правки фрагментов могут включать большие объёмы текста (контекст
  // блога + транскрипции + полный текст для редактирования).
  app.use(express.json({ limit: "5mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "potok-backend" });
  });

  app.use("/api/videos", videosRouter);
  app.use("/api/thumbnails", thumbnailsRouter);
  app.use("/", reprocessRouter);

  // Раздел «Команда» (Сессии 24-27): задачи, артефакты, шаблоны промптов,
  // админка ключей и расходов, загрузка файлов, голосовая транскрипция.
  app.use("/api/team/tasks", teamTasksRouter);
  app.use("/api/team/artifacts", teamArtifactsRouter);
  app.use("/api/team/prompts", teamPromptsRouter);
  app.use("/api/team/instructions", teamInstructionsRouter);
  app.use("/api/team/admin", teamAdminRouter);
  app.use("/api/team/files", teamFilesRouter);
  app.use("/api/team/voice", teamVoiceRouter);
  app.use("/api/team/databases", teamDatabasesRouter);
  app.use("/api/team/memory", teamMemoryRouter);
  app.use("/api/team/agents", teamAgentsRouter);
  app.use("/api/team/feedback", teamFeedbackRouter);

  // Финальный обработчик ошибок — чтобы не падали сокеты.
  app.use((err, _req, res, _next) => {
    console.error("[express] unhandled:", err);
    res.status(500).json({ error: err.message ?? "Internal error" });
  });

  return app;
}
