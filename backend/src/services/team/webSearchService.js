// Сессия 32 этапа 2 (пункт 17): адаптер Web Search над тремя провайдерами.
//
// Провайдер активен через connection_config.provider у инструмента
// 'web-search' в team_tools. Если провайдер 'anthropic' — пользуемся
// нативным tool-use Anthropic Messages API (через llmClient.callWithWebSearch).
// 'tavily' / 'perplexity' — отдельные HTTP-вызовы; полученные результаты
// мы возвращаем в едином формате, чтобы вызывающая сторона не знала, кто их
// сгенерировал.
//
// Единый формат: `{ results: [{ title, url, content }], raw_response }`.

import { getAgentTools } from "./toolService.js";
import { getApiKey, getAllKeysStatus } from "./keysService.js";

const WEB_SEARCH_TOOL_ID = "web-search";

const VALID_PROVIDERS = new Set(["anthropic", "tavily", "perplexity"]);

// =========================================================================
// Конфиг: вытаскиваем провайдер и API-ключ для активного провайдера.
// =========================================================================

export async function getWebSearchConfig() {
  const tool = await loadWebSearchTool();
  if (!tool) {
    throw new Error("Инструмент Web Search не найден. Запустите seed:web-search.");
  }
  if (tool.status !== "active") {
    throw new Error("Инструмент Web Search неактивен. Включите в Админке.");
  }
  const cfg = tool.connection_config && typeof tool.connection_config === "object"
    ? tool.connection_config
    : {};
  const provider = String(cfg.provider ?? "anthropic").toLowerCase();
  if (!VALID_PROVIDERS.has(provider)) {
    throw new Error(`Неизвестный Web Search провайдер: ${provider}.`);
  }
  return { provider, tool, connectionConfig: cfg };
}

async function loadWebSearchTool() {
  // Не зависим от toolService.getToolById — он принимает только id; работает,
  // но даёт сильную связность. Свой select короче.
  // Импорт ленивый, чтобы не тянуть supabase-client при импорте файла в тесты.
  const { getServiceRoleClient } = await import("./teamSupabase.js");
  const client = getServiceRoleClient();
  const { data, error } = await client
    .from("team_tools")
    .select("*")
    .eq("id", WEB_SEARCH_TOOL_ID)
    .maybeSingle();
  if (error) {
    throw new Error(`Не удалось получить инструмент Web Search: ${error.message}`);
  }
  return data ?? null;
}

// =========================================================================
// Helpers — API-ключи для не-Anthropic провайдеров
// =========================================================================
//
// keysService хранит ключи под фиксированными провайдерами (anthropic /
// openai / google). Tavily/Perplexity лежат в `connection_config.api_key`
// у инструмента web-search (см. UI Админки).

function getProviderApiKey(provider, connectionConfig) {
  if (provider === "anthropic") return null;
  const key = (connectionConfig?.api_key ?? "").toString().trim();
  if (!key) {
    throw new Error(
      `Не задан API-ключ для провайдера ${provider}. Откройте Админку → Инструменты команды → Web Search.`,
    );
  }
  return key;
}

// =========================================================================
// search(query) — общий вход. Для anthropic возвращаем «инструкцию» —
// он вызывается через Messages API tool-use (llmClient), а не самостоятельно;
// здесь делаем тонкий fallback-search через Tavily, если кто-то вызывает
// search() напрямую с anthropic-конфигом (например, для предварительного
// контекста до основного LLM-вызова).
// =========================================================================
export async function search(query, options = {}) {
  if (typeof query !== "string" || !query.trim()) {
    throw new Error("Запрос поиска не может быть пустым.");
  }
  const cfg = await getWebSearchConfig();
  const provider = cfg.provider;
  if (provider === "tavily") {
    return await searchTavily(query, cfg.connectionConfig, options);
  }
  if (provider === "perplexity") {
    return await searchPerplexity(query, cfg.connectionConfig, options);
  }
  // anthropic — нативный tool-use. Если кто-то всё же позвал search() напрямую,
  // имитируем поиск через бесплатный fallback Tavily-key (если задан) или
  // выбрасываем понятную ошибку.
  return await searchAnthropicFallback(query, cfg.connectionConfig, options);
}

async function searchAnthropicFallback(query, cfg, options) {
  // У anthropic-провайдера нет «изолированного» search; для прямых вызовов
  // нужен какой-то fallback. Не делаем "автомаги": явно отказываемся, чтобы
  // вызывающий код увидел проблему и переключил провайдера.
  void query;
  void options;
  void cfg;
  throw new Error(
    "Anthropic Web Search активен только в режиме tool-use внутри LLM-вызова. " +
    "Прямой webSearchService.search() для него не поддержан — переключите провайдер на Tavily или Perplexity в Админке.",
  );
}

// =========================================================================
// Tavily — простой POST /search
// =========================================================================
async function searchTavily(query, connectionConfig, options) {
  const apiKey = getProviderApiKey("tavily", connectionConfig);
  const body = {
    api_key: apiKey,
    query,
    max_results: Number(options.maxResults ?? 5),
    search_depth: options.searchDepth ?? "basic",
  };
  const resp = await fetchWithTimeout("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    timeoutMs: 30_000,
  });
  if (!resp.ok) {
    const text = await safeText(resp);
    throw new Error(`Tavily вернул ${resp.status}: ${text || "пустой ответ"}`);
  }
  const json = await resp.json();
  const results = Array.isArray(json?.results)
    ? json.results.map((r) => ({
        title: typeof r?.title === "string" ? r.title : "",
        url: typeof r?.url === "string" ? r.url : "",
        content: typeof r?.content === "string" ? r.content : "",
      }))
    : [];
  return { provider: "tavily", results, raw_response: json };
}

// =========================================================================
// Perplexity — Chat Completions API, модель sonar.
// =========================================================================
async function searchPerplexity(query, connectionConfig, options) {
  const apiKey = getProviderApiKey("perplexity", connectionConfig);
  const model = (options.model ?? connectionConfig.model ?? "sonar").toString();
  const body = {
    model,
    messages: [
      {
        role: "system",
        content:
          "Ты — поисковый агент. Найди и кратко изложи ключевые факты по запросу. Используй цитаты с источниками.",
      },
      { role: "user", content: query },
    ],
  };
  const resp = await fetchWithTimeout("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    timeoutMs: 30_000,
  });
  if (!resp.ok) {
    const text = await safeText(resp);
    throw new Error(`Perplexity вернул ${resp.status}: ${text || "пустой ответ"}`);
  }
  const json = await resp.json();
  const content =
    typeof json?.choices?.[0]?.message?.content === "string"
      ? json.choices[0].message.content
      : "";
  const citations = Array.isArray(json?.citations) ? json.citations : [];
  // Перепаковываем в единый формат: каждая цитата — отдельный «результат».
  const results = citations.map((url, idx) => ({
    title: `Citation ${idx + 1}`,
    url: String(url ?? ""),
    content: idx === 0 ? content : "",
  }));
  if (results.length === 0 && content) {
    results.push({ title: "Perplexity ответ", url: "", content });
  }
  return { provider: "perplexity", results, raw_response: json };
}

// =========================================================================
// Helpers
// =========================================================================

async function fetchWithTimeout(url, { timeoutMs = 30_000, ...init } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if (err?.name === "AbortError") {
      throw new Error(`Таймаут запроса (${timeoutMs}мс): ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function safeText(resp) {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}

// =========================================================================
// agentHasWebSearch — проверяет, привязан ли инструмент 'web-search' к
// агенту. Используется в llmClient.callWithWebSearch — чтобы решить,
// прокидывать ли Anthropic-tool web_search в запрос. Возвращает boolean.
// =========================================================================
export async function agentHasWebSearch(agentId) {
  if (!agentId) return false;
  try {
    const tools = await getAgentTools(agentId, { onlyActive: true });
    return tools.some((t) => t.id === WEB_SEARCH_TOOL_ID);
  } catch {
    return false;
  }
}

// =========================================================================
// hasAnthropicKey — нужно для UI Админки: если у Anthropic-ключа нет, мы
// не можем использовать нативный tool-use. Вытаскиваем тонкий пробник.
// =========================================================================
export async function hasAnthropicKey() {
  try {
    const key = await getApiKey("anthropic");
    return !!key;
  } catch {
    try {
      const status = await getAllKeysStatus();
      const ent = (status ?? {}).anthropic;
      return Boolean(ent && (ent.present ?? ent.hasKey));
    } catch {
      return false;
    }
  }
}
