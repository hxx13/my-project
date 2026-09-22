/** 门户公告优先级（存在 portal_content.extension_json.priority 里）
 *  重要 → 列表置顶 + 红色角标；通知 → 绿色角标；常规 → 灰色角标。
 *  排序口径见 PortalContentMapper.listPublic 的 sort='priority'。 */
import { AlertTriangle, Bell, FileText } from "lucide-react";

export type NoticePriority = "important" | "notice" | "routine";

export const NOTICE_PRIORITY_CONFIG: Record<NoticePriority, {
  badge: string;
  badgeClass: string;
  iconBg: string;
  iconColor: string;
  icon: typeof AlertTriangle;
}> = {
  important: { badge: "重要", badgeClass: "bg-red-50 text-red-600", iconBg: "bg-red-50", iconColor: "text-red-500", icon: AlertTriangle },
  notice: { badge: "通知", badgeClass: "bg-emerald-50 text-emerald-600", iconBg: "bg-emerald-50", iconColor: "text-emerald-500", icon: Bell },
  routine: { badge: "常规", badgeClass: "bg-neutral-100 text-neutral-500", iconBg: "bg-neutral-100", iconColor: "text-neutral-400", icon: FileText },
};

/**
 * 门户内容的 extensionJson **后端是按字符串下发的**（管理员接口也一样）。
 * 老代码直接 `item.extensionJson.priority` → 恒 undefined → 所有公告都掉进「常规」档，
 * 这就是「优先级完全失效」的根因。凡是读扩展字段都先过这里。
 */
export function portalExtension(item: { extensionJson?: unknown }): Record<string, unknown> {
  const raw = item.extensionJson;
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** 读不出/写了别的值一律当常规 */
export function noticePriorityOf(item: { extensionJson?: unknown }): NoticePriority {
  const raw = portalExtension(item).priority;
  return raw === "important" || raw === "notice" ? raw : "routine";
}
