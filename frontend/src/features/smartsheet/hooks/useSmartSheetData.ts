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
