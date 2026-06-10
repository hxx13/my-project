// ColorPicker — 8 preset colors using --app-color-* CSS variable tokens (G04 compliance)
import React from 'react';

const PRESET_COLORS = [
  { label: '默认', value: '', style: { border: '1px dashed var(--app-color-border)' } },
  { label: '红', value: 'var(--app-color-feedback-danger)' },
  { label: '橙', value: 'var(--app-color-feedback-warning)' },
  { label: '绿', value: 'var(--app-color-feedback-success)' },
  { label: '蓝', value: 'var(--app-color-accent-secondary)' },
  { label: '靛', value: 'var(--app-color-accent)' },
  { label: '深灰', value: 'var(--app-color-text-primary)' },
  { label: '浅灰', value: 'var(--app-color-text-secondary)' },
];

interface ColorPickerProps {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
}

export default function ColorPicker({ value, onChange, onClose }: ColorPickerProps) {
  return (
    <div className="absolute top-full left-0 mt-1 bg-app-surface-elevated border border-app-border rounded-[10px] shadow-lg p-2 grid grid-cols-4 gap-1.5 z-[var(--z-dropdown)] min-w-[140px]">
      {PRESET_COLORS.map((c) => {
        const isSelected = value === c.value;
        const bgColor = c.value || 'transparent';

        return (
          <button
            key={c.label}
            title={c.label}
            onClick={() => { onChange(c.value); onClose(); }}
            className="relative w-6 h-6 rounded-full flex items-center justify-center transition-all hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent"
            style={{
              backgroundColor: bgColor,
              border: c.value ? '1px solid transparent' : '1px dashed var(--app-color-border)',
            }}
          >
            {c.value === '' && isSelected && (
              <span className="text-[10px] leading-none text-app-text-tertiary">✕</span>
            )}
            {c.value !== '' && isSelected && (
              <span className="w-2 h-2 rounded-full bg-white shadow-sm" />
            )}
          </button>
        );
      })}
    </div>
  );
}