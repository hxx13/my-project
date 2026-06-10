export interface ThemeDefinition {
  id: string;
  label: string;
  mode: 'light' | 'dark';
  className: string;
  preview: {
    accent: string;
    surface: string;
    text: string;
  };
}
