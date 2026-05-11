// REST-эндпоинт для multipart-загрузки файлов в team-database/uploads/.
//
// Используется для случаев, когда пользователь хочет добавить в базу
// исследований PDF, картинку, аудиозапись интервью и т.д. — что-то, что
// нельзя получить через простую URL-загрузку content-fetcher'ом.
//
// multer работает с буферами в памяти (без записи на диск) — всё попадает
// сразу в Supabase Storage. Лимит размера ставим относительно щедрый,
// 50 МБ — больше команде типично не нужно (PDF интервью, скан страниц и т.д.).

import { Router } from "express";
import multer from "multer";
import { uploadFile } from "../../services/team/teamStorage.js";
import { requireAuth } from "../../middleware/requireAuth.js";

const router = Router();
const BUCKET = "team-database";

router.use(requireAuth);

// Multer в memory-mode: файл попадает в req.file.buffer без записи на диск.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 МБ на файл
    files: 1,
  },
});

// Безопасное имя файла: убираем path-traversal, оставляем только базовое имя.
// Кириллицу сохраняем (исследования у нас на русском).
function sanitizeFilename(name) {
  if (typeof name !== "string" || !name.trim()) return null;
  // basename без директорий (на случай, если клиент прислал «../etc/passwd»).
  const base = name.replace(/\\/g, "/").split("/").pop() || "";
  const trimmed = base.trim();
  if (!trimmed || trimmed === "." || trimmed === "..") return null;
  // Убираем NUL-байты на всякий случай.
  return trimmed.replace(/\0/g, "");
}

// =========================================================================
// POST /api/team/files/upload
// multipart/form-data: file (обязательно), prefix (опц., по умолчанию "uploads/")
// =========================================================================

router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "file обязателен (multipart/form-data, поле 'file')" });
  }

  const filename = sanitizeFilename(req.file.originalname);
  if (!filename) {
    return res.status(400).json({ error: "Некорректное имя файла" });
  }

  // prefix позволяет фронту указать, в какую папку класть. По умолчанию
  // uploads/, но можно sources/ или другую.
  const rawPrefix = typeof req.body?.prefix === "string" ? req.body.prefix : "uploads/";
  const prefix = rawPrefix.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/?$/, "/");
  if (prefix.includes("../")) {
    return res.status(400).json({ error: "prefix не должен содержать '../'" });
  }

  // Дописываем timestamp перед расширением, чтобы избежать коллизий имён
  // при повторной загрузке файла с тем же именем.
  const ts = Date.now();
  const dot = filename.lastIndexOf(".");
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : "";
  const finalName = `${stem}-${ts}${ext}`;
  const path = `${prefix}${finalName}`;

  try {
    await uploadFile(BUCKET, path, req.file.buffer);
    return res.json({
      ok: true,
      path,
      size: req.file.size,
      mimeType: req.file.mimetype,
      originalName: filename,
    });
  } catch (err) {
    console.error(`[team] files upload ${path} failed:`, err);
    return res.status(500).json({ error: err.message ?? "Не удалось загрузить файл" });
  }
});

// Express по умолчанию не отдаёт мультеровские ошибки в наш JSON-формат.
// Перехватываем здесь, чтобы UI получил {error: "..."} вместо HTML-страницы.
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Файл слишком большой (лимит 50 МБ)" });
    }
    return res.status(400).json({ error: `Ошибка загрузки: ${err.message}` });
  }
  if (err) {
    console.error("[team] files unhandled:", err);
    return res.status(500).json({ error: err.message ?? "Ошибка загрузки" });
  }
  return _next();
});

export default router;
