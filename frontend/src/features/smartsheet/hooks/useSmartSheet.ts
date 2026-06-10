// frontend/src/features/smartsheet/hooks/useSmartSheet.ts
import { useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  getSheet,
  updateSheet,
  fetchRows,
  addRow,
  updateRow,
  deleteRow,
} from '@/api/domains/smartsheet.api';
import type {
  SmartSheetDefinition,
  SmartSheetRow,
  ColumnConfig,
} from '@/features/smartsheet/types';

export function useSmartSheet(sheetId: string | undefined) {
  const queryClient = useQueryClient();
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCells = useRef<Record<string, Record<string, string>>>({});

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

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['smartsheet', sheetId] });
    queryClient.invalidateQueries({ queryKey: ['smartsheet-rows', sheetId] });
  }, [queryClient, sheetId]);

  const updateColumnMutation = useMutation({
    mutationFn: async ({ colKey, config }: { colKey: string; config: Partial<ColumnConfig> }) => {
      if (!sheetQuery.data) return;
      const cols = [...sheetQuery.data.columnsConfig];
      const idx = cols.findIndex((c) => c.key === colKey);
      if (idx >= 0) {
        cols[idx] = { ...cols[idx], ...config };
        await updateSheet(sheetId!, { columnsConfig: cols });
      }
    },
    onSuccess: () => { invalidate(); toast.success('列配置已更新'); },
    onError: (e: Error) => { toast.error(e.message || '更新失败'); },
  });

  const addColumnMutation = useMutation({
    mutationFn: async (col: ColumnConfig) => {
      if (!sheetQuery.data) return;
      const cols = [...sheetQuery.data.columnsConfig, col];
      await updateSheet(sheetId!, { columnsConfig: cols });
    },
    onSuccess: () => { invalidate(); toast.success('已添加新列'); },
    onError: (e: Error) => { toast.error(e.message || '添加列失败'); },
  });

  const addRowMutation = useMutation({
    mutationFn: () => addRow(sheetId!, '', undefined),
    onSuccess: () => invalidate(),
    onError: (e: Error) => { toast.error(e.message || '添加行失败'); },
  });

  const deleteRowsMutation = useMutation({
    mutationFn: async (rowIds: string[]) => {
      for (const id of rowIds) await deleteRow(sheetId!, id);
    },
    onSuccess: () => { invalidate(); toast.success('已删除'); },
    onError: (e: Error) => { toast.error(e.message || '删除失败'); },
  });

  const updateCell = useCallback(async (rowId: string, colKey: string, value: string) => {
    if (!sheetId) return;
    if (!pendingCells.current[rowId]) pendingCells.current[rowId] = {};
    pendingCells.current[rowId][colKey] = value;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const pending = pendingCells.current;
      pendingCells.current = {};
      for (const [rid, cells] of Object.entries(pending)) {
        const row = rowsQuery.data?.find((r) => r.id === rid);
        if (!row) continue;
        try {
          await updateRow(sheetId, rid, {
            cellData: { ...row.cellData, ...cells } as any,
            version: row.version,
          });
        } catch (e) {
          toast.error((e as Error).message || '保存失败');
        }
      }
      invalidate();
    }, 600);
  }, [sheetId, rowsQuery.data, invalidate]);

  // Insert row after a specific row (or at end if no afterRowId)
  const insertRowMutation = useMutation({
    mutationFn: async (afterRowId?: string) => {
      return await addRow(sheetId!, '', undefined);
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => { toast.error(e.message || '添加行失败'); },
  });

  // Duplicate a row: clone cellData (preserving CellValue) and rowLabel
  const duplicateRowMutation = useMutation({
    mutationFn: async (rowId: string) => {
      const row = rowsQuery.data?.find(r => r.id === rowId);
      if (!row) return;
      const newRow = await addRow(sheetId!, row.rowLabel, undefined);
      if (row.cellData && Object.keys(row.cellData).length > 0) {
        await updateRow(sheetId!, newRow.id, {
          cellData: row.cellData as any,
          version: newRow.version,
        });
      }
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => { toast.error(e.message || '复制行失败'); },
  });

  // Move row: stub until backend supports row_index reordering
  const moveRow = useCallback((_rowId: string, _direction: 'up' | 'down') => {
    toast('行移动将在后端排序支持后实现');
  }, []);

  return {
    sheet: sheetQuery.data ?? null,
    rows: rowsQuery.data ?? [],
    isLoading: sheetQuery.isLoading || rowsQuery.isLoading,
    updateCell,
    addRow: () => addRowMutation.mutate(),
    insertRow: (afterRowId?: string) => insertRowMutation.mutate(afterRowId),
    deleteRows: (ids: string[]) => deleteRowsMutation.mutate(ids),
    duplicateRow: (rowId: string) => duplicateRowMutation.mutate(rowId),
    moveRow,
    updateColumn: (colKey: string, config: Partial<ColumnConfig>) =>
      updateColumnMutation.mutate({ colKey, config }),
    addColumn: (col: ColumnConfig) => addColumnMutation.mutate(col),
    invalidate,
  };
}
