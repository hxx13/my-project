import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { THEME_REGISTRY, getThemeById } from './themeRegistry';
import type { ThemeDefinition } from './types';

interface ThemeContextValue {
  themeId: string;
  theme: ThemeDefinition;
  setThemeId: (id: string) => void;
  themes: ThemeDefinition[];
  cycleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'twin-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && THEME_REGISTRY.some(t => t.id === stored)) return stored;
    } catch { /* localStorage 被禁用时忽略 */ }
    return 'standard';
  });

  const theme = getThemeById(themeId);

  const setThemeId = useCallback((id: string) => {
    if (!THEME_REGISTRY.some(t => t.id === id)) return;
    setThemeIdState(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch {}
  }, []);

  const cycleTheme = useCallback(() => {
    const idx = THEME_REGISTRY.findIndex(t => t.id === themeId);
    const next = THEME_REGISTRY[(idx + 1) % THEME_REGISTRY.length];
    setThemeId(next.id);
  }, [themeId, setThemeId]);

  useEffect(() => {
    const root = document.documentElement;

    // 清除所有主题 class
    THEME_REGISTRY.forEach(t => root.classList.remove(t.className));

    // 挂载当前主题 class
    root.classList.add(theme.className);

    // 同步 Tailwind darkMode
    if (theme.mode === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ themeId, theme, setThemeId, themes: THEME_REGISTRY, cycleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
