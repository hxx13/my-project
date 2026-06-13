// frontend/src/features/smartsheet/hooks/useSmartSheetData.ts
import { useQuery } from '@tanstack/react-query';
import { getSheet, fetchRows } from '@/api/domains/smartsheet.api';
import { buildVTableColumns, buildVTableRecords } from '../vtable-config/columns';

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

  const columns = sheetQuery.data
    ? buildVTableColumns(sheetQuery.data.columnsConfig)
    : [];

  const records = rowsQuery.data
    ? buildVTableRecords(rowsQuery.data)
    : [];

  return {
    sheet: sheetQuery.data ?? null,
    rows: rowsQuery.data ?? [],
    columns,
    records,
    isLoading: sheetQuery.isLoading || rowsQuery.isLoading,
    refetch: () => {
      sheetQuery.refetch();
      rowsQuery.refetch();
    },
  };
}
