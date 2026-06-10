# SmartSheet 编辑器 V3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans.
> **上承**: V2 (docs/superpowers/plans/2026-06-10-smartsheet-editor-v2-plan.md) — 已完成的 10 个 Task。

**Goal:** 补齐 WPS 级编辑体验 — 框选统一设格式、行高拖拽、列头排序、格式刷、边框、行列号、键盘快捷键。

**Architecture:** 所有新功能解耦为独立组件/hook。框选状态通过 `useCellSelection` hook 管理。格式刷通过 `FormatPainterContext` 传递。

**Tech Stack:** React 19 + TypeScript + @tanstack/react-table + Tailwind CSS

---

## File Structure

```
frontend/src/features/smartsheet/
├── hooks/
│   ├── useCellSelection.ts     — Create: 框选状态 (anchor + active cells)
│   └── useFormatPainter.ts     — Create: 格式刷状态
├── components/
│   ├── SmartSheetGrid.tsx       — Modify: 框选交互 + 行高拖拽 + 列头排序
│   ├── FormatBar.tsx            — Modify: 格式刷按钮 + 边框按钮
│   ├── FormatPainterCursor.tsx  — Create: 格式刷鼠标光标
│   └── SmartSheetToolbar.tsx    — Modify: 键盘快捷键提示
└── styles/
    └── smartsheet-theme.css     — Modify: 框选高亮 + 行号列 + 边框样式
```

---

### Task 1: 框选多格 (Range Selection)

**Files:**
- Create: `frontend/src/features/smartsheet/hooks/useCellSelection.ts`
- Modify: `frontend/src/features/smartsheet/components/SmartSheetGrid.tsx`

- [ ] **Step 1: Create useCellSelection hook**

```typescript
// useCellSelection.ts
import { useState, useCallback } from 'react';

export interface CellRange {
  startRow: number; startCol: number;
  endRow: number; endCol: number;
}

export function useCellSelection() {
  const [anchor, setAnchor] = useState<{ row: number; col: number } | null>(null);
  const [range, setRange] = useState<CellRange | null>(null);

  const selectCell = useCallback((row: number, col: number, shiftKey: boolean) => {
    if (shiftKey && anchor) {
      setRange({
        startRow: Math.min(anchor.row, row), startCol: Math.min(anchor.col, col),
        endRow: Math.max(anchor.row, row), endCol: Math.max(anchor.col, col),
      });
    } else {
      setAnchor({ row, col });
      setRange({ startRow: row, startCol: col, endRow: row, endCol: col });
    }
  }, [anchor]);

  const isSelected = useCallback((row: number, col: number): boolean => {
    if (!range) return false;
    return row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol;
  }, [range]);

  const clearSelection = useCallback(() => { setAnchor(null); setRange(null); }, []);

  const getSelectedCells = useCallback((rows: SmartSheetRow[], columns: ColumnConfig[]): { rowId: string; colKey: string }[] => {
    if (!range) return [];
    const cells: { rowId: string; colKey: string }[] = [];
    for (let r = range.startRow; r <= range.endRow && r < rows.length; r++) {
      for (let c = range.startCol; c <= range.endCol && c < columns.length; c++) {
        cells.push({ rowId: rows[r].id, colKey: columns[c].key });
      }
    }
    return cells;
  }, [range]);

  return { anchor, range, selectCell, isSelected, clearSelection, getSelectedCells };
}
```

- [ ] **Step 2: Integrate into SmartSheetGrid**

In `SmartSheetGrid.tsx`:
- Import and call `useCellSelection()`
- In `onClick` handlers (td and span): call `selectCell(rowIdx, colIdx, e.shiftKey)` instead of just `setEditingCell`
- When `range` exists and has multiple cells: show blue selection highlight (CSS class `.cell-selected`)
- Add CSS: `.bt-grid td.dc.cell-selected { background: var(--app-color-accent-soft) !important; outline: 1px solid var(--app-color-accent); outline-offset: -1px; }`

- [ ] **Step 3: Batch apply format to selected cells**

When FormatBar changes format AND there are multiple selected cells:
- In `SmartSheetPage`, add `onBatchFormat(cells, format)` handler
- When selection has >1 cell, format change applies to ALL selected cells at once
- Call `updateCell` for each selected cell with merged format

- [ ] **Step 4: Build + commit**

```bash
cd frontend && npx tsc --noEmit && npx vite build
git add ... && git commit -m "feat: range selection with Shift+click, batch format apply"
```

---

### Task 2: 行高拖拽调节

**Files:**
- Modify: `frontend/src/features/smartsheet/components/SmartSheetGrid.tsx`
- Modify: `frontend/src/styles/smartsheet-theme.css`

- [ ] **Step 1: Add row resize handles**

Add a resize handle to the bottom edge of each row header cell (`.rh`). Implementation similar to column resize:
- Track `rowHeights: Record<string, number>` state
- On `mousedown` on the handle: record start Y + start height
- On `mousemove`: calculate new height
- On `mouseup`: finalize
- Apply `height` inline style to `<tr>` elements

- [ ] **Step 2: Build + commit**

```bash
git add ... && git commit -m "feat: row height drag resize"
```

---

### Task 3: 列头排序

**Files:**
- Modify: `frontend/src/features/smartsheet/components/SmartSheetGrid.tsx`
- Modify: `frontend/src/features/smartsheet/hooks/useSmartSheet.ts`

- [ ] **Step 1: Add sort state + toggle**

In `SmartSheetGrid`:
- `const [sortCol, setSortCol] = useState<string | null>(null);`
- `const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');`
- Click column header: toggle sort direction for that column, clear others
- Visual indicator: `▲` / `▼` arrow next to column name
- Sort data client-side: `rows.sort((a, b) => compare by column key)`

- [ ] **Step 2: Build + commit**

---

### Task 4: 格式刷 (Format Painter)

**Files:**
- Create: `frontend/src/features/smartsheet/hooks/useFormatPainter.ts`
- Modify: `frontend/src/features/smartsheet/components/FormatBar.tsx`

- [ ] **Step 1: Create useFormatPainter hook**

```typescript
export function useFormatPainter() {
  const [sourceFormat, setSourceFormat] = useState<CellFormat | null>(null);
  const [isActive, setIsActive] = useState(false);

  const copyFormat = (fmt: CellFormat) => { setSourceFormat(fmt); setIsActive(true); };
  const applyFormat = (): CellFormat | null => isActive ? sourceFormat : null;
  const clear = () => { setIsActive(false); setSourceFormat(null); };
  return { sourceFormat, isActive, copyFormat, applyFormat, clear };
}
```

- [ ] **Step 2: Add format painter button to FormatBar**

A paintbrush icon button:
- Click once on a formatted cell → click format painter button → cursor changes to crosshair
- Click on target cell(s) → apply source format → deactivate painter
- ESC cancels

- [ ] **Step 3: Build + commit**

---

### Task 5: 单元格边框

**Files:**
- Modify: `frontend/src/features/smartsheet/components/FormatBar.tsx`
- Modify: `frontend/src/styles/smartsheet-theme.css`

- [ ] **Step 1: Add border buttons to FormatBar**

A border dropdown button with options:
- 所有框线 (all borders)
- 外框线 (outer border)
- 下框线 (bottom border)
- 清除边框 (clear)

Store as `CellFormat.border?: { top?: boolean; right?: boolean; bottom?: boolean; left?: boolean }`

- [ ] **Step 2: Apply border in CellDisplay**

```css
.cell-border-top { border-top: 1px solid var(--smartsheet-text); }
.cell-border-right { border-right: 1px solid var(--smartsheet-text); }
.cell-border-bottom { border-bottom: 1px solid var(--smartsheet-text); }
.cell-border-left { border-left: 1px solid var(--smartsheet-text); }
```

- [ ] **Step 3: Build + commit**

---

### Task 6: 行列号显示 + 键盘快捷键

**Files:**
- Modify: `frontend/src/features/smartsheet/components/SmartSheetGrid.tsx`
- Modify: `frontend/src/features/smartsheet/components/FormatBar.tsx`

- [ ] **Step 1: Row numbers column**

Add an auto-incrementing row number column (like Excel/WPS row headers 1, 2, 3...):
- New column `__row_num` at position 0, before `__row_header`
- Width: 40px, non-editable, gray text, sticky left
- Shows `row.index + 1`

- [ ] **Step 2: Keyboard shortcuts in FormatBar**

- `Ctrl+B` → toggle Bold
- `Ctrl+I` → toggle Italic
- `Ctrl+Z` → undo (already)
- `Ctrl+Y` → redo (already)
- `Ctrl+F` → find (already)
- `Tab` → next cell right (already in CellEditor)
- `Shift+Tab` → previous cell left
- `Enter` → cell below
- `Delete` → clear selected cell(s)
- `Ctrl+A` → select all

Add `useEffect` in SmartSheetGrid listening for these key combos.

- [ ] **Step 3: Build + commit**

---

## Quality Gates

- [ ] 框选高亮和 WPS 一致（浅蓝底 + 深蓝边框）
- [ ] 格式刷单次点击生效，ESC 取消
- [ ] 列排序有视觉箭头指示
- [ ] 行高拖拽不闪烁
- [ ] 键盘快捷键不与浏览器快捷键冲突
- [ ] 所有颜色通过 `--app-*` 令牌引用（G04）
