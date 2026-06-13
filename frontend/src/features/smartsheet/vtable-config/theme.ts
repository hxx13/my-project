// frontend/src/features/smartsheet/vtable-config/theme.ts

export function buildVTableTheme(): Record<string, unknown> {
  const style = getComputedStyle(document.documentElement);

  const getVar = (name: string, fallback: string): string =>
    style.getPropertyValue(name).trim() || fallback;

  return {
    defaultStyle: {
      bgColor: getVar('--app-color-surface-container', '#ffffff'),
      borderColor: getVar('--app-color-border-default', '#e5e7eb'),
      fontFamily: 'inherit',
      fontSize: 13,
      color: getVar('--app-color-text-primary', '#111827'),
    },
    headerStyle: {
      bgColor: getVar('--app-color-surface-page', '#fafafa'),
      borderColor: getVar('--app-color-border-default', '#e5e7eb'),
      fontFamily: 'inherit',
      fontSize: 13,
      fontWeight: '600',
      color: getVar('--app-color-text-primary', '#111827'),
    },
    bodyStyle: {
      bgColor: getVar('--app-color-surface-container', '#ffffff'),
      borderColor: getVar('--app-color-border-default', '#e5e7eb'),
      fontFamily: 'inherit',
      fontSize: 13,
      color: getVar('--app-color-text-primary', '#111827'),
    },
    frameStyle: {
      borderColor: getVar('--app-color-border-default', '#e5e7eb'),
      cornerRadius: 10,
    },
    underlayBackgroundColor: getVar('--app-color-surface-page', '#fafafa'),
    selectionStyle: {
      cellBgColor: getVar('--app-color-primary-light', '#dbeafe'),
      cellBorderColor: getVar('--app-color-primary', '#3b82f6'),
    },
  };
}

export function getThemeName(): string {
  return 'bento';
}
