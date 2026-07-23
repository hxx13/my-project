import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import type { FieldDefinition } from '../types';
import { fetchOptionSetById } from '../api/reportForm.api';
import { itemsJsonToOptions } from '../utils/optionSetResolve';

function collectOptionSetIds(fields: Record<string, FieldDefinition>): string[] {
  const ids = new Set<string>();
  for (const field of Object.values(fields || {})) {
    if (field.optionSetId) ids.add(field.optionSetId);
  }
  return [...ids];
}

/** 按 fields 引用的 optionSetId 拉取预设，更新预设后 invalidate 对应 query 即可全表同步 */
export function useOptionSetMap(fields: Record<string, FieldDefinition>) {
  const idsKey = JSON.stringify(
    Object.values(fields || {})
      .map(f => f.optionSetId)
      .filter(Boolean)
      .sort(),
  );
  const ids = useMemo(() => collectOptionSetIds(fields), [idsKey]);

  const queries = useQueries({
    queries: ids.map(id => ({
      queryKey: ['report-form-option-set', id],
      queryFn: () => fetchOptionSetById(Number(id)),
      staleTime: 0,
    })),
  });

  const optionsSetMap = useMemo(() => {
    const map: Record<string, { label: string; value: string }[]> = {};
    ids.forEach((id, i) => {
      const set = queries[i]?.data;
      if (set) map[id] = itemsJsonToOptions(set.itemsJson);
    });
    return map;
  }, [ids, queries]);

  const revision = queries.map(q => `${q.dataUpdatedAt}:${q.data?.updatedAt ?? ''}`).join('|');

  return { optionsSetMap, revision, isLoading: queries.some(q => q.isLoading) };
}
