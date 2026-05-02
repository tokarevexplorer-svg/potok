import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import videosRouter from "./routes/videos.js";
import thumbnailsRouter from "./routes/thumbnails.js";
import reprocessRouter from "./routes/reprocess.js";

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

  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "potok-backend" });
  });

  app.use("/api/videos", videosRouter);
  app.use("/api/thumbnails", thumbnailsRouter);
  app.use("/", reprocessRouter);

  // Финальный обработчик ошибок — чтобы не падали сокеты.
  app.use((err, _req, res, _next) => {
    console.error("[express] unhandled:", err);
    res.status(500).json({ error: err.message ?? "Internal error" });
  });

  return app;
}
