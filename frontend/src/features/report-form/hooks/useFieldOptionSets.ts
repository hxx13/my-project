import { useCallback } from 'react';
import type { FieldDefinition } from '../types';
import { resolveFieldOptions } from '../utils/optionSetResolve';
import { useOptionSetMap } from './useOptionSetMap';

export function useFieldOptionSets(fields: Record<string, FieldDefinition>) {
  const { optionsSetMap, revision } = useOptionSetMap(fields);

  const getFieldOptions = useCallback(
    (field: FieldDefinition) => resolveFieldOptions(field, optionsSetMap),
    [optionsSetMap],
  );

  return { getFieldOptions, optionsSetMap, revision };
}
