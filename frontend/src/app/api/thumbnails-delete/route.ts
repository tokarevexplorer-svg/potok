import { NextResponse } from "next/server";

// Прокси для удаления превью с Google Drive.
// Зачем нужен: видео удаляется из браузера прямо через Supabase (RLS открыта),
// но Google Drive API доступен только с бэка (там Service Account JSON).
// Этот API-роут пробрасывает запрос на Railway, чтобы фронт не знал URL
// бэкенда (нет NEXT_PUBLIC_BACKEND_URL — переменная остаётся серверной).
//
// Вызывается из videoDeleteService перед собственно удалением видео из БД.
// Best effort: если бэкенд не отвечает — фронт всё равно удалит видео,
// файл на Drive останется «сиротой» (это не блокер для удаления).

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.RAILWAY_BACKEND_URL ?? null;

export async function POST(req: Request) {
  if (!BACKEND_URL) {
    // Локально без бэкенда — просто отвечаем 200 с нулевым счётчиком,
    // фронту нет смысла обрабатывать ошибку.
    return NextResponse.json({ deleted: 0, skipped: "no backend url" });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    const upstream = await fetch(`${BACKEND_URL}/api/thumbnails/delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const text = await upstream.text();
    // Пробрасываем ответ как есть — там {deleted, requested, ...}.
    return new NextResponse(text, {
      status: upstream.status,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    // Не падаем — фронт продолжит удалять видео, превью останутся на Drive.
    return NextResponse.json({ deleted: 0, error: message }, { status: 200 });
  }
}
