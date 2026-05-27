import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type AdminPageTabItem = {
  id: string;
  label: string;
  icon?: ReactNode;
};

type Props = {
  tabs: AdminPageTabItem[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
  /** 与 tab 面板关联，用于 aria-controls */
  panelIdPrefix?: string;
};

/**
 * 管理端页面级标签栏（admin-ui-design-system：清晰选中态 + 描边/阴影）
 */
export function AdminPageTabs({ tabs, value, onChange, className, panelIdPrefix = "admin-tab-panel" }: Props) {
  return (
    <div
      role="tablist"
      aria-label="页面分区"
      className={cn("flex flex-wrap gap-1 border-b border-slate-200/90 bg-slate-50/80 px-1 pt-1", className)}
    >
      {tabs.map((tab) => {
        const selected = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${panelIdPrefix}-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            className={cn(
              "inline-flex min-h-[var(--admin-control-height,2.25rem)] items-center gap-2 rounded-t-lg border px-4 py-2 text-sm font-medium transition-all",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[color:var(--admin-focus-ring)]/40",
              selected
                ? "z-[1] -mb-px border-2 border-slate-300 border-b-white bg-white text-slate-900 shadow-sm"
                : "border-2 border-slate-200 bg-white/90 text-slate-600 shadow-sm hover:border-slate-300 hover:bg-white hover:text-slate-900"
            )}
            onClick={() => onChange(tab.id)}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function AdminTabPanel({
  id,
  tabId,
  activeTab,
  children,
  className,
}: {
  id: string;
  tabId: string;
  activeTab: string;
  children: ReactNode;
  className?: string;
}) {
  if (activeTab !== tabId) return null;
  return (
    <div
      id={id}
      role="tabpanel"
      aria-labelledby={`tab-${tabId}`}
      tabIndex={0}
      className={cn("outline-none focus-visible:ring-0", className)}
    >
      {children}
    </div>
  );
}
