// components/FormGridRenderer.tsx
import { useState } from 'react';
import type { LayoutJson, FieldDefinition } from '../types';
import UserSelector from './UserSelector';
import { adminHttp } from '@/api/core/adminHttp';
import toast from 'react-hot-toast';

interface Props {
  layout: LayoutJson;
  values: Record<string, unknown>;
  editable: boolean;
  onChange?: (fieldKey: string, value: unknown) => void;
  userRoles?: string[];
}

export default function FormGridRenderer({ layout, values, editable, onChange, userRoles = [] }: Props) {
  const cellMap = new Map<string, typeof layout.cells[0]>();
  for (const cell of layout.cells) {
    cellMap.set(`${cell.row},${cell.col}`, cell);
  }

  const maxRow = Math.max(...layout.cells.map(c => c.row + c.rowSpan), 1);
  const maxCol = Math.max(...layout.cells.map(c => c.col + c.colSpan), 1);
  const rendered = new Set<string>();

  const canEditField = (field: FieldDefinition): boolean => {
    if (!editable) return false;
    // editableInFill 默认为 true（兼容未显式设置的字段）
    if (field.editableInFill === false) return false;
    const roles = field.editableByRoles || [];
    if (roles.length === 0) return true; // empty = anyone can edit
    if (userRoles.length === 0) return false;
    return roles.some(r => userRoles.includes(r));
  };

  /** 安全获取布尔值（处理 string "false" 等） */
  const toBoolean = (v: unknown): boolean => {
    if (v === null || v === undefined) return false;
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') return v !== '' && v !== 'false' && v !== '0';
    if (typeof v === 'number') return v !== 0;
    return !!v;
  };

  /** 安全获取数组值（处理 JSON 字符串） */
  const toArray = (v: unknown): string[] => {
    if (Array.isArray(v)) return v as string[];
    if (typeof v === 'string' && v.startsWith('[')) {
      try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : []; } catch { return []; }
    }
    return v != null ? [String(v)] : [];
  };

  const renderFieldControl = (cell: typeof layout.cells[0], field: FieldDefinition, value: unknown) => {
    const canEdit = canEditField(field);
    const fieldKey = cell.fieldKey;
    if (!fieldKey) return <span className="text-xs text-[var(--app-color-text-tertiary)]">—</span>;

    const inputClass = "w-full border border-[var(--app-color-border-default)] rounded-[var(--app-radius-xs)] px-2 py-1 text-xs text-[var(--app-color-text-primary)] bg-[var(--app-color-surface-page)] outline-none focus:border-[var(--app-color-accent)]";

    if (!canEdit) {
      // Read-only display
      const displayValue = field.type === 'BOOLEAN'
        ? (toBoolean(value) ? '✓' : '✗')
        : field.type === 'IMAGE' && value
          ? '[图片]'
          : field.type === 'FILE' && value
            ? '[文件]'
            : String(value ?? '');
      return <span className="text-xs text-[var(--app-color-text-secondary)]">{displayValue}</span>;
    }

    switch (field.type) {
      case 'TEXT':
        return (
          <input type="text" value={String(value ?? '')} onChange={e => onChange?.(fieldKey, e.target.value)}
            className={inputClass} maxLength={field.maxLength || undefined} />
        );
      case 'NUMBER':
        return (
          <input type="number" value={value != null ? String(value) : ''} onChange={e => onChange?.(fieldKey, e.target.value === '' ? null : Number(e.target.value))}
            className={inputClass} min={field.min} max={field.max} step={field.step} />
        );
      case 'BOOLEAN':
        return (
          <input type="checkbox" checked={toBoolean(value)} onChange={e => onChange?.(fieldKey, e.target.checked)}
            className="w-4 h-4 accent-[var(--app-color-accent)]" />
        );
      case 'SELECT':
        return (
          <select value={String(value ?? '')} onChange={e => onChange?.(fieldKey, e.target.value)} className={inputClass}>
            <option value=""></option>
            {(field.options || []).map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        );
      case 'MULTI_SELECT': {
        const selected: string[] = toArray(value);
        return (
          <div className="flex flex-wrap gap-1">
            {(field.options || []).map(opt => (
              <label key={opt.value} className="flex items-center gap-1 text-[11px] cursor-pointer">
                <input type="checkbox" checked={selected.includes(opt.value)}
                  onChange={e => {
                    const next = e.target.checked
                      ? [...selected, opt.value]
                      : selected.filter(v => v !== opt.value);
                    onChange?.(fieldKey, next);
                  }}
                  className="w-3 h-3 accent-[var(--app-color-accent)]" />
                {opt.label}
              </label>
            ))}
          </div>
        );
      }
      case 'DATETIME':
        return (
          <input type="datetime-local" value={String(value ?? '')} onChange={e => onChange?.(fieldKey, e.target.value)}
            className={inputClass} />
        );
      case 'IMAGE': {
        const [imgError, setImgError] = useState(false);
        return (
          <div className="space-y-1">
            <input type="text" value={String(value ?? '')}
              onChange={e => { setImgError(false); onChange?.(fieldKey, e.target.value); }}
              className={inputClass} placeholder="粘贴图片链接" />
            {value && !imgError ? (
              <img src={String(value)} alt="预览"
                onError={() => setImgError(true)}
                className="max-w-[200px] max-h-[100px] rounded-[var(--app-radius-xs)] object-cover" />
            ) : value && imgError ? (
              <span className="text-[10px] text-[var(--app-color-feedback-danger)]">图片加载失败</span>
            ) : null}
          </div>
        );
      }
      case 'FILE':
        return (
          <div className="space-y-1">
            <input
              type="file"
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                // 上传到 file-templates API 获取 URL
                try {
                  const fd = new FormData();
                  fd.append('file', file);
                  const { data } = await adminHttp.post('/file-templates/upload', fd, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                  });
                  const url = data?.data?.url || data?.data;
                  onChange?.(fieldKey, url || file.name);
                  toast.success('文件上传成功');
                } catch {
                  // fallback: 保存文件名
                  onChange?.(fieldKey, file.name);
                  toast.error('文件上传失败，已保存文件名');
                }
              }}
              className="text-[11px]"
            />
            {value && typeof value === 'string' && (
              <a href={String(value)} target="_blank" rel="noopener noreferrer"
                className="text-[11px] text-[var(--app-color-accent)] underline block">
                查看文件
              </a>
            )}
            <a href="/admin/file-templates" target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-[var(--app-color-accent-secondary)] underline block">
              管理文件模板
            </a>
          </div>
        );
      case 'USER':
        return (
          <UserSelector
            value={String(value ?? '')}
            onChange={v => onChange?.(fieldKey, v)}
          />
        );
      default:
        return <span className="text-xs text-[var(--app-color-text-tertiary)]">—</span>;
    }
  };

  return (
    <div className="overflow-auto border border-[var(--app-color-border-default)] rounded-[var(--app-radius-container)]">
      <table className="border-collapse w-full">
        <tbody>
          {Array.from({ length: maxRow }, (_, r) => (
            <tr key={r}>
              {Array.from({ length: maxCol }, (_, c) => {
                const key = `${r},${c}`;
                if (rendered.has(key)) return null;
                const cell = cellMap.get(key);
                if (!cell) {
                  return <td key={key} className="border border-[var(--app-color-border-default)] min-w-[80px] h-[32px]" />;
                }
                for (let dr = 0; dr < cell.rowSpan; dr++)
                  for (let dc = 0; dc < cell.colSpan; dc++)
                    rendered.add(`${r + dr},${c + dc}`);

                return (
                  <td
                    key={cell.id}
                    colSpan={cell.colSpan}
                    rowSpan={cell.rowSpan}
                    className="border border-[var(--app-color-border-default)] p-2"
                    style={{ textAlign: cell.style.align }}
                  >
                    {cell.kind === 'static' ? (
                      <span style={{
                        fontWeight: cell.style.bold ? 'bold' : 'normal',
                        fontSize: cell.style.fontSize ? `${cell.style.fontSize}px` : undefined,
                      }}>
                        {cell.staticText || ' '}
                      </span>
                    ) : cell.fieldKey ? (
                      renderFieldControl(cell, layout.fields[cell.fieldKey] || {
                        type: 'TEXT',
                        label: cell.fieldKey,
                        editableInFill: true,
                      } as FieldDefinition, values[cell.fieldKey])
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
