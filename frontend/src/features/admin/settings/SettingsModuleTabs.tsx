import { cn } from "@/lib/utils";
import { moduleDescription } from "@/features/admin/settings/settingsLabels";

type ModuleItem = { key: string; label: string };

type SettingsModuleTabsProps = {
  modules: ModuleItem[];
  activeModule: string;
  onChange: (key: string) => void;
};

export function SettingsModuleTabs({ modules, activeModule, onChange }: SettingsModuleTabsProps) {
  const activeLabel = modules.find((m) => m.key === activeModule)?.label || activeModule;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {modules.map((item) => {
          const active = activeModule === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => onChange(item.key)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-sm font-medium transition",
                active
                  ? "border-[#0070f3] bg-[#0070f3] text-white shadow-sm"
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 hover:bg-neutral-50",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      <p className="text-sm leading-relaxed text-neutral-600">
        <span className="font-medium text-neutral-800">{activeLabel}</span>
        <span className="mx-1.5 text-neutral-300">·</span>
        {moduleDescription(activeModule)}
      </p>
    </div>
  );
}
