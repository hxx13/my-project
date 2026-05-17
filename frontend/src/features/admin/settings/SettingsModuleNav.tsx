import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { AdminSelect } from "@/components/admin/AdminSelect";
import { adminLabelClass } from "@/features/admin/adminFormUi";
import {
  groupSettingsModules,
  moduleDescription,
  moduleLabel,
  type SettingsNavGroup,
} from "@/features/admin/settings/settingsLabels";

type ModuleItem = { key: string; label: string };

type SettingsModuleNavProps = {
  modules: ModuleItem[];
  activeModule: string;
  onChange: (key: string) => void;
};

function NavGroupList({
  groups,
  activeModule,
  onChange,
  className,
}: {
  groups: SettingsNavGroup[];
  activeModule: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      {groups.map((group) => (
        <div key={group.id}>
          <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{group.title}</p>
          <ul className="space-y-0.5" role="list">
            {group.items.map((item) => {
              const active = activeModule === item.key;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => onChange(item.key)}
                    className={cn(
                      "w-full rounded-lg px-2.5 py-2 text-left text-sm font-medium transition",
                      active
                        ? "bg-[#0070f3]/10 text-[#0070f3] ring-1 ring-[#0070f3]/25"
                        : "text-neutral-700 hover:bg-neutral-100",
                    )}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function SettingsModuleNav({ modules, activeModule, onChange }: SettingsModuleNavProps) {
  const groups = useMemo(() => groupSettingsModules(modules), [modules]);
  const activeLabel = moduleLabel(modules, activeModule);

  return (
    <>
      {/* 小屏：分组下拉，避免平铺占满屏 */}
      <div className="lg:hidden">
        <label className={cn(adminLabelClass, "mb-1 block")}>配置模块</label>
        <AdminSelect value={activeModule} onChange={(e) => onChange(e.target.value)} className="w-full">
          {groups.map((group) => (
            <optgroup key={group.id} label={group.title}>
              {group.items.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.label}
                </option>
              ))}
            </optgroup>
          ))}
        </AdminSelect>
        <p className="mt-2 text-xs leading-relaxed text-neutral-600">
          <span className="font-medium text-neutral-800">{activeLabel}</span>
          <span className="mx-1 text-neutral-300">·</span>
          {moduleDescription(activeModule)}
        </p>
      </div>

      {/* 大屏：左侧分组导航 */}
      <nav
        className="hidden lg:flex lg:w-[13.5rem] lg:shrink-0 lg:flex-col lg:gap-0"
        aria-label="配置模块"
      >
        <div className="sticky top-4 flex max-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-neutral-200/90 bg-white shadow-sm ring-1 ring-black/[0.02]">
          <div className="shrink-0 border-b border-neutral-100 px-3 py-2.5">
            <p className="text-xs font-semibold text-neutral-800">配置模块</p>
            <p className="mt-0.5 text-[11px] leading-snug text-neutral-500">按业务域分组，点击切换</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 py-2">
            <NavGroupList groups={groups} activeModule={activeModule} onChange={onChange} />
          </div>
          <div className="shrink-0 border-t border-neutral-100 bg-neutral-50/80 px-3 py-2.5">
            <p className="text-[11px] font-medium text-neutral-700">{activeLabel}</p>
            <p className="mt-1 text-[11px] leading-snug text-neutral-500">{moduleDescription(activeModule)}</p>
          </div>
        </div>
      </nav>
    </>
  );
}
