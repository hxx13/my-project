import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type FmTabItem = { id: string; label: string };

type Props = {
  tabs: FmTabItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
  /** 对应 AdminTabPanel 的 id 前缀，用于 aria-controls 关联 */
  panelIdPrefix?: string;
  /** 该 tab 自己的功能按钮等；为空时不渲染分隔线 */
  children?: ReactNode;
  className?: string;
};

/** 页面工具栏：tab 组 + 当前 tab 的功能按钮，同一行（白底色带） */
export function FmToolbar({ tabs, activeTab, onTabChange, panelIdPrefix = "fm-panel", children, className }: Props) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-3 py-2",
        className
      )}
    >
      <div className="review-tabs shrink-0" role="tablist" aria-label="页面分区">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-controls={`${panelIdPrefix}-${t.id}`}
            aria-selected={activeTab === t.id}
            tabIndex={activeTab === t.id ? 0 : -1}
            className="review-tab"
            data-active={activeTab === t.id}
            onClick={() => onTabChange(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {children ? (
        <>
          <div className="mx-1 h-4 w-px shrink-0 bg-[var(--app-color-border-default)]" />
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{children}</div>
        </>
      ) : null}
    </div>
  );
}
