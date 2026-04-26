import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Фабрика клиента Supabase. Используется и на сервере (RSC), и в клиентских компонентах.
// Anon-ключ публичный — его безопасно отдавать в браузер. Доступ ограничивает RLS.

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Не заданы NEXT_PUBLIC_SUPABASE_URL или NEXT_PUBLIC_SUPABASE_ANON_KEY. Проверь frontend/.env.local.",
  );
}

let browserClient: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!browserClient) {
    browserClient = createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: { persistSession: false },
    });
  }
  return browserClient;
}

// Серверный клиент создаётся на каждый запрос — кешировать нельзя.
export function createSupabaseServerClient(): SupabaseClient {
  return createClient(supabaseUrl!, supabaseAnonKey!, {
    auth: { persistSession: false },
  });
}
