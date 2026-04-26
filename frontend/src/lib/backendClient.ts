// Клиент для бэкенда Potok. Используется из server actions / API-роутов Next.
// Адрес бэкенда задаётся переменной окружения BACKEND_URL (на сервере, без NEXT_PUBLIC_).
// Если переменная не задана (например, локально без бэкенда) — ничего не делаем и пишем в консоль.

const BACKEND_URL = process.env.BACKEND_URL ?? process.env.RAILWAY_BACKEND_URL;

// Запуск обработки по id уже сохранённой строки. Не ждёт результата Apify —
// бэкенд отвечает 202 сразу. Ошибки сети глотаем: статус строки остаётся pending,
// пользователь увидит это в таблице, Апи можно перезапустить вручную позже.
export async function triggerVideoProcessing(videoId: string): Promise<void> {
  if (!BACKEND_URL) {
    console.warn(
      "[backendClient] BACKEND_URL не задан — обработка видео не запущена. Задай переменную в frontend/.env.local.",
    );
    return;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/api/videos/process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoId }),
      // На всякий случай — таймаут, чтобы форма не висела, если бэкенд не отвечает.
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[backendClient] бэкенд ответил ${res.status}: ${text.slice(0, 200)}`,
      );
    }
  } catch (err) {
    console.error("[backendClient] не удалось достучаться до бэкенда:", err);
  }
}

// Массовый запуск: список id одной пачкой. На бэкенде попадает в общую очередь,
// поэтому даже на 1000 id ответ возвращается мгновенно.
export async function triggerVideoProcessingBatch(
  videoIds: string[],
): Promise<void> {
  if (!BACKEND_URL) {
    console.warn(
      "[backendClient] BACKEND_URL не задан — массовая обработка не запущена.",
    );
    return;
  }
  if (videoIds.length === 0) return;

  try {
    const res = await fetch(`${BACKEND_URL}/api/videos/process-batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ videoIds }),
      // Чуть длиннее таймаут — бэкенд должен принять список и вернуть 202,
      // но при первом запросе после простоя Railway может медленнее отвечать.
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[backendClient] batch: бэкенд ответил ${res.status}: ${text.slice(0, 200)}`,
      );
    }
  } catch (err) {
    console.error("[backendClient] не удалось отправить batch:", err);
  }
}
