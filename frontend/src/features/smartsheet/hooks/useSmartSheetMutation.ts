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
