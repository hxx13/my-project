// frontend/src/features/smartsheet/hooks/useSmartSheetMutation.ts
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { updateCell, addRow, deleteRow, updateSheet } from '@/api/domains/smartsheet.api';
import type { ColumnConfig } from '../types';

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
    try {
      await addRow(sheetId);
      invalidate();
    } catch (e) {
      toast.error((e as Error).message || '添加行失败');
    }
  }, [sheetId, invalidate]);

  const handleDeleteRows = useCallback(async (rowIds: string[]) => {
    if (!sheetId) return;
    try {
      for (const id of rowIds) await deleteRow(sheetId, id);
      invalidate();
      toast.success('已删除');
    } catch (e) {
      toast.error((e as Error).message || '删除失败');
    }
  }, [sheetId, invalidate]);

  const handleColumnChange = useCallback(async (
    colKey: string, config: Partial<ColumnConfig>, existingColumns: ColumnConfig[],
  ) => {
    if (!sheetId) return;
    const idx = existingColumns.findIndex((c) => c.key === colKey);
    let newCols: ColumnConfig[];
    if (idx >= 0) {
      newCols = [...existingColumns];
      newCols[idx] = { ...newCols[idx], ...config };
    } else {
      newCols = [...existingColumns, { key: colKey, label: '新列', type: 'text', width: 110, ...config }];
    }
    await updateSheet(sheetId, { columnsConfig: newCols });
    invalidate();
  }, [sheetId, invalidate]);

  return { handleCellChange, handleAddRow, handleDeleteRows, handleColumnChange, invalidate };
}
