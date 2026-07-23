// components/PermissionPanel.tsx
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { PermissionJson, LayoutJson, FieldDefinition } from '../types';

interface Props {
  permission: PermissionJson;
  layout: LayoutJson;
  onChange: (permission: PermissionJson) => void;
}

const ROLE_HIERARCHY = [
  { value: 'STUDENT', label: '学生', level: 1 },
  { value: 'STAFF', label: '普通员工', level: 2 },
  { value: 'SENIOR', label: '高级员工', level: 3 },
  { value: 'ADMIN', label: '管理员', level: 4 },
  { value: 'SUPER_ADMIN', label: '超级管理员', level: 5 },
  { value: 'PLATFORM_OWNER', label: '平台所有者', level: 6 },
];

const labelClass = "text-[11px] font-medium text-[var(--app-color-text-secondary)] mb-1 block";

export default function PermissionPanel({ permission, layout, onChange }: Props) {
  const [showFields, setShowFields] = useState(false);
  const update = (patch: Partial<PermissionJson>) => onChange({ ...permission, ...patch });

  // 当前选中的最小可编辑角色
  const minEditRole = permission.visibleRoles?.[0] || '';
  const setMinEditRole = (role: string) => {
    update({ visibleRoles: role ? [role] : [] });
  };

  return (
    <div className="space-y-4">
      {/* 最低可编辑角色 — 单选 */}
      <div>
        <label className={labelClass}>最低可编辑角色（所选等级及以上可编辑）</label>
        <div className="space-y-1">
          {ROLE_HIERARCHY.map(r => {
            const selected = r.value === minEditRole;
            return (
              <button
                key={r.value}
                onClick={() => setMinEditRole(selected ? '' : r.value)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-[6px] text-[12px] text-left transition-colors ${
                  selected
                    ? 'bg-[var(--app-color-accent-soft)] border border-[var(--app-color-accent)] text-[var(--app-color-text-primary)]'
                    : 'border border-[var(--app-color-border)] text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]'
                }`}
              >
                <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                  selected ? 'border-[var(--app-color-accent)]' : 'border-[var(--app-color-border)]'
                }`}>
                  {selected && <span className="w-2 h-2 rounded-full bg-[var(--app-color-accent)]" />}
                </span>
                <span className="flex-1">{r.label}</span>
                <span className="text-[10px] text-[var(--app-color-text-tertiary)]">Lv.{r.level}</span>
                {selected && (
                  <span className="text-[10px] text-[var(--app-color-accent)]">
                    {ROLE_HIERARCHY.filter(x => x.level >= r.level).map(x => x.label).join('、')} 可编辑
                  </span>
                )}
              </button>
            );
          })}
        </div>
        {!minEditRole && (
          <p className="text-[10px] text-[var(--app-color-text-tertiary)] mt-1">未选择 → 所有人可编辑</p>
        )}
      </div>

      {/* 允许所有人查看（只读） */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={permission.allowUnboundView ?? true}
          onChange={e => update({ allowUnboundView: e.target.checked })}
          className="w-3.5 h-3.5 accent-[var(--app-color-accent)]"
        />
        <label className="text-[11px] text-[var(--app-color-text-secondary)]">
          允许所有登录用户查看（不可编辑）
        </label>
      </div>

      <div className="border-t border-[var(--app-color-border)]" />

      {/* 字段级可填角色 — 可折叠 */}
      <button
        onClick={() => setShowFields(!showFields)}
        className="w-full flex items-center gap-1.5 py-1 text-[11px] font-medium text-[var(--app-color-text-secondary)] hover:text-[var(--app-color-text-primary)] transition-colors"
      >
        {showFields ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        字段级可填角色（空 = 继承全局设置）
        <span className="text-[10px] text-[var(--app-color-text-tertiary)] ml-auto">
          {Object.keys(permission.fieldRoleBindings).length} 个已设置
        </span>
      </button>

      {showFields && (
        <div className="space-y-1.5 mt-1 max-h-[300px] overflow-y-auto">
          {(layout?.cells || []).filter(c => c.kind === 'field' && c.fieldKey).map(cell => {
            const field = (layout?.fields || {})[cell.fieldKey!] as FieldDefinition;
            if (!field) return null;
            const binding = permission.fieldRoleBindings[cell.fieldKey!];
            const selectedRoles = binding?.editableByRoles || field.editableByRoles || [];
            return (
              <div key={cell.id} className="p-2 rounded-[6px] border border-[var(--app-color-border)]">
                <div className="text-[11px] font-medium text-[var(--app-color-text-primary)] mb-1">
                  {field.label || cell.fieldKey}
                </div>
                <div className="flex flex-wrap gap-1">
                  {ROLE_HIERARCHY.map(r => (
                    <label key={r.value} className="flex items-center gap-0.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedRoles.includes(r.value)}
                        onChange={() => {
                          const next = selectedRoles.includes(r.value)
                            ? selectedRoles.filter(x => x !== r.value)
                            : [...selectedRoles, r.value];
                          onChange({
                            ...permission,
                            fieldRoleBindings: {
                              ...permission.fieldRoleBindings,
                              [cell.fieldKey!]: { editableByRoles: next },
                            },
                          });
                        }}
                        className="w-3 h-3 accent-[var(--app-color-accent)]"
                      />
                      <span className="text-[10px] text-[var(--app-color-text-tertiary)]">{r.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
