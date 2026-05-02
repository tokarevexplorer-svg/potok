import { NextResponse } from "next/server";

// Прокси для превью с Instagram CDN.
// Зачем: Instagram отдаёт превью только без Referer и c определёнными заголовками,
// а браузер по умолчанию шлёт Referer от нашего сайта → 403.
// Решение: сервер сам идёт на их CDN и пересылает картинку клиенту.

const ALLOWED_HOSTS = [
  "cdninstagram.com",
  "fbcdn.net",
  "instagram.com",
  // Постоянные превью на Google Drive (Сессия 20). После миграции старых
  // ссылок старые `cdninstagram.com` URL остаются в БД до момента, пока
  // запись не пересоздастся — поэтому держим оба источника.
  "drive.google.com",
  "googleusercontent.com",
];

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");

  if (!target) {
    return new NextResponse("missing url", { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return new NextResponse("invalid url", { status: 400 });
  }

  // Whitelist хостов — иначе наш прокси можно использовать как открытый relay.
  const isAllowed = ALLOWED_HOSTS.some(
    (host) => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`),
  );
  if (!isAllowed) {
    return new NextResponse("host not allowed", { status: 403 });
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        // User-Agent обычного браузера + явное отсутствие Referer
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        accept: "image/avif,image/webp,image/*,*/*;q=0.8",
      },
      // Запас на медленный CDN
      signal: AbortSignal.timeout(10_000),
    });

    if (!upstream.ok) {
      return new NextResponse(`upstream ${upstream.status}`, { status: 502 });
    }

    const buffer = await upstream.arrayBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") ?? "image/jpeg",
        // Кэшируем на сутки — картинка статична, экономим запросы к Instagram.
        "cache-control": "public, max-age=86400, s-maxage=86400",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return new NextResponse(`fetch failed: ${message}`, { status: 502 });
  }
}
