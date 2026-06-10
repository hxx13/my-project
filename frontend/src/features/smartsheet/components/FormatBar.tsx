// FormatBar — Bold / Italic / bg-color / font-color / font-size toolbar
import React, { useState, useRef, useEffect } from 'react';
import { Bold, Italic, PaintBucket, Type } from 'lucide-react';
import { useCellFormat } from '@/features/smartsheet/hooks/useCellFormat';
import ColorPicker from './ColorPicker';

const FONT_SIZES = [10, 12, 14, 16, 18, 20];

export default function FormatBar() {
  const { format, setFormat } = useCellFormat();
  const [showBg, setShowBg] = useState(false);
  const [showColor, setShowColor] = useState(false);
  const bgRef = useRef<HTMLDivElement>(null);
  const colorRef = useRef<HTMLDivElement>(null);

  // Close popups on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (bgRef.current && !bgRef.current.contains(target)) setShowBg(false);
      if (colorRef.current && !colorRef.current.contains(target)) setShowColor(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const btnBase = 'inline-flex items-center justify-center w-7 h-7 rounded-[6px] transition-all cursor-pointer text-[13px]';
  const btnActive = 'bg-app-accent-soft text-app-accent';
  const btnInactive = 'text-app-text-secondary hover:bg-app-surface-hover';

  const boldActive = format.b;
  const italicActive = format.i;

  return (
    <div className="flex items-center gap-0.5">
      {/* Bold */}
      <button
        className={`${btnBase} ${boldActive ? btnActive : btnInactive}`}
        title="粗体 (Bold)"
        onClick={() => setFormat({ b: !format.b })}
      >
        <Bold size={14} />
      </button>

      {/* Italic */}
      <button
        className={`${btnBase} ${italicActive ? btnActive : btnInactive}`}
        title="斜体 (Italic)"
        onClick={() => setFormat({ i: !format.i })}
      >
        <Italic size={14} />
      </button>

      {/* Divider */}
      <span className="w-px h-[18px] bg-app-border shrink-0 mx-0.5" />

      {/* Background color */}
      <div ref={bgRef} className="relative">
        <button
          className={`${btnBase} ${showBg || format.bg ? btnActive : btnInactive}`}
          title="背景颜色"
          onClick={() => setShowBg((v) => !v)}
        >
          <PaintBucket size={14} />
          {format.bg && (
            <span
              className="absolute bottom-[2px] left-1/2 -translate-x-1/2 w-[12px] h-[3px] rounded-[1px]"
              style={{ backgroundColor: format.bg }}
            />
          )}
        </button>
        {showBg && (
          <ColorPicker
            value={format.bg ?? ''}
            onChange={(v) => {
              setFormat({ bg: v || undefined });
              setShowBg(false);
            }}
            onClose={() => setShowBg(false)}
          />
        )}
      </div>

      {/* Font color */}
      <div ref={colorRef} className="relative">
        <button
          className={`${btnBase} ${showColor || format.color ? btnActive : btnInactive}`}
          title="字体颜色"
          onClick={() => setShowColor((v) => !v)}
        >
          <Type size={14} />
          {format.color && (
            <span
              className="absolute bottom-[2px] left-1/2 -translate-x-1/2 w-[12px] h-[3px] rounded-[1px]"
              style={{ backgroundColor: format.color }}
            />
          )}
        </button>
        {showColor && (
          <ColorPicker
            value={format.color ?? ''}
            onChange={(v) => {
              setFormat({ color: v || undefined });
              setShowColor(false);
            }}
            onClose={() => setShowColor(false)}
          />
        )}
      </div>

      {/* Font size select */}
      <select
        value={format.size ?? ''}
        onChange={(e) => {
          const val = e.target.value;
          setFormat({ size: val ? Number(val) : undefined });
        }}
        className="ml-1 h-7 rounded-[6px] border border-app-border bg-app-surface-container text-app-text-secondary text-[12px] px-1.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-app-accent hover:bg-app-surface-hover"
        title="字体大小"
      >
        <option value="">字号</option>
        {FONT_SIZES.map((s) => (
          <option key={s} value={s}>{s}px</option>
        ))}
      </select>
    </div>
  );
}