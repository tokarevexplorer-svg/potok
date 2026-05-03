"use client";

import { useCallback, useMemo, useState } from "react";
import {
  buildRenderedColumns,
  initialTableLayoutState,
  type TableLayoutState,
} from "@/lib/tableLayout";
import {
  MIN_COLUMN_WIDTH,
  videoColumns,
  type ColumnGroup,
} from "@/lib/videoTableColumns";

// Хук состояния раскладки таблицы. Состояние эфемерное (сбрасывается при
// перезагрузке) — таково текущее ТЗ Сессии 22.
export function useTableLayout() {
  const [state, setState] = useState<TableLayoutState>(initialTableLayoutState);

  const toggleGroupCollapsed = useCallback((group: ColumnGroup) => {
    setState((prev) => {
      const next = new Set(prev.collapsedGroups);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return { ...prev, collapsedGroups: next };
    });
  }, []);

  // Поменять порядок групп: переместить группу from на позицию to.
  const moveGroup = useCallback((from: ColumnGroup, to: ColumnGroup) => {
    if (from === to) return;
    setState((prev) => {
      const order = [...prev.groupOrder];
      const fromIdx = order.indexOf(from);
      const toIdx = order.indexOf(to);
      if (fromIdx < 0 || toIdx < 0) return prev;
      order.splice(fromIdx, 1);
      order.splice(toIdx, 0, from);
      return { ...prev, groupOrder: order };
    });
  }, []);

  const setFrozenCount = useCallback((count: number) => {
    const max = videoColumns.length;
    const clamped = Math.max(0, Math.min(max, count));
    setState((prev) =>
      prev.frozenCount === clamped ? prev : { ...prev, frozenCount: clamped },
    );
  }, []);

  const setColumnWidth = useCallback((key: string, width: number) => {
    const w = Math.max(MIN_COLUMN_WIDTH, Math.round(width));
    setState((prev) => ({
      ...prev,
      columnWidths: { ...prev.columnWidths, [key]: w },
    }));
  }, []);

  const reset = useCallback(() => setState(initialTableLayoutState), []);

  const rendered = useMemo(() => buildRenderedColumns(state), [state]);

  return {
    state,
    rendered,
    toggleGroupCollapsed,
    moveGroup,
    setFrozenCount,
    setColumnWidth,
    reset,
  };
}

export type TableLayoutController = ReturnType<typeof useTableLayout>;
