// frontend/src/features/smartsheet/components/SmartSheetGrid.tsx
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { defineCustomElements } from '@revolist/revogrid/loader';
import type { ColumnConfig, SmartSheetRow, LayoutMode } from '@/features/smartsheet/types';
import type { ViewOptions } from '@/features/smartsheet/types';

// Register revo-grid custom elements once
defineCustomElements();

interface SmartSheetGridProps {
  columns: ColumnConfig[];
  rows: SmartSheetRow[];
  layoutMode: LayoutMode;
  viewOptions: ViewOptions;
  selectedRowIds: Set<string>;
  onCellEdit: (rowId: string, colKey: string, value: string) => void;
  onColumnConfigClick: (colKey: string) => void;
  onRowSelect: (rowId: string, selected: boolean) => void;
}

function toRevoColumns(cols: ColumnConfig[], layoutMode: LayoutMode) {
  const revoCols: any[] = [];
  // Row header column for matrix/checklist/calendar modes
  if (layoutMode !== 'table') {
    revoCols.push({
      name: '',
      prop: '__row_header',
      size: 120,
      readonly: true,
      rowDrag: true,
      pin: 'colPinStart',
    });
  }
  for (const col of cols) {
    revoCols.push({
      name: col.label,
      prop: col.key,
      size: col.width || 110,
      sortable: true,
      filter: true,
      columnType: col.type === 'checkbox' ? 'boolean' : 'string',
      editor: col.type === 'select' ? 'select' : col.type === 'number' ? 'number' : 'text',
    });
  }
  return revoCols;
}

function toRevoRows(rows: SmartSheetRow[], layoutMode: LayoutMode) {
  return rows.map((r) => {
    const base: any = { ...r.cellData, __id: r.id };
    if (layoutMode !== 'table') {
      base.__row_header = r.rowLabel;
    }
    return base;
  });
}

export default function SmartSheetGrid({
  columns,
  rows,
  layoutMode,
  viewOptions,
  onCellEdit,
}: SmartSheetGridProps) {
  const gridRef = useRef<HTMLRevoGridElement | null>(null);

  const revoColumns = useMemo(() => toRevoColumns(columns, layoutMode), [columns, layoutMode]);
  const revoRows = useMemo(() => toRevoRows(rows, layoutMode), [rows, layoutMode]);

  // Update grid data when rows/columns change
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    grid.columns = revoColumns;
    grid.source = revoRows;
  }, [revoColumns, revoRows]);

  // Listen to afteredit event
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const rowIdx = detail?.rowIndex;
      const colProp = detail?.prop;
      const newVal = detail?.newVal;
      const row = rows[rowIdx];
      if (row && colProp !== '__row_header') {
        onCellEdit(row.id, colProp, String(newVal ?? ''));
      }
    };
    grid.addEventListener('afteredit', handler);
    return () => grid.removeEventListener('afteredit', handler);
  }, [rows, onCellEdit]);

  return (
    <div
      className={`smartsheet-grid ${viewOptions.zebra ? 'smartsheet-zebra' : ''} ${viewOptions.freeze ? 'smartsheet-frozen' : ''}`}
      style={{ width: '100%', height: '100%', minHeight: '300px' }}
    >
      <revo-grid
        ref={gridRef}
        source={revoRows}
        columns={revoColumns}
        resize={true}
        filter={true}
        range={true}
        readonly={false}
        editable={true}
        row-class={'row'}
        theme="default"
      />
    </div>
  );
}

// TypeScript declaration for the web component
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'revo-grid': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & {
        ref?: React.Ref<HTMLRevoGridElement>;
        source?: any[];
        columns?: any[];
        resize?: boolean;
        filter?: boolean;
        range?: boolean;
        readonly?: boolean;
        editable?: boolean;
        'row-class'?: string;
        theme?: string;
      }, HTMLElement>;
    }
  }
}

interface HTMLRevoGridElement extends HTMLElement {
  columns: any[];
  source: any[];
  addEventListener(type: 'afteredit', listener: (e: Event) => void): void;
  removeEventListener(type: 'afteredit', listener: (e: Event) => void): void;
}
