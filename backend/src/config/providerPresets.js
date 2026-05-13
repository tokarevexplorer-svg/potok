// Сессия 48 этапа 2 (пункт 1): пресеты популярных LLM-провайдеров.
//
// При добавлении ключа в Админке UI сначала показывает список этих пресетов
// (карточками), Влад выбирает один — и base_url / is_openai_compatible /
// models / display_name подставляются автоматически. Для custom-провайдера
// все поля заполняются вручную.
//
// Структура одной записи:
//   id                    — provider-slug, как в team_api_keys.provider
//   display_name          — для UI
//   base_url              — для OpenAI-compatible (NULL у нативных)
//   is_openai_compatible  — true для всех, кроме anthropic + google
//   models                — массив дефолтных моделей (Влад может изменить)
//   help_url              — куда отправить за ключом

export const PROVIDER_PRESETS = {
  anthropic: {
    id: "anthropic",
    display_name: "Anthropic (Claude)",
    base_url: null,
    is_openai_compatible: false,
    models: [
      "claude-opus-4-5-20251022",
      "claude-sonnet-4-5-20251022",
      "claude-haiku-4-5",
    ],
    help_url: "https://console.anthropic.com/settings/keys",
  },
  openai: {
    id: "openai",
    display_name: "OpenAI",
    base_url: "https://api.openai.com/v1",
    is_openai_compatible: true,
    models: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
    help_url: "https://platform.openai.com/api-keys",
  },
  google: {
    id: "google",
    display_name: "Google AI Studio (Gemini)",
    base_url: null,
    is_openai_compatible: false,
    models: ["gemini-2.5-pro", "gemini-2.5-flash"],
    help_url: "https://aistudio.google.com/apikey",
  },
  deepseek: {
    id: "deepseek",
    display_name: "DeepSeek",
    base_url: "https://api.deepseek.com/v1",
    is_openai_compatible: true,
    models: ["deepseek-chat", "deepseek-reasoner"],
    help_url: "https://platform.deepseek.com/api_keys",
  },
  groq: {
    id: "groq",
    display_name: "Groq",
    base_url: "https://api.groq.com/openai/v1",
    is_openai_compatible: true,
    models: [
      "llama-3.3-70b-versatile",
      "mixtral-8x7b-32768",
      "gemma2-9b-it",
    ],
    help_url: "https://console.groq.com/keys",
  },
  perplexity: {
    id: "perplexity",
    display_name: "Perplexity",
    base_url: "https://api.perplexity.ai",
    is_openai_compatible: true,
    models: ["sonar", "sonar-pro", "sonar-reasoning"],
    help_url: "https://www.perplexity.ai/settings/api",
  },
  openrouter: {
    id: "openrouter",
    display_name: "OpenRouter",
    base_url: "https://openrouter.ai/api/v1",
    is_openai_compatible: true,
    models: [],
    help_url: "https://openrouter.ai/keys",
  },
  ollama_cloud: {
    id: "ollama_cloud",
    display_name: "Ollama Cloud",
    base_url: "https://api.ollama.com/v1",
    is_openai_compatible: true,
    models: [],
    help_url: "https://ollama.com/settings/keys",
  },
};

// Возвращает массив пресетов в стабильном порядке (нативные сверху).
export function listPresets() {
  return Object.values(PROVIDER_PRESETS);
}

// Возвращает один пресет или null.
export function getPreset(id) {
  return PROVIDER_PRESETS[id] ?? null;
}

// Из preset'а в shape, который ожидает БД (team_api_keys row).
export function presetToRow(preset, keyValue) {
  return {
    provider: preset.id,
    key_value: keyValue,
    display_name: preset.display_name,
    base_url: preset.base_url,
    is_openai_compatible: preset.is_openai_compatible,
    models: preset.models ?? [],
  };
}
