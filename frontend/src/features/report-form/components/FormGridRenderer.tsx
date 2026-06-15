// components/FormGridRenderer.tsx
import { useState, useEffect, useRef } from 'react';
import type { LayoutJson, FieldDefinition, OptionSet, PermissionJson } from '../types';
import UserSelector from './UserSelector';
import { adminHttp } from '@/api/core/adminHttp';
import toast from 'react-hot-toast';
import { Check, ChevronDown } from 'lucide-react';

interface Props {
  layout: LayoutJson | string;
  values: Record<string, unknown>;
  editable: boolean;
  onChange?: (fieldKey: string, value: unknown) => void;
  userRoles?: string[];
  permissionJson?: PermissionJson;
}

/** 后端返回的 layoutJson 可能是字符串，统一解析为对象 */
export function parseLayoutJson(raw: unknown): LayoutJson {
  if (!raw) return { cells: [], fields: {}, mergeGroups: [] };
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return { cells: [], fields: {}, mergeGroups: [] }; }
  }
  return raw as LayoutJson;
}

export default function FormGridRenderer({ layout: rawLayout, values, editable, onChange, userRoles = [], permissionJson }: Props) {
  const layout = parseLayoutJson(rawLayout);
  const cellMap = new Map<string, typeof layout.cells[0]>();
  for (const cell of layout.cells) {
    cellMap.set(`${cell.row},${cell.col}`, cell);
  }

  // 动态加载 optionSetId 引用的选项集
  const [optionsSetMap, setOptionsSetMap] = useState<Record<string, { label: string; value: string }[]>>({});
  const fieldsKey = JSON.stringify(Object.keys(layout.fields || {}));

  useEffect(() => {
    const ids = new Set<string>();
    for (const field of Object.values(layout.fields || {})) {
      if (field.optionSetId) ids.add(field.optionSetId);
    }
    if (ids.size === 0) return;

    // 并行加载所有引用的选项集
    Promise.all(
      [...ids].map(id =>
        adminHttp.get(`/report-form/option-sets/${id}`)
          .then(({ data }) => data?.data as OptionSet | undefined)
          .catch(() => undefined)
      )
    ).then(results => {
      const map: Record<string, { label: string; value: string }[]> = {};
      results.forEach((set, i) => {
        if (!set) return;
        const id = [...ids][i];
        // itemsJson 可能是 JSON 字符串或已解析数组
        let items: { label: string; sortOrder?: number }[];
        if (typeof set.itemsJson === 'string') {
          try { items = JSON.parse(set.itemsJson); }
          catch { items = []; }
        } else if (Array.isArray(set.itemsJson)) {
          items = set.itemsJson;
        } else {
          items = [];
        }
        // 去重：按 label 合并去重
        const seen = new Set<string>();
        const result: { label: string; value: string }[] = [];
        for (const item of items) {
          if (!seen.has(item.label)) {
            seen.add(item.label);
            result.push({ label: item.label, value: item.label });
          }
        }
        map[id] = result;
      });
      setOptionsSetMap(map);
    });
  }, [fieldsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const maxRow = Math.max(...layout.cells.map(c => c.row + c.rowSpan), 1);
  const maxCol = Math.max(...layout.cells.map(c => c.col + c.colSpan), 1);
  const rendered = new Set<string>();

  /** 合并直接 options 和 optionSetId 引用的选项 */
  const getFieldOptions = (field: FieldDefinition): { label: string; value: string }[] => {
    if (field.optionSetId && optionsSetMap[field.optionSetId]) {
      // 选项集引用优先，合并本地 options（本地可覆盖或追加）
      const setOpts = optionsSetMap[field.optionSetId];
      const localOpts = field.options || [];
      if (localOpts.length === 0) return setOpts;
      // 去重：移除本地中已在选项集中出现的
      const setValues = new Set(setOpts.map(o => o.value));
      const uniqueLocal = localOpts.filter(o => !setValues.has(o.value));
      return [...setOpts, ...uniqueLocal];
    }
    return field.options || [];
  };

  const canEditField = (field: FieldDefinition, fieldKey?: string): boolean => {
    if (!editable) return false;
    if (field.editableInFill === false) return false;

    // 字段级权限（从 permissionJson.fieldRoleBindings 读取）
    if (fieldKey && permissionJson) {
      const bindings = (permissionJson as unknown as Record<string, unknown>).fieldRoleBindings as Record<string, { editableByRoles?: string[] }> | undefined;
      if (bindings?.[fieldKey]?.editableByRoles?.length) {
        return bindings[fieldKey].editableByRoles!.some(r => userRoles.includes(r));
      }
    }

    // 字段自身 editableByRoles
    const roles = field.editableByRoles || [];
    if (roles.length === 0) return true;
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
    const fieldKey = cell.fieldKey;
    const canEdit = canEditField(field, fieldKey);
    if (!fieldKey) return <span className="text-xs text-[var(--app-color-text-tertiary)]">—</span>;

    const inputClass = "w-full border border-[var(--app-color-border-default)] rounded-[var(--app-radius-xs)] px-2 py-1 text-xs text-[var(--app-color-text-primary)] bg-[var(--app-color-surface-page)] outline-none focus:border-[var(--app-color-accent)]";

    if (!canEdit) {
      // Read-only display
      let displayValue: string;
      if (field.type === 'BOOLEAN') {
        displayValue = toBoolean(value) ? '✓ 是' : '✗ 否';
      } else if (field.type === 'MULTI_SELECT') {
        const arr = toArray(value);
        displayValue = arr.length > 0 ? arr.join('、') : '';
      } else if (field.type === 'IMAGE' && value && value !== 'null') {
        displayValue = '[图片]';
      } else if (field.type === 'FILE' && value && value !== 'null') {
        displayValue = '[文件]';
      } else if (field.type === 'NUMBER') {
        const n = value != null && value !== '' && value !== 'null' ? Number(value) : NaN;
        displayValue = !isNaN(n) ? String(n) : '';
      } else {
        const isEmpty = value == null || value === '' || value === 'null';
        displayValue = isEmpty ? '' : String(value);
      }
      return (
        <div className="flex justify-center">
          <span className="text-xs text-[var(--app-color-text-secondary)] whitespace-nowrap overflow-hidden text-ellipsis block max-w-[300px]">
            {displayValue || ' '}
          </span>
        </div>
      );
    }

    const inlineInputClass = "w-full max-w-[300px] text-center rounded-[6px] border border-transparent bg-transparent hover:border-[var(--app-color-border)] hover:bg-[var(--app-color-surface-hover)] focus:border-[var(--app-color-accent)] focus:bg-[var(--app-color-surface-page)] px-2 py-1.5 text-xs text-[var(--app-color-text-primary)] outline-none transition-colors whitespace-nowrap overflow-hidden text-ellipsis";

    switch (field.type) {
      case 'TEXT': {
        const hint = field.maxLength ? `文本 · 最长${field.maxLength}字` : '文本';
        return (
          <div className="flex justify-center">
            <input type="text" value={String(value ?? '')}
              onChange={e => onChange?.(fieldKey, e.target.value)}
              onBlur={e => {
                if (!field.maxLength) return;
                const v = e.target.value;
                if (v.length > field.maxLength) onChange?.(fieldKey, '');
              }}
              className={inlineInputClass}
              placeholder={hint} />
          </div>
        );
      }
      case 'NUMBER': {
        const numVal = value != null && value !== '' && value !== 'null'
          ? Number(value) : undefined;
        const display = numVal != null && !isNaN(numVal) ? String(numVal) : '';
        const parts: string[] = ['数字'];
        if (field.min != null && field.max != null) parts.push(`${field.min}~${field.max}`);
        else if (field.min != null) parts.push(`≥${field.min}`);
        else if (field.max != null) parts.push(`≤${field.max}`);
        const hint = parts.join(' · ');
        return (
          <div className="flex justify-center">
            <input type="number" value={display}
              onChange={e => {
                const v = e.target.value;
                onChange?.(fieldKey, v === '' ? undefined : Number(v));
              }}
              onBlur={e => {
                const v = e.target.value;
                if (v === '') return;
                const n = Number(v);
                if (isNaN(n)) { onChange?.(fieldKey, undefined); return; }
                if (field.min != null && n < field.min) { onChange?.(fieldKey, undefined); return; }
                if (field.max != null && n > field.max) { onChange?.(fieldKey, undefined); return; }
              }}
              className={inlineInputClass}
              placeholder={hint} />
          </div>
        );
      }
      case 'BOOLEAN': {
        const checked = toBoolean(value);
        return (
          <div className="flex justify-center">
            <button
              onClick={() => onChange?.(fieldKey, !checked)}
              className={`w-5 h-5 rounded-[4px] border-2 flex items-center justify-center transition-colors ${
                checked
                  ? 'bg-[var(--app-color-accent)] border-[var(--app-color-accent)] text-white'
                  : 'border-[var(--app-color-border)] bg-[var(--app-color-surface-page)] hover:border-[var(--app-color-accent)]'
              }`}
            >
              {checked && <Check className="w-3 h-3" />}
            </button>
          </div>
        );
      }
      case 'SELECT': {
        const selectOpts = getFieldOptions(field);
        const currentVal = String(value ?? '');
        const currentLabel = selectOpts.find(o => o.value === currentVal)?.label;
        const [open, setOpen] = useState(false);
        const [hover, setHover] = useState(false);
        const ref = useRef<HTMLDivElement>(null);

        useEffect(() => {
          if (!open) return;
          const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
          document.addEventListener('mousedown', h);
          return () => document.removeEventListener('mousedown', h);
        }, [open]);

        return (
          <div className="flex justify-center">
            <div ref={ref} className="relative w-full max-w-[200px]">
              <button
                onClick={() => setOpen(!open)}
                onMouseEnter={() => setHover(true)}
                onMouseLeave={() => setHover(false)}
                className="w-full flex items-center justify-center gap-1 rounded-[6px] border border-transparent
                           bg-transparent px-2 py-1.5 text-xs text-[var(--app-color-text-primary)] outline-none
                           transition-all hover:border-[var(--app-color-border)] hover:bg-[var(--app-color-surface-hover)]
                           cursor-pointer min-h-[28px]"
              >
                <span className={currentVal ? 'text-[var(--app-color-text-primary)]' : 'text-[var(--app-color-text-tertiary)]'}>
                  {currentLabel || currentVal || ''}
                </span>
                <ChevronDown className={`w-3 h-3 text-[var(--app-color-text-tertiary)] transition-all ${hover || open ? 'opacity-100' : 'opacity-0'}`} />
              </button>

              {open && (
                <div className="absolute top-full left-0 mt-1 w-full min-w-[160px] rounded-[var(--app-radius-container)]
                                border border-[var(--app-color-border)] bg-[var(--app-color-surface-elevated)]
                                shadow-lg z-[var(--z-dropdown)] py-1 max-h-[220px] overflow-y-auto">
                  <button
                    onClick={() => { onChange?.(fieldKey, ''); setOpen(false); }}
                    className={`w-full px-3 py-1.5 text-[12px] text-left transition-colors italic
                      ${!currentVal ? 'bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)]' : 'text-[var(--app-color-text-tertiary)] hover:bg-[var(--app-color-surface-hover)]'}`}
                  >
                    空白
                  </button>
                  {selectOpts.map((opt, i) => {
                    const isSel = opt.value === currentVal;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => { onChange?.(fieldKey, opt.value); setOpen(false); }}
                        className={`w-full px-3 py-1.5 text-[12px] text-left transition-colors
                          ${isSel ? 'bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent)] font-medium' : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]'}
                          ${i % 2 === 0 ? '' : 'border-t border-[var(--app-color-border)]/[0.2]'}`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      }
      case 'MULTI_SELECT': {
        const selected: string[] = toArray(value);
        const multiOpts = getFieldOptions(field);
        const [open, setOpen] = useState(false);
        const ref = useRef<HTMLDivElement>(null);

        useEffect(() => {
          if (!open) return;
          const h = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
          };
          document.addEventListener('mousedown', h);
          return () => document.removeEventListener('mousedown', h);
        }, [open]);

        const toggleOption = (optValue: string, e: React.MouseEvent) => {
          e.stopPropagation();
          const next = selected.includes(optValue)
            ? selected.filter(v => v !== optValue)
            : [...selected, optValue];
          onChange?.(fieldKey, next);
        };

        return (
          <div className="flex justify-center">
            <div ref={ref} className="relative w-full max-w-[200px]">
              {/* 触发器 */}
              <button
                onClick={() => setOpen(!open)}
                className="w-full flex items-center justify-center gap-1 rounded-[6px] border border-transparent
                           bg-transparent px-2 py-1.5 text-xs outline-none transition-all
                           hover:border-[var(--app-color-border)] hover:bg-[var(--app-color-surface-hover)]
                           cursor-pointer"
              >
                <span className={selected.length > 0 ? 'text-[var(--app-color-text-primary)]' : 'text-[var(--app-color-text-tertiary)]'}>
                  {selected.length > 0 ? selected.join('、') : ''}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-[var(--app-color-text-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`} />
              </button>

              {/* 下拉面板 */}
              {open && (
                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-full min-w-[180px] rounded-[var(--app-radius-container)]
                                border border-[var(--app-color-border)] bg-[var(--app-color-surface-elevated)]
                                shadow-lg z-[var(--z-dropdown)] py-1 max-h-[220px] overflow-y-auto">
                  {multiOpts.length === 0 ? (
                    <p className="px-3 py-2 text-[11px] text-[var(--app-color-text-tertiary)] italic text-center">空白</p>
                  ) : (
                    multiOpts.map((opt, i) => {
                      const isChecked = selected.includes(opt.value);
                      return (
                        <button
                          key={opt.value}
                          onClick={(e) => toggleOption(opt.value, e)}
                          className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-left transition-colors
                            ${isChecked ? 'bg-[var(--app-color-accent-soft)] text-[var(--app-color-text-primary)]' : 'text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]'}
                            ${i % 2 === 0 ? '' : 'border-t border-[var(--app-color-border)]/[0.3]'}`}
                        >
                          <span className={`w-4 h-4 rounded-[3px] border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            isChecked
                              ? 'bg-[var(--app-color-accent)] border-[var(--app-color-accent)] text-white'
                              : 'border-[var(--app-color-border)] bg-[var(--app-color-surface-page)]'
                          }`}>
                            {isChecked && <Check className="w-2.5 h-2.5" />}
                          </span>
                          <span>{opt.label}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        );
      }
      case 'DATETIME':
        return (
          <div className="flex justify-center">
            <input type="datetime-local" value={String(value ?? '')} onChange={e => onChange?.(fieldKey, e.target.value)}
              className={inlineInputClass} placeholder="日期时间" />
          </div>
        );
      case 'IMAGE': {
        const [imgError, setImgError] = useState(false);
        return (
          <div className="space-y-1 flex flex-col items-center">
            <input type="text" value={String(value ?? '')}
              onChange={e => { setImgError(false); onChange?.(fieldKey, e.target.value); }}
              className={`${inlineInputClass} text-left`} placeholder="粘贴图片链接" />
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
          <div className="space-y-1 flex flex-col items-center">
            <input
              type="file"
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
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
                  onChange?.(fieldKey, file.name);
                  toast.error('文件上传失败，已保存文件名');
                }
              }}
              className="text-[11px]"
            />
            {value != null && typeof value === 'string' && value.length > 0 && (
              <a href={String(value)} target="_blank" rel="noopener noreferrer"
                className="text-[11px] text-[var(--app-color-accent)] underline block">
                查看文件
              </a>
            )}
          </div>
        );
      case 'USER':
        return (
          <div className="flex justify-center">
            <UserSelector
              value={String(value ?? '')}
              onChange={v => onChange?.(fieldKey, v)}
              multi={field.props?.multi === true}
            />
          </div>
        );
      case 'AUTO_USER':
        return (
          <div className="flex justify-center">
            <span className="text-xs text-[var(--app-color-text-tertiary)] italic">
              {value ? String(value) : '（保存时自动记录）'}
            </span>
          </div>
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
                    style={{
                      textAlign: cell.style.align,
                      fontWeight: cell.style.bold ? 'bold' : 'normal',
                      fontSize: cell.style.fontSize ? `${cell.style.fontSize}px` : undefined,
                      color: cell.style.color || undefined,
                      backgroundColor: cell.style.bg || undefined,
                    }}
                  >
                    {cell.kind === 'static' ? (
                      <span>{cell.staticText || ' '}</span>
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
