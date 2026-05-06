// Клиент для бэкенд-эндпоинтов команды (`/api/team/*`).
//
// Используется из server actions и server components для операций, которые
// требуют service-role: запуск задач, управление ключами, запись артефактов,
// транскрипция голосовых заметок. Чтение списков задач и журнала вызовов —
// напрямую из Supabase через RLS, не сюда.
//
// BACKEND_URL — переменная окружения сервера (без NEXT_PUBLIC_), значит этот
// модуль не должен импортироваться в client components — компилятор Next
// заэкранирует переменную как undefined и вызовы тихо упадут в console.warn.
//
// На этапе Сессии 28 (каркас фронта) реально дёргается только запрос статуса
// ключей — для индикатора в шапке Админки. Полные обвязки (run, archive,
// applyAiEdit, voiceTranscribe, …) появятся в Сессиях 6–7 этапа 1; для них
// здесь оставлены тонкие функции, чтобы не плодить сервисов в каждой сессии.

import type { ApiKeysStatus } from "./types";

const BACKEND_URL = process.env.BACKEND_URL ?? process.env.RAILWAY_BACKEND_URL ?? null;

// Основа всех вызовов: единая обработка отсутствия BACKEND_URL и сетевых
// ошибок. Возвращает разобранный JSON или бросает Error с понятным русским
// сообщением — caller сам решит, что показывать пользователю.
async function backendFetch(
  path: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<unknown> {
  if (!BACKEND_URL) {
    throw new Error(
      "Бэкенд не настроен (нет переменной BACKEND_URL). Проверь Vercel → Settings → Environment Variables.",
    );
  }
  const { timeoutMs = 15_000, ...rest } = init;
  const url = `${BACKEND_URL}${path.startsWith("/") ? path : `/${path}`}`;

  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      signal: AbortSignal.timeout(timeoutMs),
      // В Next 15 server fetch'ы по умолчанию кешируются — для команды это
      // вредно: ответ зависит от состояния БД и должен пересчитываться каждый
      // раз. Явно отключаем.
      cache: "no-store",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "неизвестная ошибка";
    throw new Error(`Бэкенд не отвечает: ${message}`);
  }

  const text = await response.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Оставляем null — caller увидит ошибку формата ниже, если ответ не JSON.
    }
  }

  if (!response.ok) {
    const errorMsg =
      parsed && typeof parsed === "object" && parsed !== null && "error" in parsed
        ? String((parsed as { error: unknown }).error)
        : `HTTP ${response.status}`;
    throw new Error(errorMsg);
  }

  return parsed;
}

// =========================================================================
// Админка: ключи и расходы
// =========================================================================

// Возвращает простой статус «есть/нет ключ» по каждому провайдеру.
// На главной /blog/team используется в карточке «Админка» — если хоть один
// ключ не настроен, рисуем предупреждение.
export async function fetchKeysStatus(): Promise<ApiKeysStatus> {
  const data = await backendFetch("/api/team/admin/keys-status", { method: "GET" });
  // На случай рассинхрона типов — нормализуем к булевому.
  const obj = (data ?? {}) as Record<string, unknown>;
  return {
    anthropic: Boolean(obj.anthropic),
    openai: Boolean(obj.openai),
    google: Boolean(obj.google),
  };
}

// Best-effort вариант: если бэкенд не отвечает, возвращает null (не бросает).
// На главной /blog/team мы не хотим, чтобы упавший Railway уронил всю страницу.
export async function fetchKeysStatusSafe(): Promise<ApiKeysStatus | null> {
  try {
    return await fetchKeysStatus();
  } catch (err) {
    console.warn("[teamBackendClient] keys-status недоступен:", err);
    return null;
  }
}
