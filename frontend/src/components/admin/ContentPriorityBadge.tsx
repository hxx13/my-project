import { NOTICE_PRIORITY_CONFIG, noticePriorityOf } from "@/features/portal/noticePriority";
import { cn } from "@/lib/utils";

/**
 * 门户内容优先级徽标（重要 / 通知 / 常规）。
 *
 * 配置取自 `features/portal/noticePriority` —— 与门户前台（首页 / 列表 / 详情）**同源**，
 * 所以后台看到的就是用户会看到的那一套，不会出现「后台标红、前台显示常规」。
 *
 * 只有通知公告带优先级；其它类型调用方自行按 contentType 决定是否渲染。
 */
export function ContentPriorityBadge({
  item,
  className,
}: {
  item: { extensionJson?: unknown };
  className?: string;
}) {
  const cfg = NOTICE_PRIORITY_CONFIG[noticePriorityOf(item)];
  const Icon = cfg.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold",
        cfg.badgeClass,
        className
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {cfg.badge}
    </span>
  );
}
