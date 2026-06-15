import { useMemo } from 'react';
import type { LayoutJson } from '../types';
import {
  calcColumnWidths,
  mergeColumnWidths,
  sumColumnWidths,
} from '../utils/gridColumnWidths';

interface Props {
  layout: LayoutJson;
  selectedCellIds: Set<string>;
  editingCellId: string | null;
  editingText: string;
  onCellMouseDown: (cellId: string, e: React.MouseEvent) => void;
  onCellMouseEnter: (cellId: string, e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onCellDoubleClick: (cellId: string) => void;
  onEditingTextChange: (text: string) => void;
  onEditingCommit: () => void;
  /** 主题中已保存的列宽（px） */
  columnWidths?: Record<number, number>;
  autoFitVersion?: number;
}

/** 渲染字段类型的编辑器预览控件（纯视觉，无原生表单元素，不拦截鼠标事件） */
function renderFieldTypePreview(
  field: { type: string; label?: string; options?: { label: string; value: string }[] },
  _cell: unknown,
): React.ReactNode {
  const box = 'inline-flex items-center justify-center rounded-[3px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-container)] text-[10px] text-[var(--app-color-text-tertiary)]';
  switch (field.type) {
    case 'BOOLEAN':
      return <span className={`${box} w-4 h-4 text-[8px]`}>✓</span>;
    case 'SELECT':
      return (
        <span className={`${box} px-2 py-1 gap-1 text-[10px]`}>
          <span>— 请选择 —</span>
          <span className="ml-1">▾</span>
        </span>
      );
    case 'MULTI_SELECT':
      return (
        <span className={`${box} px-2 py-1 gap-1 text-[10px]`}>
          <span>— 多选 —</span>
          <span className="ml-1">▾</span>
        </span>
      );
    case 'IMAGE':
      return <span className={`${box} w-8 h-8 border-dashed text-[12px]`}>🖼</span>;
    case 'FILE':
      return <span className={`${box} w-8 h-8 border-dashed text-[12px]`}>📎</span>;
    case 'USER':
      return <span className="text-[11px] text-[var(--app-color-text-tertiary)]">👤 人员</span>;
    case 'AUTO_USER':
      return <span className="text-[11px] italic text-[var(--app-color-text-tertiary)]">🕒 自动</span>;
    case 'TEXT':
      return <span className="text-[11px] text-[var(--app-color-text-tertiary)]">Aa 文本</span>;
    case 'NUMBER':
      return <span className="text-[11px] text-[var(--app-color-text-tertiary)]">123 数字</span>;
    case 'DATETIME':
      return <span className="text-[11px] text-[var(--app-color-text-tertiary)]">📅 日期</span>;
    default:
      return <span className="text-[11px] text-[var(--app-color-text-tertiary)]">字段</span>;
  }
}

export default function FormGridEditor({
  layout,
  selectedCellIds,
  editingCellId,
  editingText,
  onCellMouseDown,
  onCellMouseEnter,
  onMouseUp,
  onCellDoubleClick,
  onEditingTextChange,
  onEditingCommit,
  columnWidths,
  autoFitVersion,
}: Props) {
  const cells = layout.cells;

  const cellMap = useMemo(() => {
    const map = new Map<string, typeof cells[0]>();
    for (const cell of cells) map.set(`${cell.row},${cell.col}`, cell);
    return map;
  }, [cells]);

  const fields = layout.fields || {};
  const maxRow = useMemo(() => Math.max(...cells.map(c => c.row + c.rowSpan), 0), [cells]);
  const maxCol = useMemo(() => Math.max(...cells.map(c => c.col + c.colSpan), 0), [cells]);

  const colWidths = useMemo(() => {
    const computed = calcColumnWidths(cells, fields, maxCol);
    return mergeColumnWidths(computed, columnWidths);
  }, [cells, fields, maxCol, columnWidths, autoFitVersion]);

  const totalWidth = useMemo(() => sumColumnWidths(colWidths), [colWidths]);

  return (
    <div
      className="w-full overflow-auto border border-[var(--app-color-border-default)] rounded-[var(--app-radius-container)] select-none"
      onMouseUp={onMouseUp}
    >
      <table
        className="border-collapse"
        style={{ tableLayout: 'fixed', width: '100%', minWidth: totalWidth }}
      >
        {maxCol > 0 && (
          <colgroup>
            {Array.from({ length: maxCol }, (_, c) => (
              <col key={c} style={{ width: `${colWidths.get(c) || 40}px` }} />
            ))}
          </colgroup>
        )}
        <tbody>
          {Array.from({ length: maxRow }, (_, r) => {
            const rowCells = cells.filter(c => c.row <= r && r < c.row + c.rowSpan);
            const minRowHeight = Math.max(...rowCells.map(c => {
              const text = c.staticText || '';
              return text.length > 0 ? 28 : 22;
            }), 24);
            return (
              <tr key={r} style={{ minHeight: minRowHeight }}>
                {Array.from({ length: maxCol }, (_, c) => {
                  const key = `${r},${c}`;
                  const cell = cellMap.get(key);

                  if (!cell) {
                    let covered = false;
                    for (const [anchorKey, anchorCell] of cellMap) {
                      const [ar, ac] = anchorKey.split(',').map(Number);
                      if (r >= ar && r < ar + anchorCell.rowSpan && c >= ac && c < ac + anchorCell.colSpan && !(r === ar && c === ac)) {
                        covered = true;
                        break;
                      }
                    }
                    if (covered) return null;
                    return (
                      <td
                        key={key}
                        className="border border-[var(--app-color-border-default)]"
                        style={{ height: '100%' }}
                      />
                    );
                  }

                  const isSelected = selectedCellIds.has(cell.id);
                  const isEditing = editingCellId === cell.id && cell.kind === 'static';

                  return (
                    <td
                      key={cell.id}
                      colSpan={cell.colSpan}
                      rowSpan={cell.rowSpan}
                      className={`border border-[var(--app-color-border-default)] p-1.5 cursor-cell transition-colors ${
                        isSelected
                          ? 'bg-[var(--app-color-accent-soft)] outline outline-2 outline-[var(--app-color-accent)] outline-offset-[-2px]'
                          : 'hover:bg-[var(--app-color-surface-hover)]'
                      } ${isEditing ? 'overflow-visible relative z-[var(--z-dropdown)]' : ''}`}
                      style={{
                        textAlign: cell.style.align,
                        fontWeight: cell.style.bold ? 'bold' : 'normal',
                        fontSize: cell.style.fontSize ? `${cell.style.fontSize}px` : '13px',
                        color: cell.style.color || undefined,
                        backgroundColor: isSelected ? undefined : (cell.style.bg || 'transparent'),
                        verticalAlign: 'middle',
                      }}
                      onMouseDown={(e) => {
                        if (isEditing) return;
                        onCellMouseDown(cell.id, e);
                      }}
                      onMouseEnter={(e) => onCellMouseEnter(cell.id, e)}
                      onDoubleClick={() => onCellDoubleClick(cell.id)}
                    >
                      {isEditing ? (
                        <textarea
                          autoFocus
                          value={editingText}
                          onChange={e => onEditingTextChange(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEditingCommit(); }
                            if (e.key === 'Escape') onEditingCommit();
                          }}
                          onBlur={onEditingCommit}
                          className="absolute top-0 left-0 z-[var(--z-dropdown)] min-w-[200px] min-h-[60px] resize
                                     rounded-[var(--app-radius-container)] border-2 border-[var(--app-color-accent)]
                                     px-3 py-2 text-[13px] bg-[var(--app-color-surface-elevated)]
                                     text-[var(--app-color-text-primary)] outline-none shadow-lg"
                          style={{ width: 'max(200px, 100%)', height: 'max(60px, 100%)' }}
                        />
                      ) : (
                        <span className={
                          (cell.kind === 'static' && cell.staticText?.includes('\n'))
                            ? 'whitespace-pre-wrap block'
                            : 'whitespace-nowrap block'
                        }>
                          {cell.kind === 'static'
                            ? (cell.staticText || '')
                            : cell.fieldKey ? (
                              renderFieldTypePreview(
                                layout.fields[cell.fieldKey] || { type: 'TEXT', label: cell.fieldKey },
                                cell,
                              )
                            ) : (
                              <span className="text-[var(--app-color-text-tertiary)] italic text-xs">未设置</span>
                            )}
                        </span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
