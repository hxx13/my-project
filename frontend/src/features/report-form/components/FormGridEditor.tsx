import { useMemo } from 'react';
import type { LayoutJson, ThemeJson, CellAlign } from '../types';
import { MIN_READABLE_COL_WIDTH } from '../utils/gridColumnWidths';
import { resolveWebGridDimensions, rowSpanTotalHeight } from '../utils/resolveWebGridDimensions';
import { useWordTableContainerWidth } from '../hooks/useWordTableContainerWidth';
import { isDesignInteractiveTarget } from '../utils/designGridInteraction';
import DesignFieldPreview, { DesignFieldCompact } from './DesignFieldPreview';
import { StaticCellContent } from './StaticCellContent';
import { GRID_CELL_TD_CLASS, GRID_CELL_CONTENT_CLASS, gridCellContentAlignClass, gridCellMinHeight, gridCellFixedHeight, cellTextClass, cellTextTitle, resolveCellAlign, cellTextAlignStyle } from '../utils/gridCellLayout';

export interface CellMouseDownOptions {
  /** 点击预览控件：仅选中格子，不启动拖选 */
  previewInteraction?: boolean;
}

interface Props {
  layout: LayoutJson;
  selectedCellIds: Set<string>;
  editingCellId: string | null;
  editingText: string;
  onCellMouseDown: (cellId: string, e: React.MouseEvent, options?: CellMouseDownOptions) => void;
  onCellMouseEnter: (cellId: string, e: React.MouseEvent) => void;
  onMouseUp: () => void;
  onCellDoubleClick: (cellId: string) => void;
  onEditingTextChange: (text: string) => void;
  onEditingCommit: () => void;
  /** 点击格子内预览控件时选中该格（不启动拖选） */
  onPreviewCellFocus?: (cellId: string, shiftKey: boolean) => void;
  columnWidths?: Record<number, number>;
  rowHeights?: Record<number, number>;
  autoFitVersion?: number;
  /** word：网页展示专用尺寸，不写入导出模板 */
  formSource?: string;
  defaultAlign?: CellAlign;
}

function isStaticCell(cell: LayoutJson['cells'][0], fields: LayoutJson['fields']): boolean {
  if (cell.kind === 'static') return true;
  const field = cell.fieldKey ? fields[cell.fieldKey] : null;
  return field?.type === 'STATIC';
}

function staticDisplayText(cell: LayoutJson['cells'][0], fields: LayoutJson['fields']): string {
  if (cell.kind === 'static') return cell.staticText || '';
  const field = cell.fieldKey ? fields[cell.fieldKey] : null;
  return field?.label || cell.staticText || '';
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
  onPreviewCellFocus,
  columnWidths,
  rowHeights,
  autoFitVersion,
  formSource,
  defaultAlign = 'center',
}: Props) {
  const cells = layout.cells;
  const { containerRef, containerWidth } = useWordTableContainerWidth(true);

  const cellMap = useMemo(() => {
    const map = new Map<string, typeof cells[0]>();
    for (const cell of cells) map.set(`${cell.row},${cell.col}`, cell);
    return map;
  }, [cells]);

  const fields = layout.fields || {};
  const maxRow = useMemo(() => Math.max(...cells.map(c => c.row + c.rowSpan), 0), [cells]);

  const themeForResolve = useMemo((): ThemeJson => ({
    headerBg: '', headerColor: '', headerFontSize: 13, headerBold: true, headerAlign: 'center',
    zebraStripe: false, oddRowBg: '', evenRowBg: '', borderWidth: 1, borderColor: '',
    borderRadius: 8, cellPadding: 8, defaultFontSize: 13, defaultAlign: 'center',
    columnWidths: columnWidths ?? {},
    rowHeights: rowHeights ?? {},
  }), [columnWidths, rowHeights]);

  const { colWidths, rowHeightMap, totalWidth, displayMaxCol, strictRowHeight } = useMemo(
    () => resolveWebGridDimensions(
      { cells, fields, mergeGroups: layout.mergeGroups ?? [] },
      themeForResolve,
      {
        formSource,
        containerWidth: containerWidth > 0 ? containerWidth : undefined,
        constrainLayout: true,
        designLayout: true,
      },
    ),
    [cells, fields, layout.mergeGroups, themeForResolve, formSource, containerWidth, autoFitVersion],
  );
  const maxCol = displayMaxCol;

  const handleFocusCell = (cellId: string, shiftKey: boolean) => {
    onPreviewCellFocus?.(cellId, shiftKey);
  };

  const tableEl = (
      <table
        className="border-collapse overflow-visible"
        style={{
          tableLayout: 'fixed',
          width: totalWidth,
          minWidth: totalWidth,
        }}
      >
        {maxCol > 0 && (
          <colgroup>
            {Array.from({ length: maxCol }, (_, c) => (
              <col key={c} style={{ width: `${colWidths.get(c) ?? MIN_READABLE_COL_WIDTH}px` }} />
            ))}
          </colgroup>
        )}
        <tbody>
          {Array.from({ length: maxRow }, (_, r) => {
            const rowH = rowHeightMap.get(r) || 32;
            return (
            <tr key={r} style={strictRowHeight ? { height: rowH } : undefined}>
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
                      className={`border border-[var(--app-color-border-default)] ${GRID_CELL_TD_CLASS}`}
                      style={strictRowHeight
                        ? { height: rowH, minHeight: rowH }
                        : { minHeight: rowH }}
                    />
                  );
                }

                const isSelected = selectedCellIds.has(cell.id);
                const staticCell = isStaticCell(cell, fields);
                const isEditing = editingCellId === cell.id && staticCell;
                const fieldDef = cell.fieldKey ? fields[cell.fieldKey] : null;

                const hasFieldPreview = !staticCell && !!cell.fieldKey;
                const selectedTdClass = isSelected
                  ? hasFieldPreview
                    ? 'bg-[var(--app-color-accent-soft)] outline outline-2 outline-[var(--app-color-accent)] outline-offset-[-2px] relative z-[var(--z-dropdown)]'
                    : 'bg-[var(--app-color-accent-soft)] outline outline-2 outline-[var(--app-color-accent)] outline-offset-[-2px] relative z-[1]'
                  : 'hover:bg-[var(--app-color-surface-hover)]';

                const cellH = strictRowHeight
                  ? gridCellFixedHeight(rowSpanTotalHeight(cell.row, cell.rowSpan, rowHeightMap))
                  : gridCellMinHeight(rowH, cell.rowSpan);

                const cellAlign = resolveCellAlign(cell.style.align, defaultAlign);

                return (
                  <td
                    key={cell.id}
                    colSpan={cell.colSpan}
                    rowSpan={cell.rowSpan}
                    className={`border border-[var(--app-color-border-default)] p-1.5 cursor-cell transition-colors ${GRID_CELL_TD_CLASS} ${selectedTdClass} ${isEditing ? 'relative z-[var(--z-dropdown)]' : ''}`}
                    style={{
                      ...(strictRowHeight ? { height: cellH, minHeight: cellH, maxHeight: cellH } : { minHeight: cellH }),
                      textAlign: cellTextAlignStyle(cellAlign),
                      fontWeight: cell.style.bold ? 'bold' : 'normal',
                      fontSize: cell.style.fontSize ? `${cell.style.fontSize}px` : '13px',
                      color: cell.style.color || undefined,
                      backgroundColor: isSelected ? undefined : (cell.style.bg || 'transparent'),
                      verticalAlign: 'middle',
                    }}
                    onMouseDown={(e) => {
                      if (isEditing) return;
                      // 预览控件区域完全交给 DesignFieldPreview，不在 td 层抢事件
                      if (isDesignInteractiveTarget(e.target)) return;
                      onCellMouseDown(cell.id, e);
                    }}
                    onMouseEnter={(e) => {
                      if (isDesignInteractiveTarget(e.target)) return;
                      onCellMouseEnter(cell.id, e);
                    }}
                    onDoubleClick={(e) => {
                      if (isDesignInteractiveTarget(e.target)) return;
                      onCellDoubleClick(cell.id);
                    }}
                  >
                    <div className={`${GRID_CELL_CONTENT_CLASS} ${gridCellContentAlignClass(cellAlign)}`}>
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
                        onPointerDown={e => e.stopPropagation()}
                        onMouseDown={e => e.stopPropagation()}
                        className="absolute inset-0 z-[var(--z-dropdown)] w-full max-w-full min-h-[60px] resize-none box-border
                                   rounded-[var(--app-radius-container)] border-2 border-[var(--app-color-accent)]
                                   px-3 py-2 text-[13px] bg-[var(--app-color-surface-elevated)]
                                   text-[var(--app-color-text-primary)] outline-none shadow-lg"
                        style={{ height: '100%' }}
                      />
                    ) : staticCell ? (
                      cell.style.imageSrc ? (
                        <StaticCellContent
                          text={staticDisplayText(cell, fields)}
                          style={cell.style}
                        />
                      ) : (
                      <span
                        className={cellTextClass(staticDisplayText(cell, fields), cell.style.fontSize ?? 13, cell.style.bold)}
                        title={cellTextTitle(staticDisplayText(cell, fields))}
                      >
                        {staticDisplayText(cell, fields)}
                      </span>
                      )
                    ) : cell.fieldKey ? (
                      isSelected ? (
                      <DesignFieldPreview
                        key={`${cell.id}-${fieldDef?.type}-${fieldDef?.label ?? ''}-${JSON.stringify(fieldDef?.options?.map(o => o.label))}-${fieldDef?.optionSetId}`}
                        cellId={cell.id}
                        cellAlign={cellAlign}
                        field={fieldDef || { type: 'TEXT', label: cell.fieldKey }}
                        fields={fields}
                        onFocusCell={handleFocusCell}
                      />
                      ) : (
                      <DesignFieldCompact field={fieldDef || { type: 'TEXT', label: cell.fieldKey }} cellAlign={cellAlign} />
                      )
                    ) : (
                      <span className="text-[var(--app-color-text-tertiary)] italic text-xs">未设置</span>
                    )}
                    </div>
                  </td>
                );
              })}
            </tr>
            );
          })}
        </tbody>
      </table>
  );

  return (
    <div
      ref={containerRef}
      className="w-full overflow-auto border border-[var(--app-color-border-default)] rounded-[var(--app-radius-container)] select-none"
      onMouseUp={onMouseUp}
    >
      <div
        className="flex justify-center w-full"
        style={{ minWidth: totalWidth > containerWidth && containerWidth > 0 ? totalWidth : undefined }}
      >
        <div className="shrink-0" style={{ width: totalWidth }}>
          {tableEl}
        </div>
      </div>
    </div>
  );
}
