import { useTheme } from './ThemeProvider';
import { Sun, Moon, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

const iconMap: Record<string, typeof Sun> = {
  standard: Sun,
  'standard-dark': Moon,
  scifi: Sparkles,
};

export function ThemeSwitcher({ className }: { className?: string }) {
  const { themeId, cycleTheme, theme } = useTheme();
  const Icon = iconMap[themeId] || Sun;

  return (
    <button
      onClick={cycleTheme}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-[var(--app-radius-element)] px-2 py-1.5 text-[var(--app-color-text-secondary)]',
        'hover:bg-[var(--app-color-surface-hover)] hover:text-[var(--app-color-text-primary)]',
        'transition-all duration-150',
        className
      )}
      title={`当前主题：${theme.label} — 点击切换`}
    >
      <Icon className="size-4" />
      <span className="text-xs font-medium">{theme.label}</span>
    </button>
  );
}
