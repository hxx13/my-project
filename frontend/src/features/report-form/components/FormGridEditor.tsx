// components/FormGridEditor.tsx
import { useCallback } from 'react';
import type { LayoutJson } from '../types';
import { useFormGridEditor } from '../hooks/useFormGridEditor';

interface Props {
  layout: LayoutJson;
  onChange: (layout: LayoutJson) => void;
}

export default function FormGridEditor({ layout, onChange }: Props) {
  const {
    layout: currentLayout, selectedCellIds, selectCell, setIsDragging,
  } = useFormGridEditor(layout);

  // Build cell map for O(1) lookup
  const cellMap = new Map<string, typeof currentLayout.cells[0]>();
  for (const cell of currentLayout.cells) {
    cellMap.set(`${cell.row},${cell.col}`, cell);
  }

  const maxRow = Math.max(...currentLayout.cells.map(c => c.row + c.rowSpan), 1);
  const maxCol = Math.max(...currentLayout.cells.map(c => c.col + c.colSpan), 1);

  const rendered = new Set<string>();

  const handleMouseDown = useCallback((cellId: string, e: React.MouseEvent) => {
    selectCell(cellId, e.shiftKey);
    if (!e.shiftKey) setIsDragging(true);
  }, [selectCell, setIsDragging]);

  const handleMouseEnter = useCallback((cellId: string, e: React.MouseEvent) => {
    if (e.buttons === 1) {
      selectCell(cellId, true);
    }
  }, [selectCell]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, [setIsDragging]);

  return (
    <div
      className="overflow-auto border border-[var(--app-color-border-default)] rounded-[var(--app-radius-container)]"
      onMouseUp={handleMouseUp}
    >
      <table className="border-collapse" style={{ tableLayout: 'fixed' }}>
        <tbody>
          {Array.from({ length: maxRow }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: maxCol }, (_, c) => {
                const key = `${r},${c}`;
                if (rendered.has(key)) return null;
                const cell = cellMap.get(key);
                if (!cell) {
                  return (
                    <td key={key} className="border border-[var(--app-color-border-default)] min-w-[80px] h-[32px]" />
                  );
                }
                // Mark the occupied region
                for (let dr = 0; dr < cell.rowSpan; dr++) {
                  for (let dc = 0; dc < cell.colSpan; dc++) {
                    rendered.add(`${r + dr},${c + dc}`);
                  }
                }
                const isSelected = selectedCellIds.has(cell.id);
                return (
                  <td
                    key={cell.id}
                    colSpan={cell.colSpan}
                    rowSpan={cell.rowSpan}
                    className={`border border-[var(--app-color-border-default)] p-[var(--app-space-container-padding)] cursor-pointer transition-colors min-w-[80px] ${
                      isSelected
                        ? 'bg-[var(--app-color-accent-soft)] outline outline-2 outline-[var(--app-color-accent)] outline-offset-[-2px]'
                        : 'hover:bg-[var(--app-color-surface-hover)]'
                    }`}
                    style={{
                      textAlign: cell.style.align,
                      fontWeight: cell.style.bold ? 'bold' : 'normal',
                      fontSize: cell.style.fontSize ? `${cell.style.fontSize}px` : undefined,
                      backgroundColor: isSelected ? undefined : (cell.style.bg || 'transparent'),
                    }}
                    onMouseDown={(e) => handleMouseDown(cell.id, e)}
                    onMouseEnter={(e) => handleMouseEnter(cell.id, e)}
                  >
                    {cell.kind === 'static'
                      ? (cell.staticText || ' ')
                      : (
                        <span className="text-[var(--app-color-accent)] font-medium">
                          {currentLayout.fields[cell.fieldKey!]?.label || cell.fieldKey}
                        </span>
                      )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
