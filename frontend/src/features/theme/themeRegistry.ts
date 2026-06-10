import type { ThemeDefinition } from './types';

export const THEME_REGISTRY: ThemeDefinition[] = [
  {
    id: 'standard',
    label: '标准',
    mode: 'light',
    className: 'theme-standard',
    preview: { accent: '#3b82f6', surface: '#ffffff', text: '#0f172a' },
  },
  {
    id: 'standard-dark',
    label: '暗色',
    mode: 'dark',
    className: 'theme-standard-dark',
    preview: { accent: '#60a5fa', surface: '#0f172a', text: '#f8fafc' },
  },
  {
    id: 'scifi',
    label: '科幻流光',
    mode: 'dark',
    className: 'theme-scifi',
    preview: { accent: '#22d3ee', surface: '#0b1121', text: '#e2e8f0' },
  },
];

export function getThemeById(id: string): ThemeDefinition {
  return THEME_REGISTRY.find(t => t.id === id) || THEME_REGISTRY[0];
}
