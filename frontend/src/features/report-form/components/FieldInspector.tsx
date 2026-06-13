import { useState, useRef, useCallback, useEffect } from 'react';
import type { GridCell, LayoutJson, FieldType, FieldDefinition, CellStyle } from '../types';
import { X, GripHorizontal } from 'lucide-react';

interface Props {
  selectedCell: GridCell | null;
  layout: LayoutJson;
  onUpdateCell: (cellId: string, patch: Partial<GridCell>) => void;
  onUpdateStyle: (cellId: string, patch: Partial<CellStyle>) => void;
  onToggleKind: (cellId: string) => void;
  onUpdateField: (fieldKey: string, patch: Partial<FieldDefinition>) => void;
  onClose: () => void;
}

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'TEXT', label: '文本' },
  { value: 'NUMBER', label: '数字' },
  { value: 'BOOLEAN', label: '勾选' },
  { value: 'SELECT', label: '单选下拉' },
  { value: 'MULTI_SELECT', label: '多选下拉' },
  { value: 'DATETIME', label: '日期时间' },
  { value: 'IMAGE', label: '图片' },
  { value: 'FILE', label: '文件' },
  { value: 'USER', label: '人员' },
];

const ALIGN_OPTIONS = [
  { value: 'left', label: '左' },
  { value: 'center', label: '中' },
  { value: 'right', label: '右' },
] as const;

const inputClass =
  'w-full rounded-[4px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)] px-2 py-1 text-[11px] text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]';
const labelClass = 'text-[10px] font-medium text-[var(--app-color-text-secondary)] mb-0.5 block';

export default function FieldInspector({
  selectedCell, layout, onUpdateCell, onUpdateStyle, onToggleKind, onUpdateField, onClose,
}: Props) {
  // 可拖动 + 可缩放
  const [pos, setPos] = useState({ x: window.innerWidth - 420, y: 80 });
  const [size, setSize] = useState({ w: 300, h: 500 });
  const dragging = useRef(false);
  const resizing = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const startSize = useRef({ w: 0, h: 0, x: 0, y: 0 });

  const onMouseMove = useCallback((e: MouseEvent) => {
    if (dragging.current) {
      setPos({ x: e.clientX - offset.current.x, y: e.clientY - offset.current.y });
    }
    if (resizing.current) {
      const dw = e.clientX - startSize.current.x;
      const dh = e.clientY - startSize.current.y;
      setSize({ w: Math.max(240, startSize.current.w + dw), h: Math.max(200, startSize.current.h + dh) });
    }
  }, []);

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    resizing.current = false;
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  if (!selectedCell) return null;

  const field = selectedCell.fieldKey ? layout.fields[selectedCell.fieldKey] : null;
  const isStatic = selectedCell.kind === 'static';

  return (
    <div
      className="fixed rounded-[var(--app-radius-container)] border border-[var(--app-color-border)]
                 bg-[var(--app-color-surface-elevated)] shadow-lg flex flex-col overflow-hidden"
      style={{ left: pos.x, top: pos.y, width: size.w, height: size.h, zIndex: 800 }}
    >
      {/* 标题栏 — 可拖动 */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-[var(--app-color-surface-container)] cursor-move select-none shrink-0"
        onMouseDown={(e) => {
          dragging.current = true;
          offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
        }}
      >
        <span className="text-[11px] font-semibold text-[var(--app-color-text-primary)]">
          格子属性 · {selectedCell.id}
        </span>
        <button onClick={onClose}
          className="p-0.5 rounded-[4px] hover:bg-[var(--app-color-surface-hover)]">
          <X className="w-3.5 h-3.5 text-[var(--app-color-text-secondary)]" />
        </button>
      </div>

      {/* 内容区 — 可滚动 */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {/* Kind toggle */}
        <div>
          <label className={labelClass}>类型</label>
          <div className="flex gap-1">
            <button onClick={() => onToggleKind(selectedCell.id)}
              className={`flex-1 px-2 py-1 rounded-[4px] text-[10px] font-medium transition-colors ${
                isStatic ? 'bg-[var(--app-color-accent)] text-white' : 'border border-[var(--app-color-border)] text-[var(--app-color-text-secondary)]'
              }`}>静态文本</button>
            <button onClick={() => onToggleKind(selectedCell.id)}
              className={`flex-1 px-2 py-1 rounded-[4px] text-[10px] font-medium transition-colors ${
                !isStatic ? 'bg-[var(--app-color-accent)] text-white' : 'border border-[var(--app-color-border)] text-[var(--app-color-text-secondary)]'
              }`}>填报字段</button>
          </div>
        </div>

        {isStatic ? (
          <div>
            <label className={labelClass}>文案内容</label>
            <textarea value={selectedCell.staticText || ''}
              onChange={e => onUpdateCell(selectedCell.id, { staticText: e.target.value })}
              className={`${inputClass} h-16 resize-none`} placeholder="输入文本..." />
          </div>
        ) : field ? (
          <>
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <label className={labelClass}>字段 Key</label>
                <input value={selectedCell.fieldKey || ''}
                  onChange={e => onUpdateCell(selectedCell.id, { fieldKey: e.target.value })}
                  className={inputClass} placeholder="f_xxx" />
              </div>
              <div>
                <label className={labelClass}>字段标签</label>
                <input value={field.label || ''}
                  onChange={e => onUpdateField(selectedCell.fieldKey!, { label: e.target.value })}
                  className={inputClass} placeholder="显示名称" />
              </div>
            </div>
            <div>
              <label className={labelClass}>字段类型</label>
              <select value={field.type}
                onChange={e => onUpdateField(selectedCell.fieldKey!, { type: e.target.value as FieldType })}
                className={inputClass}>
                {FIELD_TYPES.map(ft => <option key={ft.value} value={ft.value}>{ft.label}</option>)}
              </select>
            </div>

            {(field.type === 'SELECT' || field.type === 'MULTI_SELECT') && (
              <div>
                <label className={labelClass}>选项（每行一个）</label>
                <textarea
                  value={(field.options || []).map(o => o.label).join('\n')}
                  onChange={e => {
                    const opts = e.target.value.split('\n').filter(Boolean).map(label => ({ label: label.trim(), value: label.trim() }));
                    onUpdateField(selectedCell.fieldKey!, { options: opts });
                  }}
                  className={`${inputClass} h-20 resize-none`} placeholder="A\nB\nC" />
              </div>
            )}

            {field.type === 'NUMBER' && (
              <div className="grid grid-cols-2 gap-1.5">
                <div><label className={labelClass}>最小值</label><input type="number" value={field.min ?? ''}
                  onChange={e => onUpdateField(selectedCell.fieldKey!, { min: e.target.value !== '' ? Number(e.target.value) : undefined })}
                  className={inputClass} /></div>
                <div><label className={labelClass}>最大值</label><input type="number" value={field.max ?? ''}
                  onChange={e => onUpdateField(selectedCell.fieldKey!, { max: e.target.value !== '' ? Number(e.target.value) : undefined })}
                  className={inputClass} /></div>
              </div>
            )}
            {field.type === 'TEXT' && (
              <div><label className={labelClass}>最大长度</label><input type="number" value={field.maxLength ?? ''}
                onChange={e => onUpdateField(selectedCell.fieldKey!, { maxLength: e.target.value !== '' ? Number(e.target.value) : undefined })}
                className={inputClass} /></div>
            )}
            <div className="flex items-center gap-2">
              <input type="checkbox" checked={field.required ?? false}
                onChange={e => onUpdateField(selectedCell.fieldKey!, { required: e.target.checked })}
                className="w-3 h-3 accent-[var(--app-color-accent)]" />
              <label className="text-[10px] text-[var(--app-color-text-secondary)]">必填</label>
            </div>
          </>
        ) : null}

        {/* 样式 */}
        <div className="border-t border-[var(--app-color-border)] pt-2">
          <h4 className="text-[10px] font-semibold text-[var(--app-color-text-secondary)] uppercase tracking-wider mb-1.5">样式</h4>
          <div className="space-y-1.5">
            <div>
              <label className={labelClass}>对齐</label>
              <div className="flex gap-1">
                {ALIGN_OPTIONS.map(a => (
                  <button key={a.value} onClick={() => onUpdateStyle(selectedCell.id, { align: a.value as CellStyle['align'] })}
                    className={`flex-1 px-1.5 py-0.5 rounded-[4px] text-[10px] font-medium transition-colors ${
                      selectedCell.style.align === a.value ? 'bg-[var(--app-color-accent)] text-white' : 'border border-[var(--app-color-border)] text-[var(--app-color-text-secondary)]'
                    }`}>{a.label}</button>
                ))}
              </div>
            </div>
            <div>
              <label className={labelClass}>背景色</label>
              <input type="color" value={selectedCell.style.bg || '#ffffff'}
                onChange={e => onUpdateStyle(selectedCell.id, { bg: e.target.value })}
                className="w-full h-6 rounded-[4px] cursor-pointer" />
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <div><span className="text-[9px] text-[var(--app-color-text-tertiary)]">colSpan</span>
                <input type="number" min={1} value={selectedCell.colSpan}
                  onChange={e => onUpdateCell(selectedCell.id, { colSpan: Math.max(1, Number(e.target.value)) })}
                  className={inputClass} /></div>
              <div><span className="text-[9px] text-[var(--app-color-text-tertiary)]">rowSpan</span>
                <input type="number" min={1} value={selectedCell.rowSpan}
                  onChange={e => onUpdateCell(selectedCell.id, { rowSpan: Math.max(1, Number(e.target.value)) })}
                  className={inputClass} /></div>
            </div>
          </div>
        </div>
      </div>

      {/* 右下角缩放手柄 */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize flex items-center justify-center"
        onMouseDown={(e) => {
          resizing.current = true;
          startSize.current = { w: size.w, h: size.h, x: e.clientX, y: e.clientY };
          e.stopPropagation();
        }}
      >
        <GripHorizontal className="w-3 h-3 text-[var(--app-color-text-tertiary)] rotate-45" />
      </div>
    </div>
  );
}
