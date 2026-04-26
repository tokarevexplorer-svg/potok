// Извлекает shortcode из ссылки Instagram (Reels или общий пост) и собирает
// embed-URL для iframe. Поддерживает /reel/, /reels/ и /p/ — те же форматы,
// что принимает reelsUrlParser.

const SHORTCODE_REGEX = /instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i;

export function extractInstagramShortcode(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(SHORTCODE_REGEX);
  return match ? match[1] : null;
}

// Используем /reel/<shortcode>/embed/ — Instagram отдаёт минималистичный
// плеер с автором и подписью, без рекомендаций и панелей профиля.
export function buildInstagramEmbedUrl(url: string | null | undefined): string | null {
  const shortcode = extractInstagramShortcode(url);
  if (!shortcode) return null;
  return `https://www.instagram.com/reel/${shortcode}/embed/`;
}
