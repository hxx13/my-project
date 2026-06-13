import { useCallback, useMemo } from 'react';
import type { LayoutJson, GridCell } from '../types';

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
}

/** 获取格子的显示文本（静态文本或字段标签） */
function getCellDisplayText(cell: GridCell, fields: Record<string, { label?: string }>): string {
  if (cell.kind === 'static') return cell.staticText || '';
  const field = cell.fieldKey ? fields[cell.fieldKey] : null;
  return field?.label || cell.fieldKey || '';
}

/** 计算列宽：取每列最长文本宽度（中文≈14px，英文≈8px），最少80px */
function calcColumnWidths(cells: GridCell[], fields: Record<string, { label?: string }>, maxCol: number): Map<number, number> {
  const colTexts = new Map<number, string[]>();
  for (const cell of cells) {
    const text = getCellDisplayText(cell, fields);
    // 对于 rowSpan>1 的合并格，文本宽度应分摊到所占列
    const perColText = cell.colSpan > 1 ? text : text;
    for (let c = cell.col; c < cell.col + cell.colSpan; c++) {
      if (!colTexts.has(c)) colTexts.set(c, []);
      colTexts.get(c)!.push(cell.colSpan > 1 ? '' : perColText);
    }
    // 对于合并格，把完整文本放到第一列
    if (cell.colSpan > 1) {
      const firstCol = colTexts.get(cell.col);
      if (firstCol) firstCol.push(text);
    }
  }
  const widths = new Map<number, number>();
  for (let c = 0; c < maxCol; c++) {
    const texts = colTexts.get(c) || [];
    const maxLen = Math.max(...texts.map(t => {
      let len = 0;
      for (const ch of t) {
        len += /[一-鿿　-〿＀-￯]/.test(ch) ? 14 : 8;
      }
      return len;
    }), 0);
    widths.set(c, Math.max(80, Math.min(maxLen + 24, 400)));
  }
  return widths;
}

export default function FormGridEditor({ layout, selectedCellIds, editingCellId, editingText, onCellMouseDown, onCellMouseEnter, onMouseUp, onCellDoubleClick, onEditingTextChange, onEditingCommit }: Props) {
  const cells = layout.cells;

  // 构建格子查找表
  const cellMap = useMemo(() => {
    const map = new Map<string, GridCell>();
    for (const cell of cells) map.set(`${cell.row},${cell.col}`, cell);
    return map;
  }, [cells]);

  const fields = layout.fields || {};
  const maxRow = useMemo(() => Math.max(...cells.map(c => c.row + c.rowSpan), 0), [cells]);
  const maxCol = useMemo(() => Math.max(...cells.map(c => c.col + c.colSpan), 0), [cells]);
  const colWidths = useMemo(() => calcColumnWidths(cells, fields, maxCol), [cells, fields, maxCol]);

  return (
    <div
      className="overflow-auto border border-[var(--app-color-border-default)] rounded-[var(--app-radius-container)] select-none"
      onMouseUp={onMouseUp}
    >
      <table className="border-collapse">
        <tbody>
          {Array.from({ length: maxRow }, (_, r) => {
            const rowCells = cells.filter(c => c.row <= r && r < c.row + c.rowSpan);
            const minRowHeight = Math.max(...rowCells.map(c => {
              const text = c.staticText || '';
              return text.length > 0 ? 28 : 22;
            }), 24);
            return (
              <tr key={r} style={{ height: minRowHeight }}>
                {Array.from({ length: maxCol }, (_, c) => {
                  const key = `${r},${c}`;
                  const cell = cellMap.get(key);

                  // 是否为合并格子的被覆盖区域
                  if (!cell) {
                    // 检查是否被 rowSpan/colSpan 覆盖
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
                      <td key={key}
                        className="border border-[var(--app-color-border-default)]"
                        style={{ width: colWidths.get(c) || 80, minWidth: 60, height: '100%' }}
                      />
                    );
                  }

                  const isSelected = selectedCellIds.has(cell.id);
                  // 合并单元格宽度 = 所有跨列宽度的总和
                  let width = 0;
                  for (let cc = cell.col; cc < cell.col + cell.colSpan; cc++) {
                    width += colWidths.get(cc) || 80;
                  }
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
                      }`}
                      style={{
                        width,
                        minWidth: 60,
                        textAlign: cell.style.align,
                        fontWeight: cell.style.bold ? 'bold' : 'normal',
                        fontSize: cell.style.fontSize ? `${cell.style.fontSize}px` : '13px',
                        backgroundColor: isSelected ? undefined : (cell.style.bg || 'transparent'),
                        verticalAlign: 'middle',
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault(); // 阻止文字选中
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
                        className="w-full min-w-[120px] min-h-[40px] resize border border-[var(--app-color-accent)] rounded-[4px] px-2 py-1 text-[13px] bg-[var(--app-color-surface-page)] text-[var(--app-color-text-primary)] outline-none"
                      />
                    ) : (
                      <span className="whitespace-pre-wrap break-words">
                        {cell.kind === 'static'
                          ? (cell.staticText || '')
                          : cell.fieldKey ? (
                            <span className="text-[var(--app-color-accent)] font-medium">
                              {layout.fields[cell.fieldKey]?.label || cell.fieldKey}
                            </span>
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
