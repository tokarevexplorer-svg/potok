import { videoColumns, columnGroupLabels, type ColumnGroup } from "@/lib/videoTableColumns";

// Шапка таблицы: верхняя строка — группы блоков, нижняя — столбцы.
// Слева — служебная колонка с чекбоксом «выбрать все на странице».

interface GroupSpan {
  group: ColumnGroup;
  span: number;
}

function getGroupSpans(): GroupSpan[] {
  const result: GroupSpan[] = [];
  for (const col of videoColumns) {
    const last = result[result.length - 1];
    if (last && last.group === col.group) {
      last.span += 1;
    } else {
      result.push({ group: col.group, span: 1 });
    }
  }
  return result;
}

interface VideoTableHeaderProps {
  // null = ни одна не выбрана, true = все, false = частично (indeterminate)
  selectionState: "none" | "all" | "some";
  onToggleAll: () => void;
}

export default function VideoTableHeader({
  selectionState,
  onToggleAll,
}: VideoTableHeaderProps) {
  const groupSpans = getGroupSpans();

  return (
    <thead className="bg-elevated/60">
      <tr className="border-b border-line">
        <th
          rowSpan={2}
          className="w-10 border-r border-line/70 px-3 py-2 align-middle"
        >
          <CheckAll state={selectionState} onToggle={onToggleAll} />
        </th>
        {groupSpans.map((g, idx) => (
          <th
            key={`${g.group}-${idx}`}
            colSpan={g.span}
            className="border-r border-line/70 px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint last:border-r-0"
          >
            {columnGroupLabels[g.group]}
          </th>
        ))}
      </tr>
      <tr className="border-b border-line-strong">
        {videoColumns.map((col) => (
          <th
            key={col.key}
            className={[
              "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold text-ink-muted",
              col.minWidth,
              col.align === "right" ? "text-right" : "",
            ].join(" ")}
          >
            {col.label}
          </th>
        ))}
      </tr>
    </thead>
  );
}

// Чекбокс с indeterminate. Стандартный input умеет показывать «частично»
// только через js-флажок, поэтому ставим ref и руками выставляем свойство.
function CheckAll({
  state,
  onToggle,
}: {
  state: "none" | "all" | "some";
  onToggle: () => void;
}) {
  return (
    <label className="inline-flex h-5 w-5 cursor-pointer items-center justify-center">
      <input
        type="checkbox"
        checked={state === "all"}
        ref={(el) => {
          if (el) el.indeterminate = state === "some";
        }}
        onChange={onToggle}
        aria-label="Выбрать все"
        className="h-4 w-4 cursor-pointer accent-accent"
      />
    </label>
  );
}
