// Вычисление порядка столбцов таблицы видео с учётом
// перетаскивания групп, сворачивания, кастомных ширин и закрепления.

import {
  COLLAPSED_GROUP_WIDTH,
  DEFAULT_GROUP_ORDER,
  MIN_COLUMN_WIDTH,
  videoColumns,
  type ColumnGroup,
  type VideoColumn,
} from "./videoTableColumns";

export interface TableLayoutState {
  groupOrder: ColumnGroup[];
  collapsedGroups: Set<ColumnGroup>;
  // Сколько ДАННЫХ-столбцов закреплено слева (служебный чекбокс закреплён всегда).
  // 0 = ничего не закреплено, кроме чекбокса.
  frozenCount: number;
  // Кастомные ширины (px) — поверх defaultWidth. Ключ — col.key.
  columnWidths: Record<string, number>;
}

export const initialTableLayoutState: TableLayoutState = {
  groupOrder: [...DEFAULT_GROUP_ORDER],
  collapsedGroups: new Set(),
  frozenCount: 1, // по умолчанию — превью (чекбокс закреплён всегда отдельно)
  columnWidths: {},
};

// Один элемент списка отрисовки: либо настоящий столбец данных, либо плейсхолдер
// свёрнутой группы (узкая колонка с её названием и шевроном «развернуть»).
export type RenderedColumn =
  | {
      kind: "data";
      column: VideoColumn;
      width: number;
      // Является ли это первым столбцом своей группы — для отрисовки «шапки группы».
      isFirstInGroup: boolean;
      // Сколько столбцов в этой группе (для colSpan шапки группы).
      groupSpan: number;
      // Является ли группа этого столбца сейчас «перетаскиваемой» —
      // не используется здесь, но поле полезно вне модуля.
      group: ColumnGroup;
    }
  | {
      kind: "collapsed";
      group: ColumnGroup;
      width: number;
    };

export function getColumnWidth(
  column: VideoColumn,
  widths: Record<string, number>,
): number {
  const w = widths[column.key];
  if (typeof w === "number" && w >= MIN_COLUMN_WIDTH) return w;
  return column.defaultWidth;
}

// Превращает state раскладки в список колонок для отрисовки в нужном порядке.
export function buildRenderedColumns(state: TableLayoutState): RenderedColumn[] {
  const byGroup = new Map<ColumnGroup, VideoColumn[]>();
  for (const col of videoColumns) {
    if (!byGroup.has(col.group)) byGroup.set(col.group, []);
    byGroup.get(col.group)!.push(col);
  }

  const result: RenderedColumn[] = [];
  for (const group of state.groupOrder) {
    const cols = byGroup.get(group) ?? [];
    if (state.collapsedGroups.has(group)) {
      result.push({ kind: "collapsed", group, width: COLLAPSED_GROUP_WIDTH });
      continue;
    }
    cols.forEach((col, i) => {
      result.push({
        kind: "data",
        column: col,
        width: getColumnWidth(col, state.columnWidths),
        isFirstInGroup: i === 0,
        groupSpan: cols.length,
        group,
      });
    });
  }
  return result;
}

// Накопительные left-offsets для sticky-позиционирования.
// На входе — ширины колонок (включая служебную чекбокс-колонку слева, в индексе 0).
// На выходе — массив offsets такой же длины (offsets[0] = 0, offsets[1] = ширина[0], ...).
export function getCumulativeOffsets(widths: number[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const w of widths) {
    offsets.push(acc);
    acc += w;
  }
  return offsets;
}

// Вычисляет суммарную ширину закреплённых колонок (включая чекбокс).
export function getFrozenTotalWidth(
  rendered: RenderedColumn[],
  frozenCount: number,
  checkboxWidth: number,
): number {
  let total = checkboxWidth;
  // Закрепляем frozenCount ПЕРВЫХ data-столбцов (в текущем порядке отрисовки).
  // Свёрнутые группы между ними тоже считаются закреплёнными — иначе UX сломан.
  let dataSeen = 0;
  for (const item of rendered) {
    if (dataSeen >= frozenCount) {
      // Если последующая свёрнутая группа идёт прямо за закреплёнными —
      // не включаем её, чтобы не «прятать» её случайно.
      break;
    }
    total += item.width;
    if (item.kind === "data") dataSeen += 1;
  }
  return total;
}

// Закреплён ли элемент рендера на индексе i.
// Закрепляются: чекбокс (всегда), плюс первые frozenCount data-элементов
// (свёрнутые группы между ними не считаются за data-элементы, но тоже sticky).
export function isFrozenAt(
  rendered: RenderedColumn[],
  i: number,
  frozenCount: number,
): boolean {
  if (frozenCount <= 0) return false;
  let dataSeen = 0;
  for (let j = 0; j < rendered.length; j++) {
    const it = rendered[j];
    if (it.kind === "data") {
      dataSeen += 1;
      if (j === i) return dataSeen <= frozenCount;
    } else {
      if (j === i) return dataSeen < frozenCount;
    }
    if (dataSeen >= frozenCount) {
      // Все после этого — не закреплены.
      return false;
    }
  }
  return false;
}

// Сколько data-столбцов всего (нужно для границ frozenCount при drag'е).
export function totalDataColumnCount(): number {
  return videoColumns.length;
}
