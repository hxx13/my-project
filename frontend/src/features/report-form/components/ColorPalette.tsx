// components/ColorPalette.tsx
import { useState, useRef, useEffect } from 'react';
import { PaintBucket, Type } from 'lucide-react';

interface Props {
  /** 当前选中色值 */
  value?: string;
  /** 选择回调 */
  onChange: (color: string | undefined) => void;
  /** 模式：bg=背景色, text=字体颜色 */
  mode: 'bg' | 'text';
}

/** 预置色块 — 背景色用 */
const BG_PRESETS = [
  { label: '无填充', value: 'transparent' },
  { label: '暖桃', value: '#FAD4C0' },
  { label: '钢蓝', value: '#80A1C1' },
  { label: '浅绿', value: '#E8F5E9' },
  { label: '浅橙', value: '#FFF3E0' },
  { label: '浅粉', value: '#FCE4EC' },
  { label: '浅蓝', value: '#E3F2FD' },
  { label: '浅紫', value: '#F3E5F5' },
  { label: '白色', value: '#FFFFFF' },
  { label: '浅灰', value: '#F5F5F5' },
];

/** 预置色块 — 字体颜色用 */
const TEXT_PRESETS = [
  { label: '自动', value: 'inherit' },
  { label: '黑色', value: '#1a1a1a' },
  { label: '深灰', value: '#666666' },
  { label: '灰色', value: '#999999' },
  { label: '暖桃', value: '#FAD4C0' },
  { label: '钢蓝', value: '#80A1C1' },
  { label: '红色', value: '#e03131' },
  { label: '绿色', value: '#2f9e44' },
  { label: '蓝色', value: '#1971c2' },
  { label: '橙色', value: '#f08c00' },
];

export default function ColorPalette({ value, onChange, mode }: Props) {
  const [open, setOpen] = useState(false);
  const [customHex, setCustomHex] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const presets = mode === 'bg' ? BG_PRESETS : TEXT_PRESETS;
  const currentColor = value || (mode === 'bg' ? 'transparent' : 'inherit');
  const Icon = mode === 'bg' ? PaintBucket : Type;

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 rounded-[6px] text-[11px] font-medium border border-[var(--app-color-border)]
                   text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] transition-colors"
        title={mode === 'bg' ? '背景色' : '字体颜色'}
      >
        <Icon className="w-3.5 h-3.5" />
        <span
          className="inline-block w-3 h-3 rounded-[2px] border border-[var(--app-color-border)]"
          style={{
            backgroundColor: currentColor === 'transparent' || currentColor === 'inherit' ? 'transparent' : currentColor,
            backgroundImage: currentColor === 'transparent'
              ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)'
              : undefined,
            backgroundSize: currentColor === 'transparent' ? '6px 6px' : undefined,
            backgroundPosition: currentColor === 'transparent' ? '0 0, 3px 3px' : undefined,
          }}
        />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 p-2 rounded-[var(--app-radius-container)]
                     border border-[var(--app-color-border)] bg-[var(--app-color-surface-elevated)]
                     shadow-lg z-[var(--z-dropdown)] w-[180px]"
        >
          {/* 预置色块 */}
          <div className="grid grid-cols-5 gap-1.5 mb-2">
            {presets.map(p => (
              <button
                key={p.value}
                onClick={() => {
                  onChange(p.value === 'transparent' ? undefined : p.value === 'inherit' ? undefined : p.value);
                  setOpen(false);
                }}
                className="w-7 h-7 rounded-[4px] border border-[var(--app-color-border)]
                           hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-[var(--app-color-accent)]"
                style={{
                  backgroundColor: p.value === 'transparent' || p.value === 'inherit' ? 'transparent' : p.value,
                  backgroundImage: p.value === 'transparent'
                    ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%, #ccc)'
                    : undefined,
                  backgroundSize: p.value === 'transparent' ? '6px 6px' : undefined,
                  backgroundPosition: p.value === 'transparent' ? '0 0, 3px 3px' : undefined,
                }}
                title={p.label}
              />
            ))}
          </div>

          {/* 自定义颜色 */}
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-[var(--app-color-text-tertiary)] whitespace-nowrap">自定义</span>
            <input
              type="text"
              value={customHex}
              onChange={e => setCustomHex(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && customHex) {
                  onChange(customHex);
                  setCustomHex('');
                  setOpen(false);
                }
              }}
              placeholder="#FF0000"
              className="flex-1 rounded-[4px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)]
                         px-1.5 py-0.5 text-[10px] text-[var(--app-color-text-primary)] outline-none
                         focus:border-[var(--app-color-accent)]"
            />
            <button
              onClick={() => {
                if (customHex) { onChange(customHex); setCustomHex(''); setOpen(false); }
              }}
              className="px-1.5 py-0.5 rounded-[4px] text-[10px] bg-[var(--app-color-accent)] text-white hover:opacity-90"
            >
              确定
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
