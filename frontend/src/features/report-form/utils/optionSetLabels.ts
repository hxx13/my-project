import type { OptionSet } from '../types';

export function parseOptionSetItems(itemsJson: unknown): { label: string; sortOrder?: number }[] {
  if (Array.isArray(itemsJson)) return itemsJson;
  if (typeof itemsJson === 'string') {
    try {
      const parsed = JSON.parse(itemsJson);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function optionSetItemLabels(itemsJson: OptionSet['itemsJson']): string {
  return parseOptionSetItems(itemsJson).map(i => i.label).join('、');
}
export function formatOptionSetLabel(set: OptionSet, _currentUsername?: string): string {
  return set.name;
}

export function canManageOptionSet(set: OptionSet, currentUsername?: string): boolean {
  if (!set.createdBy) return true;
  return !currentUsername || set.createdBy === currentUsername;
}
