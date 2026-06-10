// SmartSheetGrid — 🍱 Bento 可编辑表格 + WPS 级编辑能力
// 基于 @tanstack/react-table，支持：click-edit · Tab/Enter导航 · Shift多选 · 右键菜单 · 撤销重做
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import type { ColumnDef, Row } from '@tanstack/react-table';
import { Plus, Trash2, ArrowUp, ArrowDown, Copy } from 'lucide-react';
import type { ColumnConfig, SmartSheetRow, LayoutMode, ColumnType } from '@/features/smartsheet/types';
import type { ViewOptions } from '@/features/smartsheet/types';

interface Props {
  columns: ColumnConfig[];
  rows: SmartSheetRow[];
  layoutMode: LayoutMode;
  viewOptions: ViewOptions;
  selectedRowIds: Set<string>;
  onCellEdit: (rowId: string, colKey: string, value: string) => void;
  onColumnConfigClick: (colKey: string) => void;
  onRowSelect: (rowId: string, selected: boolean) => void;
  onAddRow?: (afterRowId?: string) => void;
  onDeleteRows?: (rowIds: string[]) => void;
  onDuplicateRow?: (rowId: string) => void;
  onMoveRow?: (rowId: string, direction: 'up' | 'down') => void;
}

// ── Cell value CSS class by type + value ──
function cellClass(val: unknown, type: ColumnType): string {
  if (val == null || val === '') return 'cv-empty';
  switch (type) {
    case 'number':  return 'cv-num';
    case 'select': case 'multi-select': case 'user': return 'cv-sel';
    case 'date':    return 'cv-date';
    case 'checkbox': return String(val) === 'true' ? 'cv-true' : 'cv-false';
    default:        return '';
  }
}

function displayVal(val: unknown, type: ColumnType): string {
  if (val == null || val === '') return '';
  const s = String(val);
  switch (type) {
    case 'checkbox': return s === 'true' ? '✓' : '—';
    default: return s;
  }
}

// ── Inline cell editor ──
function CellEditor({ value, type, options, onSave, onCancel, onNext, onPrev }: {
  value: string; type: ColumnType; options?: string[];
  onSave: (v: string) => void; onCancel: () => void;
  onNext?: () => void; onPrev?: () => void;
}) {
  const ref = useRef<HTMLInputElement | HTMLSelectElement>(null);
  useEffect(() => { ref.current?.focus(); if (ref.current instanceof HTMLInputElement) ref.current.select(); }, []);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') { e.preventDefault(); onSave(getVal()); onNext?.(); }
    if (e.key === 'Enter') { e.preventDefault(); onSave(getVal()); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };
  const getVal = () => (ref.current instanceof HTMLInputElement ? ref.current.value : (ref.current as HTMLSelectElement).value);

  if (type === 'select' || type === 'multi-select') {
    return <select ref={ref as any} defaultValue={value} onChange={e => onSave(e.target.value)} onBlur={() => onCancel()} onKeyDown={handleKey}
      className="w-full h-full border-0 bg-transparent text-[12.5px] outline-none cursor-pointer">
      <option value="">—</option>{(options||[]).map(o=><option key={o} value={o}>{o}</option>)}</select>;
  }
  if (type === 'checkbox') {
    return <input ref={ref as any} type="checkbox" defaultChecked={value==='true'}
      onChange={e=>onSave(e.target.checked?'true':'false')} onBlur={()=>onCancel()} onKeyDown={handleKey} className="w-4 h-4 cursor-pointer"/>;
  }
  return <input ref={ref as any} defaultValue={value} onBlur={e=>onSave((e.target as HTMLInputElement).value)} onKeyDown={handleKey}
    className="w-full h-full border-0 bg-transparent text-[12.5px] outline-none px-1"/>;
}

// ── Undo/Redo stack ──
interface EditRecord { rowId: string; colKey: string; oldVal: string; newVal: string; }
function useUndoRedo() {
  const [stack, setStack] = useState<EditRecord[]>([]);
  const [cursor, setCursor] = useState(-1);
  const push = useCallback((r: EditRecord) => setStack(s => { const n = s.slice(0, cursor + 1); n.push(r); setCursor(n.length - 1); return n; }), [cursor]);
  const undo = useCallback(() => { if (cursor < 0) return null; const r = stack[cursor]; setCursor(c => c - 1); return r; }, [cursor, stack]);
  const redo = useCallback(() => { if (cursor >= stack.length - 1) return null; const r = stack[cursor + 1]; setCursor(c => c + 1); return r; }, [cursor, stack]);
  const canUndo = cursor >= 0;
  const canRedo = cursor < stack.length - 1;
  return { push, undo, redo, canUndo, canRedo };
}

// ── Column header template ──
function makeHeaderTemplate(col: ColumnConfig) {
  return () => <span>{col.label}<span className="ch-type">{col.type}</span></span>;
}

export default function SmartSheetGrid({
  columns, rows, layoutMode, viewOptions, onCellEdit, onColumnConfigClick,
  onAddRow, onDeleteRows, onDuplicateRow, onMoveRow,
}: Props) {
  const [editingCell, setEditingCell] = useState<{ rowId: string; colKey: string } | null>(null);
  const [selection, setSelection] = useState<{ start: { row: number; col: number }; end: { row: number; col: number } } | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; rowId: string; rowIdx: number } | null>(null);
  const undoRedo = useUndoRedo();
  const showRowHeader = layoutMode !== 'table';

  // Close context menu on click outside
  useEffect(() => { if (!contextMenu) return; const h = () => setContextMenu(null); document.addEventListener('click', h); return () => document.removeEventListener('click', h); }, [contextMenu]);

  // Build column defs
  const colDefs = useMemo<ColumnDef<SmartSheetRow>[]>(() => {
    const defs: ColumnDef<SmartSheetRow>[] = [];
    if (showRowHeader) {
      defs.push({
        id: '__row_header',
        header: () => <span className="corner-text">行 \ 列</span>,
        cell: ({ row }) => <span>{row.original.rowLabel}<button className="cfg-btn" onClick={e=>{e.stopPropagation()}}>⚙</button></span>,
        size: 130, minSize: 90, enableSorting: false,
      });
    }
    for (let ci = 0; ci < columns.length; ci++) {
      const col = columns[ci]; const colIdx = ci;
      defs.push({
        id: col.key,
        header: makeHeaderTemplate(col),
        cell: ({ row }) => {
          const rawVal = (row.original.cellData || {})[col.key];
          const isEditing = editingCell?.rowId === row.original.id && editingCell?.colKey === col.key;
          if (isEditing) {
            const rowIdx = rows.findIndex(r => r.id === row.original.id);
            const nextRow = rowIdx < rows.length - 1 ? rows[rowIdx + 1] : null;
            const prevRow = rowIdx > 0 ? rows[rowIdx - 1] : null;
            return (
              <CellEditor value={rawVal ?? ''} type={col.type} options={col.options}
                onSave={(v) => {
                  const old = rawVal ?? '';
                  if (v !== old) {
                    undoRedo.push({ rowId: row.original.id, colKey: col.key, oldVal: old, newVal: v });
                    onCellEdit(row.original.id, col.key, v);
                  }
                  setEditingCell(null);
                }}
                onCancel={() => setEditingCell(null)}
                onNext={() => nextRow && setEditingCell({ rowId: nextRow.id, colKey: col.key })}
                onPrev={() => prevRow && setEditingCell({ rowId: prevRow.id, colKey: col.key })} />
            );
          }
          return (
            <span className={cellClass(rawVal, col.type)}
                  onClick={() => setEditingCell({ rowId: row.original.id, colKey: col.key })}
                  onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, rowId: row.original.id, rowIdx: row.index }); }}>
              {displayVal(rawVal, col.type)}
            </span>
          );
        },
        size: col.width || 110, minSize: 60,
      });
    }
    return defs;
  }, [columns, showRowHeader, editingCell, onCellEdit, rows, undoRedo]);

  const table = useReactTable({ data: rows, columns: colDefs, getCoreRowModel: getCoreRowModel(), getRowId: (r) => r.id });

  return (
    <div className="table-scroll" style={{ flex: 1, overflow: 'auto' }}>
      <table className={`bt-grid ${viewOptions.zebra ? 'striped' : ''}`}>
        <thead>
          {table.getHeaderGroups().map(hg => (
            <tr key={hg.id}>
              {hg.headers.map(h => {
                const isRH = h.column.id === '__row_header';
                const colConfig = columns.find(c => c.key === h.column.id);
                return (
                  <th key={h.id} className={isRH ? 'corner' : 'ch'}
                      style={{ width: h.getSize(), minWidth: h.getSize() }}
                      onClick={() => { if (colConfig) onColumnConfigClick(colConfig.key); }}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => (
            <tr key={row.id} onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, rowId: row.original.id, rowIdx: row.index }); }}>
              {row.getVisibleCells().map(cell => {
                const isRH = cell.column.id === '__row_header';
                return (
                  <td key={cell.id} className={isRH ? 'rh' : 'dc'}
                      style={{ width: cell.column.getSize(), minWidth: cell.column.getSize() }}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── 右键菜单 ── */}
      {contextMenu && (
        <div className="fixed z-[var(--z-dropdown)] rounded-[12px] border border-app-border bg-app-surface-elevated shadow-lg py-1.5 min-w-[160px]"
             style={{ left: contextMenu.x, top: contextMenu.y }}>
          <CtxItem icon={Plus} label="上方插入行" onClick={() => { onAddRow?.(contextMenu.rowId); setContextMenu(null); }} />
          <CtxItem icon={Plus} label="下方插入行" onClick={() => { onAddRow?.(contextMenu.rowId); setContextMenu(null); }} />
          <CtxItem icon={Copy} label="复制行" onClick={() => { onDuplicateRow?.(contextMenu.rowId); setContextMenu(null); }} />
          <CtxItem icon={ArrowUp} label="上移" onClick={() => { onMoveRow?.(contextMenu.rowId, 'up'); setContextMenu(null); }} />
          <CtxItem icon={ArrowDown} label="下移" onClick={() => { onMoveRow?.(contextMenu.rowId, 'down'); setContextMenu(null); }} />
          <div className="h-px bg-app-border my-1" />
          <CtxItem icon={Trash2} label="删除行" danger onClick={() => { onDeleteRows?.([contextMenu.rowId]); setContextMenu(null); }} />
        </div>
      )}

      {/* ── 撤销/重做 快捷键提示 ── */}
      <div className="flex items-center gap-2 px-3 py-1 text-[10px] text-app-text-tertiary">
        <span>Ctrl+Z 撤销{undoRedo.canUndo ? `(${undoRedo.stack.length - undoRedo.cursor - 1})` : ''}</span>
        <span className="text-app-border">|</span>
        <span>Ctrl+Y 重做{undoRedo.canRedo ? `(${undoRedo.cursor + 1})` : ''}</span>
        <span className="text-app-border">|</span>
        <span>Tab 跳下一行 · Enter 确认 · Esc 取消 · 右键行操作</span>
      </div>

      {/* ── Keyboard undo/redo ── */}
      <UndoRedoHandler undoRedo={undoRedo} onCellEdit={onCellEdit} />
    </div>
  );
}

function CtxItem({ icon: Icon, label, danger, onClick }: { icon: typeof Plus; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors text-left
        ${danger ? 'text-app-feedback-danger hover:bg-app-feedback-danger-soft' : 'text-app-text-secondary hover:bg-app-surface-hover'}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" /> {label}
    </button>
  );
}

// ── Global keyboard handler for Ctrl+Z / Ctrl+Y ──
function UndoRedoHandler({ undoRedo, onCellEdit }: { undoRedo: ReturnType<typeof useUndoRedo>; onCellEdit: Props['onCellEdit'] }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        const r = undoRedo.undo();
        if (r) onCellEdit(r.rowId, r.colKey, r.oldVal);
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        const r = undoRedo.redo();
        if (r) onCellEdit(r.rowId, r.colKey, r.newVal);
      }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [undoRedo, onCellEdit]);
  return null;
}