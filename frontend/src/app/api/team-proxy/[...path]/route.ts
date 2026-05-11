import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { signBackendToken } from "@/lib/apiClient";

// Универсальный прокси клиентских вызовов команды на Railway.
//
// Зачем: BACKEND_URL — серверная переменная окружения (без NEXT_PUBLIC_),
// в браузер не уезжает. Чтобы клиентские компоненты команды могли дёргать
// /api/team/* эндпоинты бэкенда, делаем тонкий прокси: фронт обращается на
// /api/team-proxy/<path>, Next.js здесь подкладывает BACKEND_URL и шлёт на
// Railway, ответ возвращает клиенту как есть.
//
// Сессия 1 этапа 2: прокси теперь сам подписывает короткоживущий HS256-JWT
// с email из сессии Auth.js v5 и подкладывает Authorization: Bearer. Без
// валидной сессии — отвечаем 401 не дёргая бэкенд. Middleware в norm. случае
// до сюда не пускает, но 401 здесь — страховка на случай его обхода.
//
// Поддерживает GET, POST, DELETE и multipart upload — в команде есть
// загрузка аудио для транскрипции (POST /api/team/voice/transcribe) и
// загрузка файлов (POST /api/team/files/upload).

const BACKEND_URL =
  process.env.BACKEND_URL ?? process.env.RAILWAY_BACKEND_URL ?? null;

// Vercel function maxDuration. По дефолту Hobby даёт 10 секунд, чего мало
// для LLM-вызовов apply-ai-edit / append-question (10–40 сек обычно). Pro
// даёт до 60 сек. Если проект на Pro — поднимется до 60; на Hobby Vercel
// возьмёт максимум, который позволяет план (т.е. 10), но хотя бы не урежет
// дополнительно. Полное решение для долгих LLM-цепочек — апгрейд плана или
// streaming-ответ.
export const maxDuration = 60;

// Один шаблон обработки на все методы — Next 15 ожидает named exports
// per-method. Все они ведут в proxyRequest.
async function proxyRequest(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  if (!BACKEND_URL) {
    return NextResponse.json(
      { error: "Бэкенд не настроен (нет BACKEND_URL в переменных окружения)" },
      { status: 503 },
    );
  }

  // Auth-гейт: middleware в обычном случае не пускает неавторизованных,
  // но если кто-то обошёл его (например, ошибка matcher) — отказываем тут.
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 });
  }

  let token: string;
  try {
    token = signBackendToken(email);
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return NextResponse.json(
      { error: `Не удалось подписать токен: ${message}` },
      { status: 500 },
    );
  }

  const { path } = await ctx.params;
  const target = `${BACKEND_URL}/api/team/${(path ?? []).join("/")}`;
  const url = new URL(req.url);
  const fullTarget = url.search ? `${target}${url.search}` : target;

  // Передаём заголовки, кроме host/connection (узнает upstream сам) и
  // content-length (изменится при сериализации). Cookie не передаём —
  // у бэкенда нет сессий. Authorization подкладываем заново — на бэкенде
  // ожидается именно наш JWT, не возможный заголовок клиента.
  const forwardHeaders = new Headers();
  for (const [name, value] of req.headers.entries()) {
    const lower = name.toLowerCase();
    if (lower === "host" || lower === "connection" || lower === "content-length") continue;
    if (lower === "cookie" || lower === "authorization") continue;
    forwardHeaders.set(name, value);
  }
  forwardHeaders.set("Authorization", `Bearer ${token}`);

  // Body для GET/HEAD не отправляется. Для остальных — стримим как есть
  // (multipart, json, plain).
  const init: RequestInit = {
    method: req.method,
    headers: forwardHeaders,
    // 60 сек — достаточно для preview-prompt с большим контекстом и для
    // загрузки аудио до 25 МБ. Сами LLM-вызовы идут в фоне (запуск задачи
    // отвечает 202 сразу).
    signal: AbortSignal.timeout(60_000),
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = req.body;
    // Node 20+ требует duplex: 'half' для стриминга тела при fetch.
    (init as RequestInit & { duplex?: string }).duplex = "half";
  }

  try {
    const upstream = await fetch(fullTarget, init);
    // Заголовки ответа пробрасываем, кроме hop-by-hop. Для JSON и текста
    // достаточно content-type, остальное браузер выставит сам.
    const respHeaders = new Headers();
    const ct = upstream.headers.get("content-type");
    if (ct) respHeaders.set("content-type", ct);
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: respHeaders,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    return NextResponse.json(
      { error: `Бэкенд не отвечает: ${message}` },
      { status: 502 },
    );
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, ctx);
}
export async function POST(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, ctx);
}
export async function DELETE(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, ctx);
}
export async function PUT(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, ctx);
}
export async function PATCH(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  return proxyRequest(req, ctx);
}
