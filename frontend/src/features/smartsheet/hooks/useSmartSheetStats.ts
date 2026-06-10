// frontend/src/features/smartsheet/hooks/useSmartSheetStats.ts
import { useQuery } from '@tanstack/react-query';
import { fetchColumnStats } from '@/api/domains/smartsheet.api';

export function useSmartSheetStats(sheetId: string | undefined, columnKey: string | null) {
  return useQuery({
    queryKey: ['smartsheet-stats', sheetId, columnKey],
    queryFn: () => fetchColumnStats(sheetId!, columnKey!),
    enabled: !!sheetId && !!columnKey,
  });
}
