// Загрузка содержимого по URL или из локального источника для research_direct.
//
// Портирование `dkl_tool/backend/services/content_fetcher.py` на JS.
// Унифицированный выход: {label, kind, text}, чтобы handler не ветвился по типу источника.
//
// Отличия от Python-версии:
//   - У нас нет локальной файловой системы для пользовательских источников —
//     "локальные" пути теперь это файлы в bucket'е team-database (например,
//     "sources/spb-1900.pdf"). Сначала пробуем как путь в Storage, если не
//     нашли — кидаем понятную ошибку.
//   - HTML тащим встроенным fetch (Node 20+), для разбора HTML — node-html-parser
//     (минималистичная альтернатива BeautifulSoup, не требует JSDOM).
//   - PDF — pdf-parse (буферный API, удобнее чем pypdf).

import { downloadFile } from "./teamStorage.js";

const DATABASE_BUCKET = "team-database";
const MAX_TEXT_CHARS = 200_000; // ~50k токенов — чтобы не разорвать промпт

export class FetchError extends Error {
  constructor(message) {
    super(message);
    this.name = "FetchError";
  }
}

function truncate(text) {
  if (text.length <= MAX_TEXT_CHARS) return text;
  return (
    text.slice(0, MAX_TEXT_CHARS) +
    `\n\n…[обрезано на ${MAX_TEXT_CHARS} символах из ${text.length}]`
  );
}

function isUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(value);
    return (u.protocol === "http:" || u.protocol === "https:") && !!u.host;
  } catch {
    return false;
  }
}

// Главный вход: source — строка (URL или путь в team-database/sources/).
export async function fetchSource(source) {
  const trimmed = (source || "").trim();
  if (!trimmed) {
    throw new FetchError("Источник не указан");
  }
  if (isUrl(trimmed)) {
    return await fetchUrl(trimmed);
  }
  return await fetchStoragePath(trimmed);
}

// ---------------- URL ----------------

async function fetchUrl(url) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/pdf;q=0.9,*/*;q=0.8",
    "Accept-Language": "ru,en;q=0.8",
  };

  let response;
  try {
    // 30 сек — и серверы успевают, и пользователь не ждёт вечно.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      response = await fetch(url, {
        method: "GET",
        headers,
        redirect: "follow",
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      throw new FetchError(`HTTP ${response.status} ${response.statusText}`);
    }
  } catch (e) {
    if (e instanceof FetchError) throw e;
    throw new FetchError(`Не удалось скачать ${url}: ${e.message ?? e}`);
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const isPdfUrl =
    contentType.includes("application/pdf") ||
    url.toLowerCase().split("?")[0].endsWith(".pdf");

  const buffer = Buffer.from(await response.arrayBuffer());

  if (isPdfUrl) {
    const text = await extractPdfBytes(buffer);
    return { label: url, kind: "pdf-url", text: truncate(text) };
  }

  const html = buffer.toString("utf-8");
  const text = extractHtml(html);
  return { label: url, kind: "url", text: truncate(text) };
}

// ---------------- Storage path ----------------

// "Локальный" путь — это путь внутри bucket'а team-database. Пробуем сначала
// как есть (например, "sources/article.pdf"), потом с префиксом "sources/" если
// не указан. Полный URL уже отдан fetchUrl выше, сюда не доходит.
async function fetchStoragePath(rawPath) {
  const path = rawPath.replace(/\\/g, "/").replace(/^\/+/, "");
  const candidates = [path];
  if (!path.startsWith("sources/")) {
    candidates.push(`sources/${path}`);
  }

  let buffer = null;
  let resolvedPath = path;
  for (const candidate of candidates) {
    try {
      // downloadFile возвращает строку (UTF-8). Для PDF этого мало —
      // нужны байты. Пробуем сначала как текст, если pdf — переходим на байты.
      const lower = candidate.toLowerCase();
      if (lower.endsWith(".pdf")) {
        const buf = await downloadFileAsBuffer(candidate);
        buffer = buf;
        resolvedPath = candidate;
        break;
      }
      const text = await downloadFile(DATABASE_BUCKET, candidate);
      const label = candidate.split("/").pop() || candidate;
      const kind = lower.endsWith(".html") || lower.endsWith(".htm") ? "file" : "file";
      const out =
        lower.endsWith(".html") || lower.endsWith(".htm") ? extractHtml(text) : text;
      return { label, kind, text: truncate(out) };
    } catch {
      // пробуем следующий кандидат
    }
  }

  if (!buffer) {
    throw new FetchError(`Файл не найден: ${rawPath}`);
  }

  const label = resolvedPath.split("/").pop() || resolvedPath;
  const text = await extractPdfBytes(buffer);
  return { label, kind: "pdf", text: truncate(text) };
}

// downloadFile из teamStorage возвращает текст (через .text() на Blob).
// Для PDF нужны бинарные байты — берём напрямую через service-role клиент.
async function downloadFileAsBuffer(path) {
  const { getServiceRoleClient } = await import("./teamSupabase.js");
  const client = getServiceRoleClient();
  const { data, error } = await client.storage
    .from(DATABASE_BUCKET)
    .download(path);
  if (error) throw new FetchError(`Не удалось скачать "${path}": ${error.message}`);
  if (!data) throw new FetchError(`Файл "${path}" пуст или не существует.`);
  return Buffer.from(await data.arrayBuffer());
}

// ---------------- Extractors ----------------

// Минимальная очистка HTML до читаемого текста. Тяжёлый JSDOM не используем —
// он медленный и тащит много веса. Регексп-подход покрывает 95% реальных страниц.
function extractHtml(html) {
  if (!html) return "";

  // Title из тэга <title>.
  let title = "";
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = decodeEntities(titleMatch[1]).trim();
  }

  // Удаляем шумные блоки целиком вместе с содержимым.
  let stripped = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, " ")
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, " ")
    .replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside\b[^>]*>[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form\b[^>]*>[\s\S]*?<\/form>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");

  // Если нашли article/main — ужимаем до них (страницы с навигацией и
  // боковыми панелями отдают много мусора, основной текст обычно внутри).
  const articleMatch = stripped.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch = stripped.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  if (articleMatch) {
    stripped = articleMatch[1];
  } else if (mainMatch) {
    stripped = mainMatch[1];
  }

  // Превращаем блочные тэги в переводы строк, остальные — убираем.
  const text = stripped
    .replace(/<\/?(p|div|li|tr|br|h[1-6]|section|article|blockquote)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  const decoded = decodeEntities(text);

  // Свёртка пустых строк (3+ подряд → 2).
  const lines = [];
  let blank = 0;
  for (const rawLine of decoded.split("\n")) {
    const line = rawLine.replace(/[ \t]+/g, " ").trimEnd();
    if (!line.trim()) {
      blank += 1;
      if (blank >= 2) continue;
    } else {
      blank = 0;
    }
    lines.push(line);
  }

  let out = lines.join("\n").trim();
  if (title) {
    const sep = "=".repeat(Math.min(title.length, 80));
    out = `${title}\n${sep}\n\n${out}`;
  }
  return out;
}

function decodeEntities(html) {
  return String(html)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(parseInt(code, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, code) =>
      String.fromCharCode(parseInt(code, 16)),
    );
}

// pdf-parse — динамический импорт, чтобы не падать на старте процесса, если
// зависимость почему-то не установлена. Ленивая инициализация.
async function extractPdfBytes(buffer) {
  let pdfParse;
  try {
    const mod = await import("pdf-parse");
    pdfParse = mod.default ?? mod;
  } catch (e) {
    throw new FetchError(
      `Пакет 'pdf-parse' не установлен в backend. Запусти 'npm install pdf-parse'. (${e.message ?? e})`,
    );
  }

  let parsed;
  try {
    parsed = await pdfParse(buffer);
  } catch (e) {
    throw new FetchError(`Не удалось открыть PDF: ${e.message ?? e}`);
  }
  return (parsed?.text ?? "").trim();
}
