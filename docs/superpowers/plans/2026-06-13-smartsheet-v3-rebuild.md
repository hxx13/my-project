# Smartsheet V3 — 完全重建 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 完全推倒 smartsheet 前端——删除 13 个旧文件、新建/重写 10 个文件、后端加 1 个端点。VTable 原生能力优先，5 按钮工具栏，自定义模板系统。

**Architecture:** VTable ListTable 承担渲染/编辑/排序/筛选/冻结/右键菜单等全部表格交互。React 层仅负责工具栏按钮（添加行、导入、导出、存模板、列配置）+ 数据桥接（API ↔ VTable option）。ARCO 主题叠加 Bento 颜色覆盖。

**Tech Stack:** @visactor/vtable + @visactor/react-vtable + @visactor/vtable-export (FE) · Spring Boot + MyBatis + POI (BE)

**Design Doc:** [2026-06-13-smartsheet-v3-rebuild-design.md](../specs/2026-06-13-smartsheet-v3-rebuild-design.md)

---

## File Map

### 删除（13 个）
```
components/SmartSheetToolbar.tsx     → 工具栏内联到 SmartSheetPage
components/SmartSheetTabsRow.tsx     → 暂不需要多sheet
components/SmartSheetColumnConfigSheet.tsx → 被新 ColumnConfigPanel 替代
components/SmartSheetImportDialog.tsx → 合并到 ImportDialog
components/FormatBar.tsx             → VTable 内置格式化
components/ColorPicker.tsx           → 随 FormatBar 删除
hooks/useSmartSheet.ts              → 被新 hooks 替代
hooks/useCellFormat.ts              → VTable 内置
hooks/useSmartSheetStats.ts         → VTable 内置
vtable-config/editors.ts            → 用 onChangeCellValue prop
vtable-config/theme.ts              → ARCO + Bento 覆盖内联
```

### 新建/重写（10 个）
```
types.ts                            → 重写：移除 PRESET_TEMPLATES
SmartSheetListPage.tsx              → 重写：系统预设 + 我的模板 + 表格列表
SmartSheetPage.tsx                  → 重写：5 按钮 + VTable + ARCO-Bento 主题
components/ImportDialog.tsx         → 重写：适配 POST /import API
components/ColumnConfigPanel.tsx    → 新建：列配置侧面板
hooks/useSmartSheetData.ts          → 重写：数据桥接
hooks/useSmartSheetMutation.ts      → 重写：变更提交 + 模板保存
vtable-config/columns.ts           → 更新：默认值工具
api/domains/smartsheet.api.ts       → 更新：加模板删除、导出 URL
controller/SmartsheetController.java → 加 DELETE /template/{id}
```

---

### Task 1: 后端 — DELETE /template/{id}

**Files:**
- Modify: `src/main/java/com/example/demo/modules/smartsheet/controller/SmartsheetController.java`
- Modify: `src/main/java/com/example/demo/modules/smartsheet/service/SmartsheetService.java`

- [ ] **Step 1: SmartsheetService 加取消模板方法**

在 `SmartsheetService.java` 的 `setTemplateFlag` 方法后添加：

```java
public void unsetTemplateFlag(Long id) {
    getById(id);
    definitionMapper.updateTemplateFlag(id, 0);
}
```

- [ ] **Step 2: Controller 加 DELETE 端点**

在 `SmartsheetController.java` 的 template 区块添加：

```java
@DeleteMapping("/template/{id}")
public Result<Void> deleteTemplate(@PathVariable Long id, HttpServletRequest request) {
    Result<?> denied = requireMinRole(request, RoleEnum.ADMIN);
    if (denied != null) return Result.error(denied.getMessage());
    sheetService.unsetTemplateFlag(id);
    return Result.success(null);
}
```

- [ ] **Step 3: 编译验证 + Commit**

```bash
./mvnw compile -q && git add -A && git commit -m "feat: add DELETE /api/admin/smartsheet/template/{id} endpoint"
```

---

### Task 2: 删除所有旧文件

**Files:** git rm 13 个文件

- [ ] **Step 1: 删除旧组件和 hooks**

```bash
cd d:/codex/verson.1.2/20260416/.claude/worktrees/smartsheet-v2-vtable
git rm frontend/src/features/smartsheet/components/SmartSheetToolbar.tsx
git rm frontend/src/features/smartsheet/components/SmartSheetTabsRow.tsx
git rm frontend/src/features/smartsheet/components/SmartSheetColumnConfigSheet.tsx
git rm frontend/src/features/smartsheet/components/SmartSheetImportDialog.tsx
git rm frontend/src/features/smartsheet/components/FormatBar.tsx
git rm frontend/src/features/smartsheet/components/ColorPicker.tsx
git rm frontend/src/features/smartsheet/hooks/useSmartSheet.ts
git rm frontend/src/features/smartsheet/hooks/useCellFormat.ts 2>/dev/null || true
git rm frontend/src/features/smartsheet/hooks/useSmartSheetStats.ts 2>/dev/null || true
git rm frontend/src/features/smartsheet/vtable-config/editors.ts
git rm frontend/src/features/smartsheet/vtable-config/theme.ts
```

- [ ] **Step 2: Commit**

```bash
git commit -m "refactor: remove 11 old smartsheet components/hooks — VTable-native replaces all"
```

---

### Task 3: 重写 types.ts

**Files:**
- Modify: `frontend/src/features/smartsheet/types.ts`

- [ ] **Step 1: 用以下内容替换整个文件**

```typescript
// frontend/src/features/smartsheet/types.ts — V3 clean

export type LayoutMode = 'matrix' | 'table' | 'checklist' | 'calendar';
export type ColumnType = 'text' | 'number' | 'select' | 'multi-select'
  | 'date' | 'checkbox' | 'user' | 'progressbar' | 'radio';

export interface ColumnConfig {
  key: string;
  label: string;
  type: ColumnType;
  options?: string[];
  required?: boolean;
  width?: number;
  min?: number;
  max?: number;
}

export interface SmartSheetDefinition {
  id: string;
  name: string;
  description: string;
  layoutMode: LayoutMode;
  columnsConfig: ColumnConfig[];
  rowEntitySource?: { type: 'manual' | 'reference'; tableName?: string; labelField?: string; valueField?: string };
  templateId?: string;
  isPinned?: number;
  isTemplate?: number;
  rowLimit?: number;
  themeConfig?: Record<string, string>;
  rowCount?: number;
  createdBy?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SmartSheetRow {
  id: string;
  sheetId: string;
  rowIndex: number;
  rowLabel: string;
  rowEntityId?: string;
  cellData: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface SmartsheetSheetRequest {
  name: string;
  description?: string;
  layoutMode: LayoutMode;
  columnsConfig: ColumnConfig[];
  rowEntitySource?: object;
  templateId?: string;
  isTemplate?: boolean;
}

export interface SmartsheetCellUpdateRequest {
  columnKey: string;
  value: unknown;
  expectedVersion: number;
}

export interface SmartsheetImportResult {
  totalRows: number;
  importedRows: number;
  skippedRows: number;
  errors: string[];
  preview: Record<string, string>[];
}

/** System preset templates (2 built-in starting points) */
export interface SystemPreset {
  id: string;
  name: string;
  description: string;
  layoutMode: LayoutMode;
  defaultColumns: ColumnConfig[];
}

export const SYSTEM_PRESETS: SystemPreset[] = [
  {
    id: 'sys-checklist',
    name: '勾选清单',
    description: '逐项确认模式。适合安全巡检、设备点检、审计核对表',
    layoutMode: 'checklist',
    defaultColumns: [
      { key: 'col_check', label: '结果', type: 'checkbox' },
      { key: 'col_note', label: '备注', type: 'text' },
      { key: 'col_inspector', label: '检查人', type: 'user' },
    ],
  },
  {
    id: 'sys-table',
    name: '数据表格',
    description: '列头+行记录，支持排序筛选。适合设备清单、人员花名册、资产台账',
    layoutMode: 'table',
    defaultColumns: [
      { key: 'col_name', label: '名称', type: 'text' },
      { key: 'col_status', label: '状态', type: 'select', options: ['在用', '闲置', '报废'] },
      { key: 'col_date', label: '日期', type: 'date' },
    ],
  },
];
```

- [ ] **Step 2: 验证编译 + Commit**

```bash
cd frontend && npx tsc --noEmit && cd .. && git add -A && git commit -m "refactor: smartsheet v3 types — remove PRESET_TEMPLATES, add SYSTEM_PRESETS"
```

---

### Task 4: 更新 columns.ts 工具模块

**Files:**
- Modify: `frontend/src/features/smartsheet/vtable-config/columns.ts`

- [ ] **Step 1: 用以下内容替换**

```typescript
// frontend/src/features/smartsheet/vtable-config/columns.ts
import type { ColumnConfig } from '../types';

export const CELL_TYPE_MAP: Record<string, string> = {
  checkbox: 'checkbox',
  radio: 'radio',
  progressbar: 'progressbar',
  switch: 'switch',
};

export function buildVTableColumns(cols: ColumnConfig[]): Record<string, unknown>[] {
  return cols.map((col) => {
    const def: Record<string, unknown> = {
      field: col.key,
      title: col.label,
      width: col.width ?? 120,
    };
    const vtype = CELL_TYPE_MAP[col.type];
    if (vtype) def.cellType = vtype;
    if ((col.type === 'select' || col.type === 'multi-select') && col.options) {
      def.fieldFormat = {
        type: col.type === 'multi-select' ? 'multiple' : 'single',
        options: col.options.map((o) => ({ label: o, value: o })),
      };
    }
    if (col.type === 'number') def.fieldFormat = { type: 'number' };
    if (col.type === 'date') def.fieldFormat = { type: 'date' };
    return def;
  });
}

export function buildVTableRecords(
  rows: { id: string; cellData: Record<string, unknown>; version: number }[]
): Record<string, unknown>[] {
  return rows.map((row) => ({ __id: row.id, __version: row.version, ...row.cellData }));
}

export function getDefaultCellValue(type: ColumnConfig['type']): unknown {
  switch (type) {
    case 'checkbox': return false;
    case 'number': case 'progressbar': return 0;
    case 'radio': case 'text': case 'select': case 'multi-select':
    case 'user': case 'date':
    default: return '';
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd frontend && npx tsc --noEmit && cd .. && git add -A && git commit -m "refactor: simplify columns.ts — CELL_TYPE_MAP, getDefaultCellValue"
```

---

### Task 5: 更新 smartsheet.api.ts

**Files:**
- Modify: `frontend/src/api/domains/smartsheet.api.ts`

- [ ] **Step 1: 加模板删除 + 更新导入导出函数**

在文件末尾添加：

```typescript
// ═══════ Template delete (NEW) ═══════
export async function deleteTemplate(id: string) {
  await adminHttp.delete(`${BASE}/template/${id}`);
}

// ═══════ Export URLs ═══════
export function getCsvExportUrl(sheetId: string) {
  return `/api/admin/smartsheet/${sheetId}/export/csv`;
}

export function getXlsxExportUrl(sheetId: string) {
  return `/api/admin/smartsheet/${sheetId}/export/xlsx`;
}

// ═══════ Import (UPDATED — uses new POST /import) ═══════
export async function importFile(sheetId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  const { data } = await adminHttp.post(`${BASE}/${sheetId}/import`, form);
  return data.data as SmartsheetImportResult;
}
```

- [ ] **Step 2: 更新 createSheet 签名**

修改 `createSheet` 函数以接收 `SmartsheetSheetRequest`：

```typescript
export async function createSheet(req: SmartsheetSheetRequest) {
  const { data } = await adminHttp.post(`${BASE}/sheet`, req);
  return normalizeSheet(data.data);
}
```

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat: update API layer — deleteTemplate, export URLs, importFile"
```

---

### Task 6: 重写 useSmartSheetData hook

**Files:**
- Modify: `frontend/src/features/smartsheet/hooks/useSmartSheetData.ts`

- [ ] **Step 1: 用以下内容替换**

```typescript
// frontend/src/features/smartsheet/hooks/useSmartSheetData.ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSheet, fetchRows } from '@/api/domains/smartsheet.api';
import { buildVTableColumns, buildVTableRecords } from '../vtable-config/columns';
import * as VTable from '@visactor/vtable';

export function useSmartSheetData(sheetId: string | undefined) {
  const sheetQuery = useQuery({
    queryKey: ['smartsheet', sheetId],
    queryFn: () => getSheet(sheetId!),
    enabled: !!sheetId,
  });

  const rowsQuery = useQuery({
    queryKey: ['smartsheet-rows', sheetId],
    queryFn: () => fetchRows(sheetId!),
    enabled: !!sheetId,
  });

  const vtableColumns = useMemo(
    () => sheetQuery.data ? buildVTableColumns(sheetQuery.data.columnsConfig) : [],
    [sheetQuery.data],
  );

  const vtableRecords = useMemo(
    () => rowsQuery.data ? buildVTableRecords(rowsQuery.data) : [],
    [rowsQuery.data],
  );

  // ARCO theme + Bento color override
  const theme = useMemo(() => {
    const style = typeof document !== 'undefined'
      ? getComputedStyle(document.documentElement) : null;
    const c = (prop: string, fallback: string) =>
      style?.getPropertyValue(prop).trim() || fallback;

    return VTable.themes.ARCO.extends({
      defaultStyle: { bgColor: c('--app-color-surface-container', '#ffffff') },
      headerStyle: { bgColor: c('--app-color-surface-page', '#fafafa') },
      frameStyle: { borderColor: c('--app-color-border-default', '#e5e7eb') },
      selectionStyle: { cellBgColor: c('--app-color-primary-light', '#dbeafe') },
      bodyStyle: { color: c('--app-color-text-primary', '#111827') },
    });
  }, []);

  return {
    sheet: sheetQuery.data ?? null,
    rows: rowsQuery.data ?? [],
    vtableColumns,
    vtableRecords,
    theme,
    isLoading: sheetQuery.isLoading || rowsQuery.isLoading,
    refetch: () => { sheetQuery.refetch(); rowsQuery.refetch(); },
  };
}
```

- [ ] **Step 2: Commit**

```bash
cd frontend && npx tsc --noEmit && cd .. && git add -A && git commit -m "refactor: useSmartSheetData — ARCO+Bento theme, vtable columns/records"
```

---

### Task 7: 重写 useSmartSheetMutation hook

**Files:**
- Modify: `frontend/src/features/smartsheet/hooks/useSmartSheetMutation.ts`

- [ ] **Step 1: 用以下内容替换**

```typescript
// frontend/src/features/smartsheet/hooks/useSmartSheetMutation.ts
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { updateCell, addRow, deleteRow, saveAsTemplate } from '@/api/domains/smartsheet.api';

export function useSmartSheetMutation(sheetId: string | undefined) {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    if (!sheetId) return;
    queryClient.invalidateQueries({ queryKey: ['smartsheet', sheetId] });
    queryClient.invalidateQueries({ queryKey: ['smartsheet-rows', sheetId] });
  }, [queryClient, sheetId]);

  const handleCellChange = useCallback(async (
    rowId: string, columnKey: string, value: unknown, version: number,
  ) => {
    if (!sheetId) return;
    try {
      await updateCell(sheetId, rowId, { columnKey, value, expectedVersion: version });
    } catch (e) {
      toast.error((e as Error).message || '保存失败');
      invalidate();
    }
  }, [sheetId, invalidate]);

  const handleAddRow = useCallback(async () => {
    if (!sheetId) return;
    try { await addRow(sheetId); invalidate(); }
    catch (e) { toast.error((e as Error).message || '添加行失败'); }
  }, [sheetId, invalidate]);

  const handleDeleteRows = useCallback(async (rowIds: string[]) => {
    if (!sheetId) return;
    try {
      for (const id of rowIds) await deleteRow(sheetId, id);
      invalidate();
      toast.success('已删除');
    } catch (e) { toast.error((e as Error).message || '删除失败'); }
  }, [sheetId, invalidate]);

  const handleSaveTemplate = useCallback(async () => {
    if (!sheetId) return;
    try {
      await saveAsTemplate(sheetId);
      queryClient.invalidateQueries({ queryKey: ['smartsheet-templates'] });
      queryClient.invalidateQueries({ queryKey: ['smartsheet-list'] });
      toast.success('已保存为模板');
    } catch (e) { toast.error((e as Error).message || '保存模板失败'); }
  }, [sheetId, queryClient]);

  return { handleCellChange, handleAddRow, handleDeleteRows, handleSaveTemplate, invalidate };
}
```

- [ ] **Step 2: Commit**

```bash
cd frontend && npx tsc --noEmit && cd .. && git add -A && git commit -m "refactor: useSmartSheetMutation — add handleSaveTemplate"
```

---

### Task 8: 重写 SmartSheetListPage（全新列表页）

**Files:**
- Modify: `frontend/src/features/smartsheet/SmartSheetListPage.tsx`

- [ ] **Step 1: 用以下完整代码替换**

```typescript
// SmartSheetListPage — V3: 系统预设 + 我的模板 + 全部表格
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Table2, Plus, Pin, MoreVertical, FileDown, FileJson, Printer, Link2,
  Trash2, Copy, Pencil, Eraser, Eye, Upload, X,
} from 'lucide-react';
import { AdminPageShell } from '@/components/admin/AdminPageShell';
import {
  fetchSheetPage, createSheet, deleteSheet, bulkDeleteSheets, renameSheet,
  duplicateSheet, clearSheetData, togglePinSheet, getExportUrl,
  getExportJsonUrl, importJsonBackup, fetchTemplates, deleteTemplate,
} from '@/api/domains/smartsheet.api';
import { SYSTEM_PRESETS } from './types';
import type { SmartSheetDefinition } from './types';
import toast from 'react-hot-toast';

export default function SmartSheetListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['smartsheet-list'],
    queryFn: () => fetchSheetPage(1, 100),
  });

  const { data: templates } = useQuery({
    queryKey: ['smartsheet-templates'],
    queryFn: fetchTemplates,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['smartsheet-list'] });
    queryClient.invalidateQueries({ queryKey: ['smartsheet-templates'] });
  };

  const createMut = useMutation({
    mutationFn: createSheet,
    onSuccess: (s) => { invalidate(); navigate(`/admin/smartsheet/${s.id}`); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({ mutationFn: deleteSheet, onSuccess: () => { invalidate(); toast.success('已删除'); } });
  const bulkDeleteMut = useMutation({ mutationFn: bulkDeleteSheets, onSuccess: () => { invalidate(); setSelected(new Set()); toast.success('批量删除完成'); } });
  const renameMut = useMutation({ mutationFn: ({ id, name }: { id: string; name: string }) => renameSheet(id, name), onSuccess: () => invalidate() });
  const duplicateMut = useMutation({ mutationFn: ({ id, withData }: { id: string; withData: boolean }) => duplicateSheet(id, withData), onSuccess: () => { invalidate(); toast.success('已复制'); } });
  const clearMut = useMutation({ mutationFn: clearSheetData, onSuccess: () => { invalidate(); toast.success('数据已清空'); } });
  const pinMut = useMutation({ mutationFn: togglePinSheet, onSuccess: () => invalidate() });
  const deleteTplMut = useMutation({ mutationFn: deleteTemplate, onSuccess: () => invalidate() });

  const filtered = data?.list?.filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase())) ?? [];
  const pinned = filtered.filter(s => s.isPinned === 1);
  const unpinned = filtered.filter(s => s.isPinned !== 1);

  const handleImportJson = async (sheetId: string) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0]; if (!file) return;
      try {
        const backup = JSON.parse(await file.text());
        await importJsonBackup(sheetId, backup);
        invalidate(); toast.success('JSON 导入完成');
      } catch (e) { toast.error('导入失败: ' + (e as Error).message); }
    };
    input.click();
  };

  const exportJson = (sheetId: string, name: string) => {
    const a = document.createElement('a');
    a.href = getExportJsonUrl(sheetId); a.download = `${name}.json`; a.click();
  };

  return (
    <AdminPageShell title="智能表格">
      {/* Search + New */}
      <div className="flex items-center gap-3 mb-4">
        <input placeholder="🔍 搜索表格..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 max-w-[320px] px-3 py-1.5 rounded-[10px] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-sm text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-primary)] transition-colors" />
        <button onClick={() => createMut.mutate({ name: `空白表格 ${new Date().toLocaleDateString()}`, layoutMode: 'table', columnsConfig: [{ key: 'col_1', label: '列1', type: 'text' }] })}
          className="px-3 py-1.5 rounded-[10px] text-[12px] font-medium bg-[var(--app-color-primary)] text-white hover:opacity-90 transition-opacity flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> 新建空白表格
        </button>
        {selected.size > 0 && (
          <button onClick={() => { if (confirm(`确定删除 ${selected.size} 个表格？`)) bulkDeleteMut.mutate([...selected]); }}
            className="px-3 py-1.5 rounded-[10px] text-[12px] font-medium bg-[var(--app-color-feedback-danger)] text-white hover:opacity-90 flex items-center gap-1">
            <Trash2 className="w-3.5 h-3.5" /> 删除选中 ({selected.size})
          </button>
        )}
      </div>

      {/* System Presets */}
      <div className="mb-4">
        <h3 className="text-[11px] font-semibold text-[var(--app-color-text-secondary)] uppercase tracking-wider mb-2">📋 系统预设</h3>
        <div className="flex gap-3 flex-wrap">
          {SYSTEM_PRESETS.map(tpl => (
            <button key={tpl.id}
              onClick={() => createMut.mutate({ name: `${tpl.name} ${new Date().toLocaleDateString()}`, description: tpl.description, layoutMode: tpl.layoutMode, columnsConfig: tpl.defaultColumns })}
              className="px-4 py-3 rounded-[14px] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] hover:border-[var(--app-color-primary)] text-sm transition-all shadow-[var(--app-shadow-card)] text-left min-w-[160px]">
              <div className="font-semibold text-[var(--app-color-text-primary)] text-[13px]">{tpl.name}</div>
              <div className="text-[11px] text-[var(--app-color-text-secondary)] mt-1 leading-relaxed">{tpl.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* My Templates */}
      {templates && templates.length > 0 && (
        <div className="mb-4">
          <h3 className="text-[11px] font-semibold text-[var(--app-color-text-secondary)] uppercase tracking-wider mb-2">💾 我的模板</h3>
          <div className="flex gap-3 flex-wrap">
            {templates.map(tpl => (
              <div key={tpl.id}
                className="px-4 py-3 rounded-[14px] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] hover:border-[var(--app-color-primary)] transition-all shadow-[var(--app-shadow-card)] text-left min-w-[160px] relative group">
                <button onClick={() => createMut.mutate({ name: `${tpl.name} ${new Date().toLocaleDateString()}`, layoutMode: tpl.layoutMode, columnsConfig: tpl.columnsConfig, templateId: tpl.id })}
                  className="w-full text-left">
                  <div className="font-semibold text-[var(--app-color-text-primary)] text-[13px]">{tpl.name}</div>
                  <div className="text-[11px] text-[var(--app-color-text-secondary)] mt-1">{tpl.columnsConfig?.length ?? 0}列 · {new Date(tpl.updatedAt).toLocaleDateString()}</div>
                </button>
                <button onClick={(e) => { e.stopPropagation(); if (confirm(`移除模板「${tpl.name}」？表格不会被删除`)) deleteTplMut.mutate(tpl.id); }}
                  className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded-full hover:bg-[var(--app-color-feedback-danger-soft)] transition-all">
                  <X className="w-3 h-3 text-[var(--app-color-feedback-danger)]" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Sheets */}
      {isLoading ? (
        <div className="text-sm text-[var(--app-color-text-secondary)] py-4">加载中...</div>
      ) : (
        <>
          {pinned.length > 0 && (
            <div className="mb-3">
              <h3 className="text-[11px] font-semibold text-[var(--app-color-text-secondary)] uppercase tracking-wider mb-2">📌 已置顶</h3>
              <div className="flex flex-col gap-1.5">
                {pinned.map(s => <SheetRow key={s.id} sheet={s} selected={selected.has(s.id)}
                  onToggleSel={() => setSelected(p => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}
                  onOpen={() => navigate(`/admin/smartsheet/${s.id}`)}
                  onDelete={() => deleteMut.mutate(s.id)}
                  onRename={name => renameMut.mutate({ id: s.id, name })}
                  onDuplicate={wd => duplicateMut.mutate({ id: s.id, withData: wd })}
                  onClear={() => clearMut.mutate(s.id)}
                  onPin={() => pinMut.mutate(s.id)}
                  onExportCsv={() => { const a = document.createElement('a'); a.href = getExportUrl(s.id); a.download = `${s.name}.csv`; a.click(); }}
                  onExportJson={() => exportJson(s.id, s.name)}
                  onImportJson={() => handleImportJson(s.id)} />)}
              </div>
            </div>
          )}
          <div>
            {pinned.length > 0 && <h3 className="text-[11px] font-semibold text-[var(--app-color-text-secondary)] uppercase tracking-wider mb-2">全部表格</h3>}
            {unpinned.length === 0 && pinned.length === 0 ? (
              <div className="text-sm text-[var(--app-color-text-secondary)] py-4">暂无表格，从上方模板新建</div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {unpinned.map(s => <SheetRow key={s.id} sheet={s} selected={selected.has(s.id)}
                  onToggleSel={() => setSelected(p => { const n = new Set(p); n.has(s.id) ? n.delete(s.id) : n.add(s.id); return n; })}
                  onOpen={() => navigate(`/admin/smartsheet/${s.id}`)}
                  onDelete={() => deleteMut.mutate(s.id)}
                  onRename={name => renameMut.mutate({ id: s.id, name })}
                  onDuplicate={wd => duplicateMut.mutate({ id: s.id, withData: wd })}
                  onClear={() => clearMut.mutate(s.id)}
                  onPin={() => pinMut.mutate(s.id)}
                  onExportCsv={() => { const a = document.createElement('a'); a.href = getExportUrl(s.id); a.download = `${s.name}.csv`; a.click(); }}
                  onExportJson={() => exportJson(s.id, s.name)}
                  onImportJson={() => handleImportJson(s.id)} />)}
              </div>
            )}
          </div>
        </>
      )}
    </AdminPageShell>
  );
}

// ═══════ SheetRow (unchanged from V1) ═══════
function SheetRow({ sheet, selected, onToggleSel, onOpen, onDelete, onRename, onDuplicate, onClear, onPin, onExportCsv, onExportJson, onImportJson }: {
  sheet: SmartSheetDefinition; selected: boolean; onToggleSel: () => void; onOpen: () => void;
  onDelete: () => void; onRename: (name: string) => void; onDuplicate: (withData: boolean) => void;
  onClear: () => void; onPin: () => void; onExportCsv: () => void; onExportJson: () => void; onImportJson: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuDir, setMenuDir] = useState<'down' | 'up'>('down');
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(sheet.name);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    if (menuBtnRef.current) {
      const rect = menuBtnRef.current.getBoundingClientRect();
      setMenuDir(window.innerHeight - rect.bottom < 340 ? 'up' : 'down');
    }
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, [menuOpen]);

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 rounded-[10px] border transition-all shadow-[var(--app-shadow-card)] group
      ${selected ? 'border-[var(--app-color-primary)] bg-[var(--app-color-primary-light)]' : 'border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] hover:border-[var(--app-color-primary)]'}`}>
      <input type="checkbox" checked={selected} onChange={onToggleSel} className="shrink-0 w-3.5 h-3.5 accent-[var(--app-color-primary)] cursor-pointer" />
      {sheet.isPinned === 1 && <Pin className="w-3 h-3 text-[var(--app-color-primary)] shrink-0" />}
      <Table2 className="w-4 h-4 text-[var(--app-color-text-secondary)] shrink-0" />
      <div className="flex-1 min-w-0" onDoubleClick={() => { setRenaming(true); setNameDraft(sheet.name); }}>
        {renaming ? (
          <input autoFocus value={nameDraft} onChange={e => setNameDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { onRename(nameDraft); setRenaming(false); } if (e.key === 'Escape') setRenaming(false); }}
            onBlur={() => { onRename(nameDraft); setRenaming(false); }}
            className="w-full text-[13px] font-semibold bg-transparent border-b border-[var(--app-color-primary)] outline-none text-[var(--app-color-text-primary)]" />
        ) : (
          <button onClick={onOpen} className="text-left w-full">
            <div className="text-[13px] font-semibold text-[var(--app-color-text-primary)] truncate">{sheet.name}</div>
            <div className="text-[11px] text-[var(--app-color-text-secondary)] flex gap-2 mt-0.5">
              <span>{sheet.layoutMode}</span><span>·</span><span>{new Date(sheet.updatedAt).toLocaleDateString()}</span>
            </div>
          </button>
        )}
      </div>
      <div className="relative shrink-0" ref={menuRef}>
        <button ref={menuBtnRef} onClick={e => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
          className="p-1.5 rounded-[8px] hover:bg-[var(--app-color-surface-container-hover)] transition-colors opacity-0 group-hover:opacity-100">
          <MoreVertical className="w-4 h-4 text-[var(--app-color-text-secondary)]" />
        </button>
        {menuOpen && (
          <div className={`absolute right-0 w-[200px] rounded-[12px] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] shadow-lg py-1.5 z-[var(--z-dropdown)] ${menuDir === 'down' ? 'top-full mt-1' : 'bottom-full mb-1'}`}>
            <MI icon={Eye} label="打开" onClick={() => { onOpen(); setMenuOpen(false); }} />
            <MI icon={Pencil} label="重命名" onClick={() => { setRenaming(true); setNameDraft(sheet.name); setMenuOpen(false); }} />
            <MI icon={Copy} label="复制（空结构）" onClick={() => { onDuplicate(false); setMenuOpen(false); }} />
            <MI icon={Copy} label="复制（含数据）" onClick={() => { onDuplicate(true); setMenuOpen(false); }} />
            <MD />
            <MI icon={Pin} label={sheet.isPinned === 1 ? '取消置顶' : '📌 置顶'} onClick={() => { onPin(); setMenuOpen(false); }} />
            <MD />
            <MI icon={FileDown} label="导出 CSV" onClick={() => { onExportCsv(); setMenuOpen(false); }} />
            <MI icon={FileJson} label="导出 JSON" onClick={() => { onExportJson(); setMenuOpen(false); }} />
            <MI icon={Upload} label="导入 JSON" onClick={() => { onImportJson(); setMenuOpen(false); }} />
            <MI icon={Printer} label="打印" onClick={() => { onOpen(); setTimeout(() => window.print(), 500); setMenuOpen(false); }} />
            <MI icon={Link2} label="复制链接" onClick={() => { navigator.clipboard.writeText(`${location.origin}/admin/smartsheet/${sheet.id}`); toast.success('链接已复制'); setMenuOpen(false); }} />
            <MD />
            <MI icon={Eraser} label="清空数据" danger onClick={() => { if (confirm('确定清空所有行数据？列结构保留。')) { onClear(); setMenuOpen(false); } }} />
            <MI icon={Trash2} label="删除" danger onClick={() => { if (confirm(`确定删除「${sheet.name}」？`)) { onDelete(); setMenuOpen(false); } }} />
          </div>
        )}
      </div>
    </div>
  );
}

function MI({ icon: Icon, label, danger, onClick }: { icon: typeof Eye; label: string; danger?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors text-left
        ${danger ? 'text-[var(--app-color-feedback-danger)] hover:bg-[var(--app-color-feedback-danger-soft)]' : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-container-hover)]'}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" /> {label}
    </button>
  );
}

function MD() { return <div className="h-px bg-[var(--app-color-border-default)] my-1" />; }
```

- [ ] **Step 2: Commit**

```bash
cd frontend && npx tsc --noEmit && cd .. && git add -A && git commit -m "refactor: SmartSheetListPage — system presets + my templates + sheet list"
```

---

### Task 9: 重写 SmartSheetPage（VTable 原生优先编辑页）

**Files:**
- Modify: `frontend/src/features/smartsheet/SmartSheetPage.tsx`

- [ ] **Step 1: 用以下完整代码替换**

```typescript
// SmartSheetPage — V3: VTable-native first. 5-button toolbar.
import React, { useState, useCallback, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ListTable } from '@visactor/react-vtable';
import type { ListTable as ListTableInstance } from '@visactor/vtable';
import { useSmartSheetData } from './hooks/useSmartSheetData';
import { useSmartSheetMutation } from './hooks/useSmartSheetMutation';
import ImportDialog from './components/ImportDialog';
import ColumnConfigPanel from './components/ColumnConfigPanel';
import toast from 'react-hot-toast';
import { Plus, FileUp, ArrowDownToLine, Save, Settings, Table2 } from 'lucide-react';

export default function SmartSheetPage() {
  const { id } = useParams<{ id: string }>();
  const { sheet, vtableColumns, vtableRecords, theme, isLoading, refetch } = useSmartSheetData(id);
  const { handleCellChange, handleAddRow, handleDeleteRows, handleSaveTemplate } = useSmartSheetMutation(id);
  const [showImport, setShowImport] = useState(false);
  const [showColPanel, setShowColPanel] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const tableRef = useRef<ListTableInstance | null>(null);

  const option = useMemo(() => ({
    columns: vtableColumns,
    records: vtableRecords,
    theme,
    hover: { highlightMode: 'row' as const },
    select: { mode: 'cell' as const },
    menu: { contextMenuItems: ['copy', 'paste', 'deleteRow', 'insertRow', 'undo', 'redo'] },
    editCellTrigger: 'click' as const,
    keyboardOptions: { editCellOnEnter: true, moveEditCellOnArrowKeys: false },
    autoFill: true,
  }), [vtableColumns, vtableRecords, theme]);

  const onChangeCellValue = useCallback((args: { col: number; row: number; rawValue: unknown }) => {
    const t = tableRef.current; if (!t) return;
    const recs = (t.records ?? []) as Record<string, unknown>[];
    const rec = recs[args.row]; if (!rec) return;
    const rowId = rec.__id as string;
    const version = (rec.__version as number) ?? 0;
    const colDef = (t.columns?.[args.col] ?? {}) as { field?: string };
    const colKey = colDef.field ?? '';
    if (colKey && !colKey.startsWith('__')) handleCellChange(rowId, colKey, args.rawValue, version);
  }, [handleCellChange]);

  const handleExportCsv = useCallback(async () => {
    if (!tableRef.current) return;
    try {
      const { downloadCsv } = await import('@visactor/vtable-export');
      downloadCsv(tableRef.current, `${sheet?.name ?? 'export'}.csv`);
      toast.success('CSV 已下载');
    } catch { toast.error('导出失败'); }
    setShowExportMenu(false);
  }, [sheet]);

  const handleExportXlsx = useCallback(() => {
    if (sheet?.id) {
      const a = document.createElement('a');
      a.href = `/api/admin/smartsheet/${sheet.id}/export/xlsx`;
      a.download = `${sheet.name ?? 'export'}.xlsx`; a.click();
    }
    setShowExportMenu(false);
  }, [sheet]);

  if (isLoading) return (
    <div className="flex items-center justify-center h-full text-[var(--app-color-text-secondary)] text-sm">加载中...</div>
  );

  return (
    <div className="flex flex-col h-full gap-3 p-4 bg-[var(--app-color-surface-page)]" data-admin-chrome-ctx-surface="true">
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-2 px-4 py-2 rounded-[var(--app-radius-container)] bg-[var(--app-color-surface-container)] border border-[var(--app-color-border-default)] shadow-[var(--app-shadow-card)]">
        <Table2 className="w-5 h-5 text-[var(--app-color-primary)] flex-shrink-0" />
        <span className="font-semibold text-[var(--app-color-text-primary)] text-sm truncate max-w-[200px]">{sheet?.name ?? '加载中...'}</span>
        <div className="flex-1" />
        <button onClick={handleAddRow} className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium bg-[var(--app-color-primary)] text-white hover:opacity-90 transition-opacity flex items-center gap-1">
          <Plus className="w-3.5 h-3.5" /> 添加行
        </button>
        <button onClick={() => setShowImport(true)} className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-container-hover)] transition-colors flex items-center gap-1">
          <FileUp className="w-3.5 h-3.5" /> 导入
        </button>
        <div className="relative">
          <button onClick={() => setShowExportMenu(p => !p)} className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-container-hover)] transition-colors flex items-center gap-1">
            <ArrowDownToLine className="w-3.5 h-3.5" /> 导出
          </button>
          {showExportMenu && (
            <div className="absolute right-0 top-full mt-1 w-[140px] rounded-[10px] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] shadow-lg py-1 z-[var(--z-dropdown)]">
              <button onClick={handleExportCsv} className="w-full text-left px-3 py-1.5 text-[12px] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-container-hover)]">CSV 格式</button>
              <button onClick={handleExportXlsx} className="w-full text-left px-3 py-1.5 text-[12px] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-container-hover)]">Excel 格式</button>
            </div>
          )}
        </div>
        <button onClick={handleSaveTemplate} className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-container-hover)] transition-colors flex items-center gap-1">
          <Save className="w-3.5 h-3.5" /> 存模板
        </button>
        <button onClick={() => setShowColPanel(true)} className="px-3 py-1.5 rounded-[var(--app-radius-sm)] text-xs font-medium border border-[var(--app-color-border-default)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-container-hover)] transition-colors flex items-center gap-1">
          <Settings className="w-3.5 h-3.5" /> 列
        </button>
      </div>

      {/* ── VTable Grid ── */}
      <div className="flex-1 min-h-0 rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] shadow-[var(--app-shadow-card)] overflow-hidden">
        {vtableColumns.length > 0 ? (
          <ListTable option={option} height="100%" onReady={(inst: ListTableInstance) => { tableRef.current = inst; }} onChangeCellValue={onChangeCellValue} />
        ) : (
          <div className="flex items-center justify-center h-full text-[var(--app-color-text-secondary)] text-sm">暂无列定义，请点击「列」按钮添加</div>
        )}
      </div>

      {/* ── Modals ── */}
      {showImport && <ImportDialog sheetId={id!} columns={sheet?.columnsConfig ?? []} open={showImport} onClose={() => setShowImport(false)} onImported={() => { setShowImport(false); refetch(); }} />}
      {showColPanel && <ColumnConfigPanel sheetId={id!} columns={sheet?.columnsConfig ?? []} open={showColPanel} onClose={() => setShowColPanel(false)} onChange={() => refetch()} />}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd frontend && npx tsc --noEmit && cd .. && git add -A && git commit -m "refactor: SmartSheetPage — 5-button toolbar + VTable ListTable + ARCO-Bento theme"
```

---

### Task 10: 创建 ColumnConfigPanel

**Files:**
- Create: `frontend/src/features/smartsheet/components/ColumnConfigPanel.tsx`

- [ ] **Step 1: 创建列配置侧面板**

```typescript
// ColumnConfigPanel — side panel for column management
import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateSheet } from '@/api/domains/smartsheet.api';
import type { ColumnConfig, ColumnType } from '@/features/smartsheet/types';
import toast from 'react-hot-toast';
import { Plus, Trash2, X } from 'lucide-react';

const COLUMN_TYPES: { value: ColumnType; label: string }[] = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'checkbox', label: '复选框' },
  { value: 'select', label: '下拉选择' },
  { value: 'multi-select', label: '多选' },
  { value: 'radio', label: '单选' },
  { value: 'date', label: '日期' },
  { value: 'progressbar', label: '进度条' },
  { value: 'user', label: '用户' },
];

interface Props {
  sheetId: string;
  columns: ColumnConfig[];
  open: boolean;
  onClose: () => void;
  onChange: () => void;
}

export default function ColumnConfigPanel({ sheetId, columns, open, onClose, onChange }: Props) {
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState<ColumnType>('text');
  const queryClient = useQueryClient();

  const mutate = useMutation({
    mutationFn: (cols: ColumnConfig[]) => updateSheet(sheetId, { columnsConfig: cols }),
    onSuccess: () => { onChange(); queryClient.invalidateQueries({ queryKey: ['smartsheet', sheetId] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!open) return null;

  const handleAdd = () => {
    if (!newColName.trim()) { toast('请输入列名'); return; }
    const key = `col_${Date.now()}`;
    mutate.mutate([...columns, { key, label: newColName.trim(), type: newColType, width: 120 }]);
    setNewColName('');
  };

  const handleDelete = (colKey: string) => {
    if (!confirm('删除此列？已有数据将保留在数据库中但不再显示。')) return;
    mutate.mutate(columns.filter(c => c.key !== colKey));
  };

  const handleUpdate = (colKey: string, patch: Partial<ColumnConfig>) => {
    mutate.mutate(columns.map(c => c.key === colKey ? { ...c, ...patch } : c));
  };

  const handleOptions = (colKey: string, optionsStr: string) => {
    const options = optionsStr.split(',').map(s => s.trim()).filter(Boolean);
    handleUpdate(colKey, { options });
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[320px] bg-[var(--app-color-surface-container)] border-l border-[var(--app-color-border-default)] shadow-lg z-[var(--z-modal)] flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--app-color-border-default)]">
        <span className="font-semibold text-sm text-[var(--app-color-text-primary)]">列配置</span>
        <div className="flex-1" />
        <button onClick={onClose} className="p-1 rounded hover:bg-[var(--app-color-surface-container-hover)]"><X className="w-4 h-4" /></button>
      </div>

      {/* Add new column */}
      <div className="p-3 border-b border-[var(--app-color-border-default)] flex gap-2">
        <input value={newColName} onChange={e => setNewColName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="新列名称" className="flex-1 px-2 py-1 text-xs rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)]" />
        <select value={newColType} onChange={e => setNewColType(e.target.value as ColumnType)}
          className="px-2 py-1 text-xs rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)]">
          {COLUMN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <button onClick={handleAdd} className="px-3 py-1 rounded text-xs font-medium bg-[var(--app-color-primary)] text-white"><Plus className="w-3.5 h-3.5" /></button>
      </div>

      {/* Column list */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {columns.map(col => (
          <div key={col.key} className="p-3 rounded-[10px] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)]">
            <div className="flex items-center gap-2 mb-2">
              <input value={col.label} onChange={e => handleUpdate(col.key, { label: e.target.value })}
                className="flex-1 px-2 py-1 text-xs font-medium rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]" />
              <select value={col.type} onChange={e => handleUpdate(col.key, { type: e.target.value as ColumnType })}
                className="px-2 py-1 text-xs rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]">
                {COLUMN_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <button onClick={() => handleDelete(col.key)} className="p-1 rounded hover:bg-[var(--app-color-feedback-danger-soft)]">
                <Trash2 className="w-3.5 h-3.5 text-[var(--app-color-feedback-danger)]" />
              </button>
            </div>
            {(col.type === 'select' || col.type === 'multi-select' || col.type === 'radio') && (
              <input value={(col.options ?? []).join(', ')}
                onChange={e => handleOptions(col.key, e.target.value)}
                placeholder="选项，逗号分隔" className="w-full px-2 py-1 text-xs rounded border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)]" />
            )}
          </div>
        ))}
        {columns.length === 0 && <div className="text-xs text-[var(--app-color-text-secondary)] text-center py-4">暂无列，请添加</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd frontend && npx tsc --noEmit && cd .. && git add -A && git commit -m "feat: ColumnConfigPanel — side panel for column CRUD + type switching"
```

---

### Task 11: 重写 ImportDialog

**Files:**
- Modify: `frontend/src/features/smartsheet/components/ImportDialog.tsx`

- [ ] **Step 1: 用以下内容替换**

```typescript
// ImportDialog — V3: uses POST /import API with preview
import React, { useState } from 'react';
import { importFile } from '@/api/domains/smartsheet.api';
import type { ColumnConfig, SmartsheetImportResult } from '@/features/smartsheet/types';
import toast from 'react-hot-toast';
import { FileUp, X } from 'lucide-react';

interface Props { sheetId: string; columns: ColumnConfig[]; open: boolean; onClose: () => void; onImported: () => void; }

export default function ImportDialog({ sheetId, open, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<SmartsheetImportResult | null>(null);
  const [importing, setImporting] = useState(false);

  if (!open) return null;

  const handleUpload = async () => {
    if (!file) { toast('请选择文件'); return; }
    setImporting(true);
    try {
      const res = await importFile(sheetId, file);
      setResult(res);
      toast.success(`导入完成: ${res.importedRows}/${res.totalRows} 行`);
    } catch (e) { toast.error('导入失败: ' + (e as Error).message); }
    finally { setImporting(false); }
  };

  const handleDone = () => { setFile(null); setResult(null); onImported(); };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[var(--z-modal)]" onClick={onClose}>
      <div className="bg-[var(--app-color-surface-container)] rounded-[14px] border border-[var(--app-color-border-default)] shadow-lg w-[480px] max-h-[80vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-4">
          <FileUp className="w-5 h-5 text-[var(--app-color-primary)]" />
          <span className="font-semibold text-sm text-[var(--app-color-text-primary)]">导入数据</span>
          <div className="flex-1" />
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--app-color-surface-container-hover)]"><X className="w-4 h-4" /></button>
        </div>

        {!result ? (
          <>
            <p className="text-xs text-[var(--app-color-text-secondary)] mb-3">支持 .xlsx / .xls / .csv 格式，第一行为列头</p>
            <input type="file" accept=".xlsx,.xls,.csv" onChange={e => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs mb-3" />
            <button onClick={handleUpload} disabled={!file || importing}
              className="w-full px-3 py-2 rounded-[var(--app-radius-sm)] text-xs font-medium bg-[var(--app-color-primary)] text-white disabled:opacity-50">
              {importing ? '导入中...' : '开始导入'}
            </button>
          </>
        ) : (
          <>
            <div className="text-xs text-[var(--app-color-text-secondary)] mb-2">
              总计 {result.totalRows} 行 · 导入 {result.importedRows} 行 · 跳过 {result.skippedRows} 行
            </div>
            {result.errors.length > 0 && (
              <div className="text-xs text-[var(--app-color-feedback-danger)] mb-2">{result.errors.join('; ')}</div>
            )}
            {result.preview.length > 0 && (
              <div className="mb-3 max-h-[200px] overflow-auto rounded border border-[var(--app-color-border-default)]">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-[var(--app-color-surface-page)]">
                      {Object.keys(result.preview[0]).map(k => <th key={k} className="px-2 py-1 text-left text-[var(--app-color-text-secondary)]">{k}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {result.preview.map((row, i) => (
                      <tr key={i} className="border-t border-[var(--app-color-border-default)]">
                        {Object.values(row).map((v, j) => <td key={j} className="px-2 py-1">{v}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button onClick={handleDone} className="w-full px-3 py-2 rounded-[var(--app-radius-sm)] text-xs font-medium bg-[var(--app-color-primary)] text-white">
              完成
            </button>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
cd frontend && npx tsc --noEmit && cd .. && git add -A && git commit -m "refactor: ImportDialog — uses new POST /import API with preview"
```

---

### Task 12: 最终编译 + 路由验证

- [ ] **Step 1: TypeScript 编译**

```bash
cd frontend && npx tsc --noEmit
```
Expected: exit code 0, no errors.

- [ ] **Step 2: Vite 构建**

```bash
cd frontend && npx vite build
```
Expected: `✓ built in ...s`, no warnings.

- [ ] **Step 3: Java 编译**

```bash
./mvnw compile -q
```
Expected: no output (success).

- [ ] **Step 4: 确认路由**

```bash
grep -n "smartsheet" frontend/src/router/index.tsx
```
Expected: `/admin/smartsheet` → `SmartSheetListPage`, `/admin/smartsheet/:id` → `SmartSheetPage`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "chore: smartsheet v3 final — all compilations pass, routes verified"
```

---

## 任务依赖

```
Task 1 (DELETE endpoint) ──┐
Task 2 (delete old files) ─┤
Task 3 (types.ts) ─────────┼──→ Task 6 (useSmartSheetData)
Task 4 (columns.ts) ───────┤     Task 7 (useSmartSheetMutation)
Task 5 (api.ts) ───────────┤     Task 8 (ListPage)
                           │     Task 9 (SheetPage)
                           ├──→ Task 10 (ColumnConfigPanel)
                           └──→ Task 11 (ImportDialog)
                                        ↓
                                  Task 12 (verify)
```

Tasks 1-5 可并行；Tasks 6-11 依赖 1-5 完成；Task 12 最后执行。
