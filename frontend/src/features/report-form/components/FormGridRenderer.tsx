// components/FormGridRenderer.tsx
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { LayoutJson, FieldDefinition, PermissionJson, ThemeJson } from '../types';
import { MIN_READABLE_COL_WIDTH, sumSpanColumnWidths } from '../utils/gridColumnWidths';
import {
  resolveWebGridDimensions,
  rowSpanTotalHeight,
} from '../utils/resolveWebGridDimensions';
import {
  GRID_CELL_TD_CLASS,
  GRID_CELL_CONTENT_CLASS,
  gridCellContentAlignClass,
  gridCellMinHeight,
  gridCellFixedHeight,
  cellTextClass,
  cellTextTitle,
  GRID_CELL_INPUT_CLASS,
  GRID_CELL_TEXTAREA_CLASS,
  fillTextareaRows,
  resolveCellAlign,
  gridCellFlexJustifyClass,
  cellTextAlignStyle,
} from '../utils/gridCellLayout';
import { formatFillFieldDisplayText, fillFieldHasMediaValue } from '../utils/fillFieldDisplay';
import { useWordTableContainerWidth } from '../hooks/useWordTableContainerWidth';
import UserSelector from './UserSelector';
import { GridCellDatetimeField } from './GridCellDatetimeField';
import {
  GridCellFileField,
  GridCellFileReadonly,
  GridCellImageField,
  GridCellImageReadonly,
} from './GridCellMediaFields';
import { GridCellMultiSelectField, GridCellSelectField } from './GridCellSelectFields';
import { FillCellTextBox, fillTextareaBoxStyle } from './FillCellTextBox';
import { StaticCellContent } from './StaticCellContent';
import { Check } from 'lucide-react';
import { useOptionSetMap } from '../hooks/useOptionSetMap';
import { resolveFieldOptions } from '../utils/optionSetResolve';

interface Props {
  layout: LayoutJson | string;
  themeJson?: ThemeJson | string;
  values: Record<string, unknown>;
  editable: boolean;
  onChange?: (fieldKey: string, value: unknown) => void;
  userRoles?: string[];
  permissionJson?: PermissionJson;
  /** word：网页展示专用行高/列宽（不影响 Word 导出） */
  formSource?: string;
}

function parseThemeJson(raw: unknown): ThemeJson {
  const fallback: ThemeJson = {
    headerBg: '', headerColor: '', headerFontSize: 13, headerBold: true, headerAlign: 'center',
    zebraStripe: false, oddRowBg: '', evenRowBg: '', borderWidth: 1, borderColor: '',
    borderRadius: 8, cellPadding: 8, defaultFontSize: 13, defaultAlign: 'center',
    columnWidths: {}, rowHeights: {},
  };
  if (!raw) return fallback;
  if (typeof raw === 'string') {
    try { return { ...fallback, ...JSON.parse(raw) }; } catch { return fallback; }
  }
  return { ...fallback, ...(raw as ThemeJson) };
}

/** 后端返回的 layoutJson 可能是字符串，统一解析为对象 */
export function parseLayoutJson(raw: unknown): LayoutJson {
  if (!raw) return { cells: [], fields: {}, mergeGroups: [] };
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return { cells: [], fields: {}, mergeGroups: [] }; }
  }
  return raw as LayoutJson;
}

export default function FormGridRenderer({ layout: rawLayout, themeJson, values, editable, onChange, userRoles = [], permissionJson, formSource }: Props) {
  const layout = parseLayoutJson(rawLayout);
  const theme = parseThemeJson(themeJson);
  const { containerRef, containerWidth } = useWordTableContainerWidth(true);
  const [activeCellId, setActiveCellId] = useState<string | null>(null);
  const activeCellIdRef = useRef(activeCellId);
  activeCellIdRef.current = activeCellId;

  const cellMap = useMemo(() => {
    const map = new Map<string, typeof layout.cells[0]>();
    for (const cell of layout.cells) map.set(`${cell.row},${cell.col}`, cell);
    return map;
  }, [layout.cells]);

  const fields = layout.fields || {};
  const { optionsSetMap } = useOptionSetMap(fields);

  const getFieldOptions = useCallback(
    (field: FieldDefinition) => resolveFieldOptions(field, optionsSetMap),
    [optionsSetMap],
  );

  const fillMeasure = useMemo(
    () => ({ values, getFieldOptions }),
    [values, getFieldOptions],
  );

  const { colWidths, baseColWidths, rowHeightMap, totalWidth, displayMaxCol, strictRowHeight, allowCellGrow } = useMemo(
    () => resolveWebGridDimensions(layout, theme, {
      formSource,
      containerWidth: containerWidth > 0 ? containerWidth : undefined,
      constrainLayout: true,
      fillMeasure,
    }),
    [layout, theme, formSource, containerWidth, fillMeasure],
  );
  const maxCol = displayMaxCol;
  const maxRow = Math.max(...layout.cells.map(c => c.row + c.rowSpan), 1);

  const cellSpanWidth = useCallback((col: number, colSpan: number) =>
    sumSpanColumnWidths(col, colSpan, colWidths), [colWidths]);

  const cellSpanBaseWidth = useCallback((col: number, colSpan: number) =>
    sumSpanColumnWidths(col, colSpan, baseColWidths), [baseColWidths]);

  useEffect(() => {
    if (!editable || !fillMeasure) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (!activeCellIdRef.current) return;
      const root = containerRef.current;
      if (root && !root.contains(e.target as Node)) {
        setActiveCellId(null);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [editable, fillMeasure, containerRef]);

  useEffect(() => {
    if (!activeCellId) return;
    const root = containerRef.current;
    if (!root) return;
    const td = root.querySelector(`[data-fill-cell-id="${activeCellId}"]`);
    const focusable = td?.querySelector<HTMLElement>(
      'textarea, input, button, select, [tabindex]:not([tabindex="-1"])',
    );
    focusable?.focus();
  }, [activeCellId, containerRef]);

  const rendered = new Set<string>();

  const canEditField = (field: FieldDefinition, fieldKey?: string): boolean => {
    if (field.type === 'STATIC') return false;
    if (!editable) return false;
    if (field.editableInFill === false) return false;

    if (fieldKey && permissionJson) {
      const bindings = (permissionJson as unknown as Record<string, unknown>).fieldRoleBindings as Record<string, { editableByRoles?: string[] }> | undefined;
      if (bindings?.[fieldKey]?.editableByRoles?.length) {
        return bindings[fieldKey].editableByRoles!.some(r => userRoles.includes(r));
      }
    }

    const roles = field.editableByRoles || [];
    if (roles.length === 0) return true;
    if (userRoles.length === 0) return false;
    return roles.some(r => userRoles.includes(r));
  };

  const toBoolean = (v: unknown): boolean => {
    if (v === null || v === undefined) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v !== '' && v !== 'false' && v !== '0';
    if (typeof v === 'number') return v !== 0;
    return !!v;
  };

  const toArray = (v: unknown): string[] => {
    if (Array.isArray(v)) return v as string[];
    if (typeof v === 'string' && v.startsWith('[')) {
      try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
    }
    return v != null ? [String(v)] : [];
  };

  const renderFillDisplay = (
    cell: typeof layout.cells[0],
    field: FieldDefinition,
    value: unknown,
  ) => {
    const fontSize = cell.style.fontSize ?? 13;
    const colW = cellSpanWidth(cell.col, cell.colSpan);
    const baseW = cellSpanBaseWidth(cell.col, cell.colSpan);

    if (field.type === 'IMAGE' && fillFieldHasMediaValue(field, value)) {
      return <GridCellImageReadonly value={value} />;
    }
    if (field.type === 'FILE' && fillFieldHasMediaValue(field, value)) {
      return <GridCellFileReadonly value={value} />;
    }

    const displayValue = formatFillFieldDisplayText(field, value, getFieldOptions);
    return (
      <FillCellTextBox
        text={displayValue}
        colWidth={colW}
        baseColWidth={baseW}
        fontSize={fontSize}
        bold={cell.style.bold}
        className="text-xs text-[var(--app-color-text-primary)]"
      />
    );
  };

  const renderFieldControl = (
    cell: typeof layout.cells[0],
    field: FieldDefinition,
    value: unknown,
    isActive: boolean,
  ) => {
    const fieldKey = cell.fieldKey;
    const fontSize = cell.style.fontSize ?? 13;
    const colW = cellSpanWidth(cell.col, cell.colSpan);
    const baseW = cellSpanBaseWidth(cell.col, cell.colSpan);
    const cellAlign = resolveCellAlign(cell.style.align, theme.defaultAlign);
    const textAlignStyle = cellTextAlignStyle(cellAlign);

    if (field.type === 'STATIC') {
      const text = field.label || cell.staticText || '';
      if (fillMeasure) {
        return (
          <FillCellTextBox
            text={text}
            colWidth={colW}
            baseColWidth={baseW}
            fontSize={fontSize}
            bold={cell.style.bold}
            className="text-xs text-[var(--app-color-text-primary)]"
          />
        );
      }
      return (
        <span
          className={`text-xs text-[var(--app-color-text-primary)] ${cellTextClass(text, fontSize, cell.style.bold)}`}
          title={cellTextTitle(text)}
        >
          {text || '\u00a0'}
        </span>
      );
    }
    const canEdit = canEditField(field, fieldKey);
    if (!fieldKey) return <span className="text-xs text-[var(--app-color-text-tertiary)]">—</span>;

    const inlineInputClass = GRID_CELL_INPUT_CLASS + ' border-transparent bg-transparent hover:border-[var(--app-color-border)] hover:bg-[var(--app-color-surface-hover)] focus:border-[var(--app-color-accent)] focus:bg-[var(--app-color-surface-page)] transition-colors';

    if (!canEdit || (fillMeasure && editable && !isActive)) {
      if (fillMeasure) {
        return renderFillDisplay(cell, field, value);
      }
      let displayValue: string;
      if (field.type === 'BOOLEAN') {
        displayValue = toBoolean(value) ? '✓ 是' : '✗ 否';
      } else if (field.type === 'MULTI_SELECT') {
        const arr = toArray(value);
        const opts = getFieldOptions(field);
        displayValue = arr.length > 0
          ? arr.map(v => opts.find(o => o.value === v)?.label ?? v).join('、')
          : '';
      } else if (field.type === 'SELECT') {
        const opts = getFieldOptions(field);
        const val = String(value ?? '');
        displayValue = opts.find(o => o.value === val)?.label || val;
      } else if (field.type === 'IMAGE' && value && value !== 'null') {
        return <GridCellImageReadonly value={value} />;
      } else if (field.type === 'FILE' && value && value !== 'null') {
        return <GridCellFileReadonly value={value} />;
      } else if (field.type === 'NUMBER') {
        const n = value != null && value !== '' && value !== 'null' ? Number(value) : NaN;
        displayValue = !isNaN(n) ? String(n) : '';
      } else {
        const isEmpty = value == null || value === '' || value === 'null';
        displayValue = isEmpty ? '' : String(value);
      }
      return (
        <span
          className={`text-xs text-[var(--app-color-text-secondary)] ${cellTextClass(displayValue, fontSize, cell.style.bold)}`}
          title={cellTextTitle(displayValue)}
        >
          {displayValue || '\u00a0'}
        </span>
      );
    }

    switch (field.type) {
      case 'TEXT': {
        const hint = field.maxLength ? `文本 · 最长${field.maxLength}字` : '文本';
        const strVal = String(value ?? '');
        return (
          <textarea
            value={strVal}
            rows={fillMeasure
              ? fillTextareaRows(strVal, colW, baseW, 12, cell.style.bold)
              : 1}
            onChange={e => onChange?.(fieldKey, e.target.value)}
            onBlur={e => {
              if (!field.maxLength) return;
              const v = e.target.value;
              if (v.length > field.maxLength) onChange?.(fieldKey, '');
            }}
            onMouseDown={e => e.stopPropagation()}
            onClick={e => e.stopPropagation()}
            className={GRID_CELL_TEXTAREA_CLASS + ' border-transparent bg-transparent hover:border-[var(--app-color-border)] hover:bg-[var(--app-color-surface-hover)] focus:border-[var(--app-color-accent)] focus:bg-[var(--app-color-surface-page)] transition-colors'}
            style={{ ...(fillMeasure ? fillTextareaBoxStyle(strVal, colW, baseW, 12, cell.style.bold) : undefined), textAlign: textAlignStyle }}
            placeholder={hint}
          />
        );
      }
      case 'NUMBER': {
        const numVal = value != null && value !== '' && value !== 'null'
          ? Number(value) : undefined;
        const display = numVal != null && !isNaN(numVal) ? String(numVal) : '';
        const parts: string[] = ['数字'];
        if (field.min != null && field.max != null) parts.push(`${field.min}~${field.max}`);
        else if (field.min != null) parts.push(`≥${field.min}`);
        else if (field.max != null) parts.push(`≤${field.max}`);
        return (
          <input type="number" value={display}
            onChange={e => {
              const v = e.target.value;
              onChange?.(fieldKey, v === '' ? undefined : Number(v));
            }}
            onBlur={e => {
              const v = e.target.value;
              if (v === '') return;
              const n = Number(v);
              if (isNaN(n)) { onChange?.(fieldKey, undefined); return; }
              if (field.min != null && n < field.min) { onChange?.(fieldKey, undefined); return; }
              if (field.max != null && n > field.max) { onChange?.(fieldKey, undefined); return; }
            }}
            className={inlineInputClass}
            style={{ textAlign: textAlignStyle }}
            placeholder={parts.join(' · ')} />
        );
      }
      case 'BOOLEAN': {
        const checked = toBoolean(value);
        return (
          <div className={`flex w-full ${gridCellFlexJustifyClass(cellAlign)}`}>
          <button
            type="button"
            onClick={() => onChange?.(fieldKey, !checked)}
            className={`w-5 h-5 rounded-[4px] border-2 flex items-center justify-center transition-colors shrink-0 ${
              checked
                ? 'bg-[var(--app-color-accent)] border-[var(--app-color-accent)] text-white'
                : 'border-[var(--app-color-border)] bg-[var(--app-color-surface-page)] hover:border-[var(--app-color-accent)]'
            }`}
          >
            {checked && <Check className="w-3 h-3" />}
          </button>
          </div>
        );
      }
      case 'SELECT':
        return (
          <GridCellSelectField
            options={getFieldOptions(field)}
            value={value}
            editable
            onChange={v => onChange?.(fieldKey, v)}
            colWidth={colW}
            baseColWidth={baseW}
            fontSize={fontSize}
            bold={cell.style.bold}
            align={cellAlign}
          />
        );
      case 'MULTI_SELECT': {
        const arr = toArray(value);
        const opts = getFieldOptions(field);
        const displayText = arr.length > 0
          ? arr.map(v => opts.find(o => o.value === v)?.label ?? v).join('、')
          : '';
        return (
          <GridCellMultiSelectField
            options={opts}
            value={value}
            editable
            onChange={v => onChange?.(fieldKey, v)}
            displayText={displayText}
            colWidth={colW}
            baseColWidth={baseW}
            fontSize={fontSize}
            bold={cell.style.bold}
            align={cellAlign}
          />
        );
      }
      case 'DATETIME':
        return (
          <GridCellDatetimeField
            value={value}
            onChange={v => onChange?.(fieldKey, v)}
            align={cellAlign}
          />
        );
      case 'IMAGE':
        return (
          <GridCellImageField
            value={value}
            onChange={v => onChange?.(fieldKey, v)}
            inlineInputClass={inlineInputClass}
          />
        );
      case 'FILE':
        return (
          <GridCellFileField
            value={value}
            onChange={v => onChange?.(fieldKey, v)}
          />
        );
      case 'USER':
        return (
          <UserSelector
            value={String(value ?? '')}
            onChange={v => onChange?.(fieldKey, v)}
            multi={field.props?.multi === true}
          />
        );
      case 'AUTO_USER':
        return (
          <span className="text-xs text-[var(--app-color-text-tertiary)] italic truncate">
            {value ? String(value) : '（保存时自动记录）'}
          </span>
        );
      default:
        return <span className="text-xs text-[var(--app-color-text-tertiary)]">—</span>;
    }
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
          const rowH = rowHeightMap.get(r) || 36;
          return (
          <tr key={r} style={strictRowHeight ? { height: rowH } : undefined}>
            {Array.from({ length: maxCol }, (_, c) => {
              const key = `${r},${c}`;
              if (rendered.has(key)) return null;
              const cell = cellMap.get(key);
              if (!cell) {
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
              for (let dr = 0; dr < cell.rowSpan; dr++)
                for (let dc = 0; dc < cell.colSpan; dc++)
                  rendered.add(`${r + dr},${c + dc}`);

              const cellH = strictRowHeight
                ? gridCellFixedHeight(rowSpanTotalHeight(cell.row, cell.rowSpan, rowHeightMap))
                : gridCellMinHeight(rowH, cell.rowSpan);

              const tdSizeStyle = allowCellGrow
                ? { minHeight: cellH }
                : strictRowHeight
                  ? { height: cellH, minHeight: cellH, maxHeight: cellH }
                  : { minHeight: cellH };

              const fieldDef = cell.fieldKey ? fields[cell.fieldKey] : undefined;
              const fieldEditable = !!(fieldDef && canEditField(fieldDef, cell.fieldKey));
              const isActive = activeCellId === cell.id;
              const showFillEdit = !!(fillMeasure && editable && fieldEditable && isActive);
              const cellAlign = resolveCellAlign(cell.style.align, theme.defaultAlign);

              return (
                <td
                  key={cell.id}
                  data-fill-cell-id={cell.id}
                  colSpan={cell.colSpan}
                  rowSpan={cell.rowSpan}
                  className={`border border-[var(--app-color-border-default)] px-1.5 py-1 ${GRID_CELL_TD_CLASS} ${
                    showFillEdit
                      ? 'outline outline-2 outline-[var(--app-color-accent)] outline-offset-[-2px] relative z-[var(--z-dropdown)]'
                      : fillMeasure && editable && fieldEditable
                        ? 'cursor-pointer hover:bg-[var(--app-color-surface-hover)]'
                        : ''
                  }`}
                  style={{
                    ...tdSizeStyle,
                    textAlign: cellTextAlignStyle(cellAlign),
                    fontWeight: cell.style.bold ? 'bold' : 'normal',
                    fontSize: cell.style.fontSize ? `${cell.style.fontSize}px` : undefined,
                    color: cell.style.color || undefined,
                    backgroundColor: cell.style.bg || undefined,
                    verticalAlign: 'middle',
                  }}
                  onClick={() => {
                    if (!fillMeasure || !editable || !fieldEditable) return;
                    setActiveCellId(cell.id);
                  }}
                >
                  <div className={`${GRID_CELL_CONTENT_CLASS} ${gridCellContentAlignClass(cellAlign)}`}>
                    {cell.kind === 'static' ? (
                      cell.style.imageSrc ? (
                        <StaticCellContent text={cell.staticText || ''} style={cell.style} />
                      ) : fillMeasure ? (
                        <FillCellTextBox
                          text={cell.staticText || ''}
                          colWidth={cellSpanWidth(cell.col, cell.colSpan)}
                          baseColWidth={cellSpanBaseWidth(cell.col, cell.colSpan)}
                          fontSize={cell.style.fontSize ?? 13}
                          bold={cell.style.bold}
                          className="text-xs"
                        />
                      ) : (
                      <span
                        className={`text-xs ${cellTextClass(cell.staticText, cell.style.fontSize ?? 13, cell.style.bold)}`}
                        title={cellTextTitle(cell.staticText)}
                      >
                        {cell.staticText || '\u00a0'}
                      </span>
                      )
                    ) : cell.fieldKey ? (
                      renderFieldControl(cell, layout.fields[cell.fieldKey] || {
                        type: 'TEXT',
                        label: cell.fieldKey,
                        editableInFill: true,
                      } as FieldDefinition, values[cell.fieldKey], isActive)
                    ) : null}
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
      className="overflow-auto border border-[var(--app-color-border-default)] rounded-[var(--app-radius-container)] w-full"
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
