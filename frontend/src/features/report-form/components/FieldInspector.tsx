import type { GridCell, LayoutJson, FieldType, FieldDefinition, CellStyle } from '../types';

interface Props {
  selectedCell: GridCell | null;
  layout: LayoutJson;
  onUpdateCell: (cellId: string, patch: Partial<GridCell>) => void;
  onUpdateStyle: (cellId: string, patch: Partial<CellStyle>) => void;
  onToggleKind: (cellId: string) => void;
  onUpdateField: (fieldKey: string, patch: Partial<FieldDefinition>) => void;
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
  'w-full rounded-[6px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)] px-2 py-1 text-xs text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]';

const labelClass = 'text-[11px] font-medium text-[var(--app-color-text-secondary)] mb-0.5 block';

export default function FieldInspector({
  selectedCell,
  layout,
  onUpdateCell,
  onUpdateStyle,
  onToggleKind,
  onUpdateField,
}: Props) {
  if (!selectedCell) {
    return (
      <div className="p-4 text-sm text-[var(--app-color-text-tertiary)]">
        点击格子查看属性
      </div>
    );
  }

  const field = selectedCell.fieldKey ? layout.fields[selectedCell.fieldKey] : null;
  const isStatic = selectedCell.kind === 'static';

  return (
    <div className="p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-120px)]">
      <h3 className="text-xs font-semibold text-[var(--app-color-text-primary)] uppercase tracking-wider">
        格子属性 · {selectedCell.id}
      </h3>

      {/* Kind toggle */}
      <div>
        <label className={labelClass}>类型</label>
        <div className="flex gap-1">
          <button
            onClick={() => onToggleKind(selectedCell.id)}
            className={`flex-1 px-2 py-1 rounded-[6px] text-[11px] font-medium transition-colors ${
              isStatic
                ? 'bg-[var(--app-color-accent)] text-white'
                : 'border border-[var(--app-color-border)] text-[var(--app-color-text-secondary)]'
            }`}
          >
            静态文本
          </button>
          <button
            onClick={() => onToggleKind(selectedCell.id)}
            className={`flex-1 px-2 py-1 rounded-[6px] text-[11px] font-medium transition-colors ${
              !isStatic
                ? 'bg-[var(--app-color-accent)] text-white'
                : 'border border-[var(--app-color-border)] text-[var(--app-color-text-secondary)]'
            }`}
          >
            填报字段
          </button>
        </div>
      </div>

      {isStatic ? (
        <>
          {/* Static cell: text content */}
          <div>
            <label className={labelClass}>文案内容</label>
            <textarea
              value={selectedCell.staticText || ''}
              onChange={(e) => onUpdateCell(selectedCell.id, { staticText: e.target.value })}
              className={`${inputClass} h-20 resize-none`}
              placeholder="输入文本内容..."
            />
          </div>
        </>
      ) : field ? (
        <>
          {/* Field cell */}
          <div>
            <label className={labelClass}>字段 Key</label>
            <input
              value={selectedCell.fieldKey || ''}
              onChange={(e) => onUpdateCell(selectedCell.id, { fieldKey: e.target.value })}
              className={inputClass}
              placeholder="f_xxx"
            />
          </div>
          <div>
            <label className={labelClass}>字段类型</label>
            <select
              value={field.type}
              onChange={(e) =>
                onUpdateField(selectedCell.fieldKey!, { type: e.target.value as FieldType })
              }
              className={inputClass}
            >
              {FIELD_TYPES.map((ft) => (
                <option key={ft.value} value={ft.value}>
                  {ft.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>字段标签</label>
            <input
              value={field.label || ''}
              onChange={(e) =>
                onUpdateField(selectedCell.fieldKey!, { label: e.target.value })
              }
              className={inputClass}
              placeholder="字段显示名称"
            />
          </div>

          {/* SELECT/MULTI_SELECT: inline options */}
          {(field.type === 'SELECT' || field.type === 'MULTI_SELECT') && (
            <div>
              <label className={labelClass}>选项（每行一个）</label>
              <textarea
                value={(field.options || []).map((o) => o.label).join('\n')}
                onChange={(e) => {
                  const opts = e.target.value
                    .split('\n')
                    .filter(Boolean)
                    .map((label) => ({
                      label: label.trim(),
                      value: label.trim(),
                    }));
                  onUpdateField(selectedCell.fieldKey!, { options: opts });
                }}
                className={`${inputClass} h-24 resize-none`}
                placeholder={'选项A\n选项B\n选项C'}
              />
            </div>
          )}

          {/* NUMBER: min/max */}
          {field.type === 'NUMBER' && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelClass}>最小值</label>
                <input
                  type="number"
                  value={field.min ?? ''}
                  onChange={(e) =>
                    onUpdateField(selectedCell.fieldKey!, {
                      min: e.target.value !== '' ? Number(e.target.value) : undefined,
                    })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>最大值</label>
                <input
                  type="number"
                  value={field.max ?? ''}
                  onChange={(e) =>
                    onUpdateField(selectedCell.fieldKey!, {
                      max: e.target.value !== '' ? Number(e.target.value) : undefined,
                    })
                  }
                  className={inputClass}
                />
              </div>
            </div>
          )}

          {/* TEXT: maxLength */}
          {field.type === 'TEXT' && (
            <div>
              <label className={labelClass}>最大长度</label>
              <input
                type="number"
                value={field.maxLength ?? ''}
                onChange={(e) =>
                  onUpdateField(selectedCell.fieldKey!, {
                    maxLength: e.target.value !== '' ? Number(e.target.value) : undefined,
                  })
                }
                className={inputClass}
              />
            </div>
          )}

          {/* Required checkbox */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={field.required ?? false}
              onChange={(e) =>
                onUpdateField(selectedCell.fieldKey!, { required: e.target.checked })
              }
              className="w-3.5 h-3.5 accent-[var(--app-color-accent)]"
            />
            <label className="text-[11px] text-[var(--app-color-text-secondary)]">必填</label>
          </div>
        </>
      ) : null}

      {/* Common style controls */}
      <div className="border-t border-[var(--app-color-border)] pt-3">
        <h4 className="text-[11px] font-semibold text-[var(--app-color-text-secondary)] uppercase tracking-wider mb-2">
          样式
        </h4>
        <div className="space-y-2">
          <div>
            <label className={labelClass}>对齐</label>
            <div className="flex gap-1">
              {ALIGN_OPTIONS.map((a) => (
                <button
                  key={a.value}
                  onClick={() =>
                    onUpdateStyle(selectedCell.id, {
                      align: a.value as CellStyle['align'],
                    })
                  }
                  className={`flex-1 px-2 py-1 rounded-[6px] text-[10px] font-medium transition-colors ${
                    selectedCell.style.align === a.value
                      ? 'bg-[var(--app-color-accent)] text-white'
                      : 'border border-[var(--app-color-border)] text-[var(--app-color-text-secondary)]'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelClass}>背景色</label>
            <input
              type="color"
              value={selectedCell.style.bg || '#ffffff'}
              onChange={(e) => onUpdateStyle(selectedCell.id, { bg: e.target.value })}
              className="w-full h-8 rounded-[6px] cursor-pointer"
            />
          </div>
          <div>
            <label className={labelClass}>合并</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] text-[var(--app-color-text-tertiary)]">colSpan</span>
                <input
                  type="number"
                  min={1}
                  value={selectedCell.colSpan}
                  onChange={(e) =>
                    onUpdateCell(selectedCell.id, {
                      colSpan: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className={inputClass}
                />
              </div>
              <div>
                <span className="text-[10px] text-[var(--app-color-text-tertiary)]">rowSpan</span>
                <input
                  type="number"
                  min={1}
                  value={selectedCell.rowSpan}
                  onChange={(e) =>
                    onUpdateCell(selectedCell.id, {
                      rowSpan: Math.max(1, Number(e.target.value)),
                    })
                  }
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
