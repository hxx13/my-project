// components/PermissionPanel.tsx
import type { PermissionJson, LayoutJson, FieldDefinition } from '../types';

interface Props {
  permission: PermissionJson;
  layout: LayoutJson;
  onChange: (permission: PermissionJson) => void;
}

const ALL_ROLES = ['ADMIN', 'SUPER_ADMIN', 'STAFF', 'STUDENT', 'INSPECTOR'];

const inputClass = "w-full rounded-[6px] border border-[var(--app-color-border)] bg-[var(--app-color-surface-page)] px-2 py-1 text-xs text-[var(--app-color-text-primary)] outline-none focus:border-[var(--app-color-accent)]";
const labelClass = "text-[11px] font-medium text-[var(--app-color-text-secondary)] mb-0.5 block";

export default function PermissionPanel({ permission, layout, onChange }: Props) {
  const update = (patch: Partial<PermissionJson>) => onChange({ ...permission, ...patch });

  const toggleRole = (role: string) => {
    const roles = permission.visibleRoles.includes(role)
      ? permission.visibleRoles.filter(r => r !== role)
      : [...permission.visibleRoles, role];
    update({ visibleRoles: roles });
  };

  const updateFieldRoles = (fieldKey: string, roles: string[]) => {
    update({
      fieldRoleBindings: {
        ...permission.fieldRoleBindings,
        [fieldKey]: { editableByRoles: roles },
      },
    });
  };

  // Get all field-typed cells
  const fieldCells = layout.cells.filter(c => c.kind === 'field' && c.fieldKey);
  const fields = layout.fields;

  return (
    <div className="p-3 space-y-3 overflow-y-auto max-h-[calc(100vh-120px)]">
      <h3 className="text-xs font-semibold text-[var(--app-color-text-primary)] uppercase tracking-wider">权限配置</h3>

      {/* Visible roles */}
      <div>
        <label className={labelClass}>可见角色（勾选的才能看到此报表）</label>
        <div className="flex flex-wrap gap-2 mt-1">
          {ALL_ROLES.map(role => (
            <label key={role} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={permission.visibleRoles.includes(role)}
                onChange={() => toggleRole(role)}
                className="w-3.5 h-3.5 accent-[var(--app-color-accent)]"
              />
              <span className="text-[11px] text-[var(--app-color-text-secondary)]">{role}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Allow unbound view */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={permission.allowUnboundView ?? true}
          onChange={e => update({ allowUnboundView: e.target.checked })}
          className="w-3.5 h-3.5 accent-[var(--app-color-accent)]"
        />
        <label className="text-[11px] text-[var(--app-color-text-secondary)]">
          允许未绑定角色的用户查看（只读，不可编辑）
        </label>
      </div>

      <div className="border-t border-[var(--app-color-border)] pt-3" />

      {/* Field-level role bindings */}
      <div>
        <label className={labelClass}>字段级可填角色（空=所有人可填）</label>
        <div className="space-y-2 mt-1">
          {fieldCells.map(cell => {
            const field = fields[cell.fieldKey!] as FieldDefinition;
            if (!field) return null;
            const binding = permission.fieldRoleBindings[cell.fieldKey!];
            const selectedRoles = binding?.editableByRoles || field.editableByRoles || [];

            return (
              <div key={cell.id} className="p-2 rounded-[6px] border border-[var(--app-color-border)]">
                <div className="text-[11px] font-medium text-[var(--app-color-text-primary)] mb-1">
                  {field.label || cell.fieldKey}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ALL_ROLES.map(role => (
                    <label key={role} className="flex items-center gap-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedRoles.includes(role)}
                        onChange={() => {
                          const next = selectedRoles.includes(role)
                            ? selectedRoles.filter(r => r !== role)
                            : [...selectedRoles, role];
                          updateFieldRoles(cell.fieldKey!, next);
                        }}
                        className="w-3 h-3 accent-[var(--app-color-accent)]"
                      />
                      <span className="text-[10px] text-[var(--app-color-text-tertiary)]">{role}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
