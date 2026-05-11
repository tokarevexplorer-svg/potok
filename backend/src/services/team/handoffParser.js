// Парсер блока «Suggested Next Steps» из ответа LLM (Сессия 13, пункт 8).
//
// Агент-инструкция в Awareness (см. promptBuilder.HANDOFF_HINT_BLOCK) учит
// модель добавлять опциональный блок в конце ответа:
//
//   ---
//   **Suggested Next Steps:**
//   - [Имя сотрудника]: [краткое описание задачи]
//   - [Имя сотрудника]: [ещё одно предложение]
//   ---
//
// Эта функция тащит из текста все строки внутри такого блока, парсит их в
// массив [{ agent_name, suggestion }] и возвращает.
//
// Поведение:
//   - Без блока — возвращается пустой массив (НЕ null, чтобы json-колонка
//     suggested_next_steps писалась консистентно).
//   - Блок ищется case-insensitive по заголовку «Suggested Next Steps».
//     Допускаются обрамляющие `**`, отдельная строка, опциональный `:` в конце.
//   - Маркер списка `-`, `*` или `•`. После него — `<имя>: <текст>`.
//     Имена без двоеточия пропускаются (не понимаем, к кому относится).
//   - `---` перед и после блока — опц. Если блок не закрыт `---` —
//     парсим до пустой строки / следующего markdown-заголовка / конца текста.
//   - Возвращаемый текст suggestion — обрезанный, без точки в конце.

const HEADING_RE = /^[ \t]*(?:\*\*)?\s*suggested\s+next\s+steps\s*(?::|\b)\s*(?:\*\*)?\s*$/i;
// Маркеры списков: `-`, `*`, `•`. `+` намеренно не включаем — markdown-формат
// агента это `-`, других мы не ждём.
const LIST_ITEM_RE = /^[ \t]*[-*•][ \t]+(.+)$/;
// Линия-разделитель блока — три или больше тире/подчёркивания/звёзд.
const HR_RE = /^[ \t]*[-_*]{3,}[ \t]*$/;

// Извлекает массив { agent_name, suggestion } из ответа LLM. Если блока
// нет — пустой массив.
export function parseSuggestedNextSteps(text) {
  if (typeof text !== "string" || !text.trim()) return [];

  const lines = text.split(/\r?\n/);
  // Ищем заголовок «**Suggested Next Steps:**» в любом регистре.
  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (HEADING_RE.test(lines[i])) {
      headingIdx = i;
      break;
    }
  }
  if (headingIdx === -1) return [];

  // Тело — все строки после заголовка до закрывающего `---`, пустой строки
  // (две подряд) или следующего markdown-заголовка `## ...`.
  const items = [];
  let blankRun = 0;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const line = lines[i];

    if (HR_RE.test(line)) break; // закрывающий разделитель

    const trimmed = line.trim();
    if (!trimmed) {
      blankRun += 1;
      // Две пустые строки подряд — конец блока.
      if (blankRun >= 2) break;
      continue;
    }
    blankRun = 0;

    // Следующий markdown-заголовок верхнего уровня — конец блока.
    if (/^#{1,3}\s+\S/.test(trimmed)) break;

    const itemMatch = line.match(LIST_ITEM_RE);
    if (!itemMatch) continue;

    const raw = itemMatch[1].trim();
    // Имя и предложение разделены первым двоеточием. Имя может быть в
    // квадратных скобках (`[Маша]`) — снимаем их. Если двоеточия нет —
    // пропускаем строку (непонятно, кому адресовано).
    const colonIdx = raw.indexOf(":");
    if (colonIdx <= 0) continue;
    let name = raw.slice(0, colonIdx).trim();
    let suggestion = raw.slice(colonIdx + 1).trim();
    if (!name || !suggestion) continue;

    // Снимаем квадратные скобки вокруг имени (модель часто оставляет шаблон).
    if (name.startsWith("[") && name.endsWith("]")) {
      name = name.slice(1, -1).trim();
    }
    // И вокруг suggestion на всякий случай.
    if (suggestion.startsWith("[") && suggestion.endsWith("]")) {
      suggestion = suggestion.slice(1, -1).trim();
    }
    // Хвостовая точка убирается — не несёт смысла в кратком описании.
    if (suggestion.endsWith(".")) suggestion = suggestion.slice(0, -1).trim();

    if (!name || !suggestion) continue;
    // Игнорируем placeholder'ы из инструкции в Awareness — модель может
    // скопировать пример «[Имя сотрудника]» как реальный ответ.
    if (/^(имя\s+сотрудника|agent\s*name)$/i.test(name)) continue;

    items.push({ agent_name: name, suggestion });
  }

  return items;
}

// Удаляет блок Suggested Next Steps из текста (для UI, если показываем
// чистый ответ агента без служебных пометок). Возвращает исходный текст,
// если блока нет.
export function stripSuggestedNextSteps(text) {
  if (typeof text !== "string" || !text.trim()) return text;
  const lines = text.split(/\r?\n/);

  let headingIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (HEADING_RE.test(lines[i])) {
      headingIdx = i;
      break;
    }
  }
  if (headingIdx === -1) return text;

  // Если строка непосредственно перед заголовком — `---`, тоже её срезаем
  // (открывающий разделитель блока).
  let startIdx = headingIdx;
  if (startIdx > 0 && HR_RE.test(lines[startIdx - 1])) startIdx -= 1;

  // Конец — закрывающий `---`, две пустые строки или конец текста.
  let endIdx = lines.length;
  let blankRun = 0;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    if (HR_RE.test(lines[i])) {
      endIdx = i + 1; // включая закрывающий `---`
      break;
    }
    if (!lines[i].trim()) {
      blankRun += 1;
      if (blankRun >= 2) {
        endIdx = i;
        break;
      }
    } else {
      blankRun = 0;
      if (/^#{1,3}\s+\S/.test(lines[i].trim())) {
        endIdx = i;
        break;
      }
    }
  }

  const head = lines.slice(0, startIdx).join("\n").replace(/\s+$/, "");
  const tail = lines.slice(endIdx).join("\n").replace(/^\s+/, "");
  return head && tail ? `${head}\n\n${tail}` : (head || tail);
}
