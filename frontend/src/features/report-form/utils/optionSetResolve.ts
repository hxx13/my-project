import type { FieldDefinition } from '../types';
import { parseOptionSetItems } from './optionSetLabels';

export interface OptionItem {
  label: string;
  value: string;
}

export function itemsJsonToOptions(itemsJson: unknown): OptionItem[] {
  const seen = new Set<string>();
  const result: OptionItem[] = [];
  for (const item of parseOptionSetItems(itemsJson)) {
    const label = (item.label || '').trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    result.push({ label, value: label });
  }
  return result;
}

/** 有 optionSetId 时只读预设；否则读格子内联 options */
export function resolveFieldOptions(
  field: FieldDefinition,
  optionsSetMap: Record<string, OptionItem[]>,
): OptionItem[] {
  if (field.optionSetId) {
    return optionsSetMap[field.optionSetId] ?? [];
  }
  return field.options ?? [];
}
