# SmartSheet 编辑器 V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade SmartSheet from basic CRUD to WPS-grade spreadsheet editor — real cell formatting, toolbar functions, find/replace, import/export, conditional formatting, all as decoupled React components.

**Architecture:** Component-based with React Context for format state. Cell data extended from plain strings to `{ v, fmt }` objects with backward-compat migration layer. All colors/spacing via `--app-*` token system (G04 compliance).

**Tech Stack:** React 19 + TypeScript + Tailwind CSS + @tanstack/react-table + @tanstack/react-query | Spring Boot + MyBatis + FastExcel

---

## File Structure

```
frontend/src/features/smartsheet/
├── types.ts                              — Modify: CellValue, CellFormat types
├── SmartSheetPage.tsx                    — Modify: wire real props
├── SmartSheetListPage.tsx                — Modify: menu overflow fix
├── hooks/
│   ├── useSmartSheet.ts                  — Modify: cellData normalize
│   └── useCellFormat.ts                  — Create: format state context
├── components/
│   ├── SmartSheetGrid.tsx                — Modify: context menu + edit fix
│   ├── SmartSheetToolbar.tsx             — Modify: wire real handlers
│   ├── SmartSheetStatusBar.tsx           — (unchanged)
│   ├── SmartSheetTabsRow.tsx             — (unchanged)
│   ├── FormatBar.tsx                     — Create: B/I/bg/font/size
│   ├── ColorPicker.tsx                   — Create: 8-color palette
│   ├── FindReplaceDialog.tsx             — Create: find/replace modal
│   ├── ImportDialog.tsx                  — Rewrite: CSV import flow
│   ├── ConditionalFormatPanel.tsx        — Create: rules manager
│   └── SmartSheetContextMenu.tsx         — Create: row context menu
└── api/
    └── smartsheet.api.ts                 — Modify: cellData normalize

src/main/java/com/example/demo/modules/smartsheet/
├── controller/SmartsheetController.java  — Modify: Excel export endpoint
├── service/SmartsheetService.java        — (already has needed methods)
└── dto/                                  — (no changes)
```

---

### Task 1: CellData 类型扩展 + 兼容层

**Files:**
- Modify: `frontend/src/features/smartsheet/types.ts`
- Modify: `frontend/src/api/domains/smartsheet.api.ts`

- [ ] **Step 1: Add CellValue and CellFormat types**

Add to `types.ts`:
```typescript
// Cell formatting
export interface CellFormat {
  b?: boolean;       // bold
  i?: boolean;       // italic
  bg?: string;       // background token ref
  color?: string;    // font color token ref
  size?: number;     // 12 | 14 | 16
}

export interface CellValue {
  v: string;
  fmt?: CellFormat;
}
```

- [ ] **Step 2: Add normalizeCellValue helper to API layer**

Add to `smartsheet.api.ts`:
```typescript
import type { CellValue } from '@/features/smartsheet/types';

function normalizeCellValue(raw: unknown): CellValue {
  if (raw == null || raw === '') return { v: '' };
  if (typeof raw === 'string') return { v: raw };
  if (typeof raw === 'object' && 'v' in (raw as any)) return raw as CellValue;
  return { v: String(raw) };
}

function denormalizeCellValue(cv: CellValue): CellValue {
  // Strip undefined fmt to minimize JSON size
  const out: CellValue = { v: cv.v };
  if (cv.fmt && Object.keys(cv.fmt).length > 0) out.fmt = cv.fmt;
  return out;
}
```

- [ ] **Step 3: Update normalizeRow to normalize all cellData values**

In `normalizeRow()`, change:
```typescript
cellData: (typeof raw.cellData === 'object' ...)
```
to:
```typescript
cellData: (() => {
  const rawCd = (typeof raw.cellData === 'object' && !Array.isArray(raw.cellData) ? raw.cellData : maybeParse(raw.cellData) ?? {}) as Record<string, unknown>;
  const out: Record<string, CellValue> = {};
  for (const [k, v] of Object.entries(rawCd)) { out[k] = normalizeCellValue(v); }
  return out;
})() as Record<string, CellValue>,
```

- [ ] **Step 4: Update SmartSheetRow type**

In `types.ts`:
```typescript
export interface SmartSheetRow {
  // ... other fields unchanged
  cellData: Record<string, CellValue>;  // was Record<string, string>
}
```

- [ ] **Step 5: Build check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/smartsheet/types.ts frontend/src/api/domains/smartsheet.api.ts
git commit -m "feat: CellData extended to {v, fmt} with backward-compat migration"
```

---

### Task 2: ⋮ 菜单溢出修复 + 右键菜单修正

**Files:**
- Modify: `frontend/src/features/smartsheet/SmartSheetListPage.tsx`
- Create: `frontend/src/features/smartsheet/components/SmartSheetContextMenu.tsx`

- [ ] **Step 1: Fix dropdown menu flip direction**

In `SheetRow` component, replace `menuOpen` rendering logic. Change the menu position from fixed `right-0 top-full` to detect bottom overflow:

```tsx
const [menuDir, setMenuDir] = useState<'down' | 'up'>('down');
const menuBtnRef = useRef<HTMLButtonElement>(null);

useEffect(() => {
  if (!menuOpen) return;
  const btn = menuBtnRef.current;
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  setMenuDir(spaceBelow < 340 ? 'up' : 'down');
}, [menuOpen]);
```

Then in the menu div:
```tsx
className={`absolute right-0 w-[200px] rounded-[12px] border border-app-border bg-app-surface-elevated shadow-lg py-1.5 z-[var(--z-dropdown)]
  ${menuDir === 'up' ? 'bottom-full mb-1' : 'top-full mt-1'}`}
```

- [ ] **Step 2: Extract SmartSheetContextMenu component**

Create `components/SmartSheetContextMenu.tsx` — row-only context menu (no copy/paste — browser handles that):

```tsx
// SmartSheetContextMenu — 表格行右键菜单（仅行操作，复制粘贴走浏览器原生）
import React from 'react';
import { Plus, Trash2, ArrowUp, ArrowDown, Copy } from 'lucide-react';

interface Props {
  x: number; y: number;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function SmartSheetContextMenu({ x, y, onInsertAbove, onInsertBelow, onDuplicate, onMoveUp, onMoveDown, onDelete, onClose }: Props) {
  return (
    <div className="fixed z-[var(--z-dropdown)] rounded-[12px] border border-app-border bg-app-surface-elevated shadow-lg py-1.5 min-w-[160px]"
         style={{ left: Math.min(x, window.innerWidth - 170), top: Math.min(y, window.innerHeight - 260) }}
         onClick={onClose}>
      <CtxItem icon={Plus} label="上方插入行" onClick={onInsertAbove} />
      <CtxItem icon={Plus} label="下方插入行" onClick={onInsertBelow} />
      <CtxItem icon={Copy} label="复制行" onClick={onDuplicate} />
      <CtxItem icon={ArrowUp} label="上移" onClick={onMoveUp} />
      <CtxItem icon={ArrowDown} label="下移" onClick={onMoveDown} />
      <div className="h-px bg-app-border my-1" />
      <CtxItem icon={Trash2} label="删除行" danger onClick={onDelete} />
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
```

- [ ] **Step 3: Replace inline context menu in SmartSheetGrid with new component**

In `SmartSheetGrid.tsx`:
- Remove the inline context menu JSX block
- Import `SmartSheetContextMenu`
- Wire `onAddRow`/`onDeleteRows`/`onDuplicateRow`/`onMoveRow` props

```tsx
{contextMenu && (
  <SmartSheetContextMenu
    x={contextMenu.x} y={contextMenu.y}
    onInsertAbove={() => { onAddRow?.(contextMenu.rowId); setContextMenu(null); }}
    onInsertBelow={() => { /* add row after this one */ setContextMenu(null); }}
    onDuplicate={() => { onDuplicateRow?.(contextMenu.rowId); setContextMenu(null); }}
    onMoveUp={() => { onMoveRow?.(contextMenu.rowId, 'up'); setContextMenu(null); }}
    onMoveDown={() => { onMoveRow?.(contextMenu.rowId, 'down'); setContextMenu(null); }}
    onDelete={() => { onDeleteRows?.([contextMenu.rowId]); setContextMenu(null); }}
    onClose={() => setContextMenu(null)}
  />
)}
```

- [ ] **Step 4: Build check**

Run: `cd frontend && npx tsc --noEmit && npx vite build 2>&1 | grep -E "✓|error"`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/smartsheet/SmartSheetListPage.tsx frontend/src/features/smartsheet/components/SmartSheetContextMenu.tsx frontend/src/features/smartsheet/components/SmartSheetGrid.tsx
git commit -m "fix: menu overflow flip + extract context menu, row-ops only"
```

---

### Task 3: 行增删 + 单元格编辑链路修复

**Files:**
- Modify: `frontend/src/features/smartsheet/SmartSheetPage.tsx`
- Modify: `frontend/src/features/smartsheet/hooks/useSmartSheet.ts`
- Modify: `frontend/src/features/smartsheet/components/SmartSheetGrid.tsx`

- [ ] **Step 1: Add row mutation methods to useSmartSheet hook**

Add to `useSmartSheet.ts`:
```typescript
const insertRowMutation = useMutation({
  mutationFn: async (afterRowId?: string) => {
    const row = await addRow(sheetId!, '', undefined);
    return row;
  },
  onSuccess: () => invalidate(),
  onError: (e: Error) => toast.error(e.message || '添加行失败'),
});

const deleteRowsMutation = useMutation({
  mutationFn: async (rowIds: string[]) => {
    for (const id of rowIds) await deleteRow(sheetId!, id);
  },
  onSuccess: () => { invalidate(); toast.success('已删除'); },
  onError: (e: Error) => toast.error(e.message || '删除失败'),
});

// Add to return object:
return {
  // ... existing
  insertRow: (afterRowId?: string) => insertRowMutation.mutate(afterRowId),
  deleteRows: (ids: string[]) => deleteRowsMutation.mutate(ids),
  duplicateRow: (rowId: string) => { /* clone row data + add */ },
  moveRow: (rowId: string, dir: 'up' | 'down') => { /* swap row_index + re-save */ },
};
```

- [ ] **Step 2: Wire SmartSheetPage props to SmartSheetGrid**

In `SmartSheetPage.tsx`, add real handlers:
```tsx
<SmartSheetGrid
  // ... existing props
  onAddRow={(afterRowId) => insertRow(afterRowId)}
  onDeleteRows={(ids) => deleteRows(ids)}
  onDuplicateRow={(rowId) => duplicateRow(rowId)}
  onMoveRow={(rowId, dir) => moveRow(rowId, dir)}
/>
```

- [ ] **Step 3: Fix cell edit → CellValue save flow**

In `SmartSheetGrid.tsx` CellEditor's `onSave`:
```tsx
onSave={(v) => {
  const old = rawVal ? (typeof rawVal === 'object' ? (rawVal as CellValue).v : String(rawVal)) : '';
  const oldFmt = (rawVal && typeof rawVal === 'object') ? (rawVal as CellValue).fmt : undefined;
  const newCell: CellValue = { v, fmt: oldFmt };
  if (v !== old) {
    undoRedo.push({ rowId: row.original.id, colKey: col.key, oldVal: JSON.stringify(rawVal), newVal: JSON.stringify(newCell) });
  }
  onCellEdit(row.original.id, col.key, JSON.stringify(newCell));
  setEditingCell(null);
}}
```

And in CellDisplay — read `v` from CellValue for display:
```tsx
function displayVal(raw: unknown, type: ColumnType): string {
  const cv = normalizeCellValue(raw);
  if (cv.v == null || cv.v === '') return '';
  const s = String(cv.v);
  switch (type) {
    case 'checkbox': return s === 'true' ? '✓' : '—';
    default: return s;
  }
}

function cellClass(raw: unknown, type: ColumnType): string {
  const cv = normalizeCellValue(raw);
  if (cv.v == null || cv.v === '') return 'cv-empty';
  // ... same as before but on cv.v
}
```

- [ ] **Step 4: Build check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/smartsheet/hooks/useSmartSheet.ts frontend/src/features/smartsheet/SmartSheetPage.tsx frontend/src/features/smartsheet/components/SmartSheetGrid.tsx
git commit -m "fix: wire row add/delete/move + cell edit saves CellValue with fmt"
```

---

### Task 4: FormatBar — 格式化工具栏

**Files:**
- Create: `frontend/src/features/smartsheet/components/FormatBar.tsx`
- Create: `frontend/src/features/smartsheet/components/ColorPicker.tsx`
- Create: `frontend/src/features/smartsheet/hooks/useCellFormat.ts`
- Modify: `frontend/src/features/smartsheet/components/SmartSheetToolbar.tsx`

- [ ] **Step 1: Create useCellFormat hook**

Create `hooks/useCellFormat.ts`:
```typescript
import { createContext, useContext } from 'react';
import type { CellFormat } from '@/features/smartsheet/types';

export interface FormatContextValue {
  format: CellFormat;
  setFormat: (f: Partial<CellFormat>) => void;
  clearFormat: () => void;
}

export const FormatContext = createContext<FormatContextValue>({
  format: {},
  setFormat: () => {},
  clearFormat: () => {},
});

export function useCellFormat() { return useContext(FormatContext); }
```

- [ ] **Step 2: Create ColorPicker component**

Create `components/ColorPicker.tsx` — 8 preset colors using `--app-color-*` tokens:
```tsx
import React from 'react';

const COLORS = [
  { label: '默认', value: '' },
  { label: '红', value: 'var(--app-color-feedback-danger)' },
  { label: '橙', value: 'var(--app-color-feedback-warning)' },
  { label: '绿', value: 'var(--app-color-feedback-success)' },
  { label: '蓝', value: 'var(--app-color-accent-secondary)' },
  { label: '靛', value: 'var(--app-color-accent)' },
  { label: '深灰', value: 'var(--app-color-text-primary)' },
  { label: '浅灰', value: 'var(--app-color-text-secondary)' },
];

export default function ColorPicker({ value, onChange, onClose }: {
  value: string; onChange: (v: string) => void; onClose: () => void;
}) {
  return (
    <div className="absolute top-full left-0 mt-1 p-2 rounded-[10px] border border-app-border bg-app-surface-elevated shadow-lg z-[var(--z-dropdown)] grid grid-cols-4 gap-1.5"
         onClick={e => e.stopPropagation()}>
      {COLORS.map(c => (
        <button key={c.label} title={c.label} onClick={() => { onChange(c.value); onClose(); }}
          className="w-6 h-6 rounded-full border border-app-border transition-transform hover:scale-110"
          style={{ background: c.value || 'transparent', borderStyle: c.value ? 'solid' : 'dashed' }}>
          {!c.value && <span className="text-[8px] text-app-text-tertiary">✕</span>}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Create FormatBar component**

Create `components/FormatBar.tsx`:
```tsx
import React, { useState } from 'react';
import { Bold, Italic, PaintBucket, Type } from 'lucide-react';
import { useCellFormat } from '@/hooks/useCellFormat';
import ColorPicker from './ColorPicker';

export default function FormatBar() {
  const { format, setFormat } = useCellFormat();
  const [showBg, setShowBg] = useState(false);
  const [showColor, setShowColor] = useState(false);

  const btnBase = (active: boolean) => `p-1.5 rounded-[6px] text-[12px] transition-colors ${
    active ? 'bg-app-accent-soft text-app-accent' : 'text-app-text-secondary hover:bg-app-surface-hover'}`;

  return (
    <div className="flex items-center gap-0.5">
      <button className={btnBase(!!format.b)} onClick={() => setFormat({ b: !format.b })} title="加粗 (Ctrl+B)">
        <Bold className="w-3.5 h-3.5" />
      </button>
      <button className={btnBase(!!format.i)} onClick={() => setFormat({ i: !format.i })} title="斜体 (Ctrl+I)">
        <Italic className="w-3.5 h-3.5" />
      </button>
      <span className="w-px h-4 bg-app-border mx-1" />

      {/* Background color */}
      <div className="relative">
        <button className={btnBase(!!format.bg)} onClick={() => setShowBg(!showBg)} title="底色">
          <PaintBucket className="w-3.5 h-3.5" />
        </button>
        {showBg && <ColorPicker value={format.bg || ''} onChange={v => setFormat({ bg: v || undefined })} onClose={() => setShowBg(false)} />}
      </div>

      {/* Font color */}
      <div className="relative">
        <button className={btnBase(!!format.color)} onClick={() => setShowColor(!showColor)} title="字体色">
          <Type className="w-3.5 h-3.5" />
        </button>
        {showColor && <ColorPicker value={format.color || ''} onChange={v => setFormat({ color: v || undefined })} onClose={() => setShowColor(false)} />}
      </div>

      {/* Font size */}
      <select className="text-[11px] px-1.5 py-1 rounded-[6px] border border-app-border bg-transparent text-app-text-secondary cursor-pointer"
        value={format.size || 12} onChange={e => setFormat({ size: Number(e.target.value) || undefined })}>
        {[10, 12, 14, 16, 18, 20].map(s => <option key={s} value={s}>{s}px</option>)}
      </select>
    </div>
  );
}
```

- [ ] **Step 4: Integrate FormatBar into SmartSheetToolbar**

In `SmartSheetToolbar.tsx`, add after the brand section:
```tsx
import FormatBar from './FormatBar';
// ... inside JSX, after back button:
<FormatBar />
<Divider />
```

- [ ] **Step 5: Build check**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/smartsheet/hooks/useCellFormat.ts frontend/src/features/smartsheet/components/ColorPicker.tsx frontend/src/features/smartsheet/components/FormatBar.tsx frontend/src/features/smartsheet/components/SmartSheetToolbar.tsx
git commit -m "feat: FormatBar with B/I/bg/font-color/size + ColorPicker"
```

---

### Task 5: CellDisplay 格式渲染

**Files:**
- Modify: `frontend/src/features/smartsheet/components/SmartSheetGrid.tsx`

- [ ] **Step 1: Update CellDisplay to apply CellFormat styles**

In `SmartSheetGrid.tsx`, the cell render function (`cell` in colDefs) — wrap display value in a span that applies fmt styles via inline `style`:

```tsx
// Inside cell render:
const cv = normalizeCellValue(rawVal);
const fmt = cv.fmt || {};

// Display span with format applied
<span
  className={cellClass(rawVal, col.type)}
  style={{
    fontWeight: fmt.b ? 700 : undefined,
    fontStyle: fmt.i ? 'italic' : undefined,
    fontSize: fmt.size ? `${fmt.size}px` : undefined,
    backgroundColor: fmt.bg || undefined,
    color: fmt.color || undefined,
  }}
  onClick={() => setEditingCell({ rowId: row.original.id, colKey: col.key })}>
  {displayVal(rawVal, col.type)}
</span>
```

- [ ] **Step 2: Build check + verify format renders**

Run: `cd frontend && npx tsc --noEmit && npx vite build 2>&1 | grep -E "✓|error"`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/smartsheet/components/SmartSheetGrid.tsx
git commit -m "feat: CellDisplay renders bold/italic/color/size from CellFormat"
```

---

### Task 6: 撤销/重做 + 视图开关 + 保存真实化

**Files:**
- Modify: `frontend/src/features/smartsheet/components/SmartSheetToolbar.tsx`
- Modify: `frontend/src/features/smartsheet/components/SmartSheetGrid.tsx`
- Modify: `frontend/src/features/smartsheet/SmartSheetPage.tsx`

- [ ] **Step 1: Wire undo/redo buttons in toolbar**

In `SmartSheetToolbar.tsx`, add `canUndo`/`canRedo` props:
```tsx
interface ToolbarProps {
  // ... existing
  canUndo?: boolean;
  canRedo?: boolean;
  onUndo?: () => void;
  onRedo?: () => void;
}
```

Replace ghost `↩ ↪` buttons with:
```tsx
<button onClick={onUndo} disabled={!canUndo}
  className={`px-1.5 py-1 text-[12px] transition-colors ${canUndo ? 'text-app-text-secondary hover:text-app-text-primary' : 'text-app-text-tertiary opacity-50 cursor-not-allowed'}`}
  title="撤销 (Ctrl+Z)">↩</button>
<button onClick={onRedo} disabled={!canRedo}
  className={`px-1.5 py-1 text-[12px] transition-colors ${canRedo ? 'text-app-text-secondary hover:text-app-text-primary' : 'text-app-text-tertiary opacity-50 cursor-not-allowed'}`}
  title="重做 (Ctrl+Y)">↪</button>
```

- [ ] **Step 2: Make view toggles actually apply to the grid**

In `SmartSheetPage.tsx`, view options already pass to SmartSheetGrid. Ensure the grid applies them:
- `zebra` → `className` includes `striped` (already works)
- `freeze` → add `position: sticky` to first row/col (via CSS `.smartsheet-frozen`)
- `conditionalFormat` → store as boolean, used in Phase 5

Add `smartsheet-frozen` CSS class to `smartsheet-theme.css`:
```css
.smartsheet-frozen .bt-grid th.ch,
.smartsheet-frozen .bt-grid .corner { position: sticky; top: 0; z-index: 2; }
.smartsheet-frozen .bt-grid .rh { position: sticky; left: 0; z-index: 2; }
.smartsheet-frozen .bt-grid .corner { z-index: 3; }
```

- [ ] **Step 3: Make save button trigger actual save**

In `SmartSheetToolbar.tsx`, add `isDirty` prop + save handler already wired. Add dirty indicator:
```tsx
{isDirty && <span className="text-[10px] text-app-feedback-warning mr-1">● 未保存</span>}
```

In `SmartSheetPage.tsx`, track dirty state via a ref that flips on any cell edit.

- [ ] **Step 4: Build check**

Run: `cd frontend && npx tsc --noEmit && npx vite build 2>&1 | grep -E "✓|error"`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/smartsheet/components/SmartSheetToolbar.tsx frontend/src/features/smartsheet/components/SmartSheetGrid.tsx frontend/src/features/smartsheet/SmartSheetPage.tsx frontend/src/styles/smartsheet-theme.css
git commit -m "feat: real undo/redo buttons, freeze CSS, save dirty indicator"
```

---

### Task 7: 查找替换弹窗

**Files:**
- Create: `frontend/src/features/smartsheet/components/FindReplaceDialog.tsx`
- Modify: `frontend/src/features/smartsheet/SmartSheetPage.tsx`

- [ ] **Step 1: Create FindReplaceDialog**

Create `components/FindReplaceDialog.tsx`:
```tsx
import React, { useState, useRef, useEffect } from 'react';
import type { SmartSheetRow, CellValue } from '@/features/smartsheet/types';

interface Props {
  open: boolean; onClose: () => void;
  rows: SmartSheetRow[];
  onReplace: (rowId: string, colKey: string, newVal: CellValue) => void;
}

export default function FindReplaceDialog({ open, onClose, rows, onReplace }: Props) {
  const [find, setFind] = useState('');
  const [replace, setReplace] = useState('');
  const [results, setResults] = useState<{ rowId: string; colKey: string; value: string }[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (!find) { setResults([]); return; }
    const r: typeof results = [];
    for (const row of rows) {
      for (const [colKey, cv] of Object.entries(row.cellData || {})) {
        const v = typeof cv === 'object' ? (cv as CellValue).v : String(cv ?? '');
        if (v.toLowerCase().includes(find.toLowerCase())) {
          r.push({ rowId: row.id, colKey, value: v });
        }
      }
    }
    setResults(r);
    setActiveIdx(0);
  }, [find, rows]);

  const handleReplace = () => {
    if (!results[activeIdx]) return;
    const { rowId, colKey } = results[activeIdx];
    const newVal = results[activeIdx].value.replace(new RegExp(find, 'gi'), replace);
    onReplace(rowId, colKey, { v: newVal });
    // Refresh results
    setFind('');
    setTimeout(() => setFind(replace ? find : ''), 50);
  };

  const handleReplaceAll = () => {
    for (const r of results) {
      const newVal = r.value.replace(new RegExp(find, 'gi'), replace);
      onReplace(r.rowId, r.colKey, { v: newVal });
    }
    setFind('');
  };

  if (!open) return null;

  return (
    <div className="fixed top-16 right-4 w-[320px] rounded-[14px] border border-app-border bg-app-surface-elevated shadow-lg p-4 z-[var(--z-modal)]">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-app-text-primary">查找和替换</h3>
        <button onClick={onClose} className="text-app-text-tertiary hover:text-app-text-primary">✕</button>
      </div>
      <input placeholder="查找..." value={find} onChange={e => setFind(e.target.value)}
        className="w-full px-2.5 py-1.5 rounded-[8px] border border-app-border bg-app-surface-container text-sm text-app-text-primary mb-2 outline-none focus:border-app-accent" />
      <input placeholder="替换为..." value={replace} onChange={e => setReplace(e.target.value)}
        className="w-full px-2.5 py-1.5 rounded-[8px] border border-app-border bg-app-surface-container text-sm text-app-text-primary mb-2 outline-none focus:border-app-accent" />
      <div className="text-[11px] text-app-text-secondary mb-2">
        {results.length > 0 ? `${activeIdx + 1}/${results.length} 个匹配` : '无匹配'}
      </div>
      <div className="flex gap-2">
        <button onClick={handleReplace} disabled={!results.length}
          className="flex-1 py-1.5 rounded-[8px] bg-app-accent-secondary text-white text-xs font-medium disabled:opacity-50">替换</button>
        <button onClick={handleReplaceAll} disabled={!results.length}
          className="flex-1 py-1.5 rounded-[8px] bg-app-accent text-app-text-inverse text-xs font-medium disabled:opacity-50">全部替换</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire FindReplaceDialog into SmartSheetPage**

Add state + Ctrl+F listener:
```tsx
const [showFind, setShowFind] = useState(false);
useEffect(() => {
  const h = (e: KeyboardEvent) => { if ((e.ctrlKey||e.metaKey) && e.key === 'f') { e.preventDefault(); setShowFind(true); } };
  document.addEventListener('keydown', h);
  return () => document.removeEventListener('keydown', h);
}, []);

// In JSX:
{showFind && <FindReplaceDialog open={showFind} onClose={() => setShowFind(false)} rows={rows} onReplace={(rowId, colKey, newVal) => updateCell(rowId, colKey, JSON.stringify(newVal))} />}
```

- [ ] **Step 3: Wire toolbar "查找" button to setShowFind(true)**

In `SmartSheetToolbar`, change `onSearch` to actually open the dialog.

- [ ] **Step 4: Build check**

Run: `cd frontend && npx tsc --noEmit && npx vite build 2>&1 | grep -E "✓|error"`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/smartsheet/components/FindReplaceDialog.tsx frontend/src/features/smartsheet/SmartSheetPage.tsx
git commit -m "feat: FindReplaceDialog with Ctrl+F, match highlight, replace/replaceAll"
```

---

### Task 8: ImportDialog 重写 + 导出增强

**Files:**
- Rewrite: `frontend/src/features/smartsheet/components/ImportDialog.tsx`
- Modify: `frontend/src/features/smartsheet/SmartSheetPage.tsx`
- Modify: `src/main/java/com/example/demo/modules/smartsheet/controller/SmartsheetController.java`

- [ ] **Step 1: Rewrite ImportDialog with proper CSV import flow**

Rewrite `ImportDialog.tsx` — three-step flow:
1. Upload CSV file → parse with `FileReader`
2. Preview first 5 rows → column mapping dropdowns
3. Confirm → POST to backend

Key code (simplified for plan):
```tsx
// Step 1: file upload
// Step 2: mapping table — file columns → sheet columns
// Step 3: confirm → call batchRows API
```

- [ ] **Step 2: Add backend Excel export stub**

In `SmartsheetController.java`, add a proper CSV export with BOM for Chinese characters:
```java
@GetMapping("/sheet/{id}/export-csv")
public void exportCsv(@PathVariable Long id, HttpServletResponse response) throws IOException {
    // ... existing but add UTF-8 BOM: response.getWriter().write('﻿');
}
```

- [ ] **Step 3: Wire import dialog to toolbar**

In `SmartSheetPage`:
```tsx
const [showImport, setShowImport] = useState(false);
// ... wire onImport to setShowImport(true)
{showImport && <ImportDialog sheetId={id!} columns={sheet.columnsConfig} open={showImport} onClose={() => setShowImport(false)} onImported={() => invalidate()} />}
```

- [ ] **Step 4: Build check**

Run: `cd frontend && npx tsc --noEmit && npx vite build 2>&1 | grep -E "✓|error"`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/smartsheet/components/ImportDialog.tsx frontend/src/features/smartsheet/SmartSheetPage.tsx
git commit -m "feat: rewrite ImportDialog with 3-step CSV flow, wire to toolbar"
```

---

### Task 9: 条件格式面板

**Files:**
- Create: `frontend/src/features/smartsheet/components/ConditionalFormatPanel.tsx`
- Modify: `frontend/src/features/smartsheet/SmartSheetPage.tsx`

- [ ] **Step 1: Create ConditionalFormatPanel**

Define condition format rules that users can configure:
```typescript
type ConditionRule = {
  id: string;
  columnKey: string;
  operator: 'gte' | 'lte' | 'eq' | 'contains';
  value: string;
  style: 'great' | 'warn' | 'bad';
};
```

Panel component allows add/edit/delete rules. Rules stored in component state (future: persist to backend).

- [ ] **Step 2: Apply conditional format classes in CellDisplay**

In `SmartSheetGrid.tsx` cell render, check rules against cell value:
```tsx
const cfClass = conditionalFormat && rules.length ? evaluateRules(cv.v, col.key, rules) : '';
// ... append cfClass to className: smartsheet-cf-great | smartsheet-cf-warn | smartsheet-cf-bad
```

- [ ] **Step 3: Build check + commit**

```bash
git add frontend/src/features/smartsheet/components/ConditionalFormatPanel.tsx frontend/src/features/smartsheet/components/SmartSheetGrid.tsx
git commit -m "feat: conditional format rules panel + cell rendering"
```

---

### Task 10: 最终集成 + 验证

**Files:**
- Modify: `frontend/src/features/smartsheet/SmartSheetPage.tsx` (final wiring)

- [ ] **Step 1: Full integration wiring**

Ensure SmartSheetPage passes all props correctly:
- FormatContext.Provider wraps the toolbar + grid
- FindReplaceDialog, ImportDialog conditionally rendered
- All toolbar buttons have real handlers

- [ ] **Step 2: Full build**

```bash
cd frontend && npx vite build
```
Expected: Build success, all components tree-shaken correctly

- [ ] **Step 3: Manual verification checklist**

- [ ] ⋮ 菜单不超出画面
- [ ] 右键菜单仅行操作，Ctrl+C/V 原生可用
- [ ] 增删行生效
- [ ] 单元格编辑保存后刷新正确
- [ ] B/I/底色/字体色/字号 应用并持久化
- [ ] Ctrl+Z/Y 撤销重做
- [ ] Ctrl+F 唤起查找替换
- [ ] 导入 CSV 全流程
- [ ] 导出 CSV 正确
- [ ] 斑马纹/冻结/条件格式开关生效
- [ ] 暗色模式下格式颜色正确
- [ ] 所有颜色引用 --app-* 令牌（G04）

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: SmartSheet V2 complete — real toolbar, formatting, find/replace, import, conditional format"
```