// components/ThemePanel.tsx
import type { ThemeJson, CellAlign } from '../types';

interface Props {
  theme: ThemeJson;
  onChange: (theme: ThemeJson) => void;
}

const inputClass = "w-full rounded-[6px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)] px-2 py-1 text-xs text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]";
const labelClass = "text-[11px] font-medium text-[var(--app-color-text-secondary)] mb-0.5 block";

export default function ThemePanel({ theme, onChange }: Props) {
  const update = (patch: Partial<ThemeJson>) => onChange({ ...theme, ...patch });

  return (
    <div className="p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-120px)]">
      <h3 className="text-xs font-semibold text-[var(--app-color-text-primary)] uppercase tracking-wider">主题配置</h3>

      {/* Header */}
      <div>
        <label className={labelClass}>表头背景色</label>
        <input type="color" value={theme.headerBg || '#f5f5f5'} onChange={e => update({ headerBg: e.target.value })}
          className="w-full h-8 rounded-[6px] cursor-pointer" />
      </div>
      <div>
        <label className={labelClass}>表头文字色</label>
        <input type="color" value={theme.headerColor || '#1a1a1a'} onChange={e => update({ headerColor: e.target.value })}
          className="w-full h-8 rounded-[6px] cursor-pointer" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>表头字号</label>
          <input type="number" min={10} max={24} value={theme.headerFontSize || 13}
            onChange={e => update({ headerFontSize: Number(e.target.value) })} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>表头对齐</label>
          <select value={theme.headerAlign || 'center'} onChange={e => update({ headerAlign: e.target.value as CellAlign })}
            className={inputClass}>
            <option value="left">左对齐</option>
            <option value="center">居中</option>
            <option value="right">右对齐</option>
          </select>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={theme.headerBold ?? true} onChange={e => update({ headerBold: e.target.checked })}
          className="w-3.5 h-3.5 accent-[var(--app-color-accent)]" />
        <label className="text-[11px] text-[var(--app-color-text-secondary)]">表头加粗</label>
      </div>

      <div className="border-t border-[var(--app-color-border)] pt-3" />

      {/* Zebra stripe */}
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={theme.zebraStripe ?? true} onChange={e => update({ zebraStripe: e.target.checked })}
          className="w-3.5 h-3.5 accent-[var(--app-color-accent)]" />
        <label className="text-[11px] text-[var(--app-color-text-secondary)]">斑马纹</label>
      </div>
      {theme.zebraStripe && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelClass}>奇数行背景</label>
            <input type="color" value={theme.oddRowBg || '#ffffff'} onChange={e => update({ oddRowBg: e.target.value })}
              className="w-full h-8 rounded-[6px] cursor-pointer" />
          </div>
          <div>
            <label className={labelClass}>偶数行背景</label>
            <input type="color" value={theme.evenRowBg || '#f9fafb'} onChange={e => update({ evenRowBg: e.target.value })}
              className="w-full h-8 rounded-[6px] cursor-pointer" />
          </div>
        </div>
      )}

      <div className="border-t border-[var(--app-color-border)] pt-3" />

      {/* Border */}
      <div>
        <label className={labelClass}>边框颜色</label>
        <input type="color" value={theme.borderColor || '#e5e7eb'} onChange={e => update({ borderColor: e.target.value })}
          className="w-full h-8 rounded-[6px] cursor-pointer" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>边框宽度 (px)</label>
          <input type="number" min={0} max={5} value={theme.borderWidth || 1}
            onChange={e => update({ borderWidth: Number(e.target.value) })} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>圆角 (px)</label>
          <input type="number" min={0} max={20} value={theme.borderRadius || 8}
            onChange={e => update({ borderRadius: Number(e.target.value) })} className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>格内边距 (px)</label>
        <input type="number" min={0} max={32} value={theme.cellPadding || 8}
          onChange={e => update({ cellPadding: Number(e.target.value) })} className={inputClass} />
      </div>

      <div className="border-t border-[var(--app-color-border)] pt-3" />

      {/* Font */}
      <div>
        <label className={labelClass}>默认字号</label>
        <input type="number" min={10} max={24} value={theme.defaultFontSize || 13}
          onChange={e => update({ defaultFontSize: Number(e.target.value) })} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>默认对齐</label>
        <select value={theme.defaultAlign || 'center'} onChange={e => update({ defaultAlign: e.target.value as CellAlign })}
          className={inputClass}>
          <option value="left">左对齐</option>
          <option value="center">居中</option>
          <option value="right">右对齐</option>
        </select>
      </div>
    </div>
  );
}
