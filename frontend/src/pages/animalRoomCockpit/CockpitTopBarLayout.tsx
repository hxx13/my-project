import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 动物房驾驶舱顶栏首行 — 布局约定（换页/加控件时只填三个插槽即可，勿手写 flex 拼位置）：
 *
 * 1. **brand**：校徽 + 标题；`max-w` 限制避免挤没中区；可 `shrink`。
 * 2. **middle**：分区勾选、摘要等；`flex-1 min-w-0` + 横向滚动，窄屏不顶破右区。
 * 3. **actions**：时间、刷新、返回等；`shrink-0` + 左边线，始终贴右。
 *
 * 栅格：`[ brand | 竖线 | middle 自适应 | actions ]` 单行 `flex-nowrap`；中区内容多时在区内横滑。
 */
export const COCKPIT_TOP_BAR_OUTER = "w-full min-w-0 overflow-x-auto px-2 py-1.5 sm:px-3";

export const COCKPIT_TOP_BAR_ROW = "flex w-full min-w-0 flex-nowrap items-center gap-1.5 sm:gap-2";

export const COCKPIT_TOP_BAR_BRAND_ZONE =
  "flex min-w-0 max-w-[min(42%,14rem)] shrink items-center gap-2 sm:max-w-[min(38%,16rem)] sm:gap-2.5";

export const COCKPIT_TOP_BAR_DIVIDER = "mx-0.5 hidden h-7 w-px shrink-0 bg-cyan-500/15 sm:block";

export const COCKPIT_TOP_BAR_MIDDLE_ZONE =
  "flex min-h-0 min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export const COCKPIT_TOP_BAR_ACTIONS_ZONE =
  "flex shrink-0 items-center gap-1 border-l border-cyan-500/15 pl-1.5 sm:gap-1.5 sm:pl-2";

export type CockpitTopBarFirstRowProps = {
  brand: ReactNode;
  middle: ReactNode;
  actions: ReactNode;
  className?: string;
};

/** 驾驶舱顶栏首行：三区 + 竖线，自适应宽度与滚动行为已封装 */
export function CockpitTopBarFirstRow({ brand, middle, actions, className }: CockpitTopBarFirstRowProps) {
  return (
    <div className={cn(COCKPIT_TOP_BAR_OUTER, className)}>
      <div className={COCKPIT_TOP_BAR_ROW}>
        <div className={COCKPIT_TOP_BAR_BRAND_ZONE}>{brand}</div>
        <div className={COCKPIT_TOP_BAR_DIVIDER} aria-hidden />
        <div className={COCKPIT_TOP_BAR_MIDDLE_ZONE}>{middle}</div>
        <div className={COCKPIT_TOP_BAR_ACTIONS_ZONE}>{actions}</div>
      </div>
    </div>
  );
}
