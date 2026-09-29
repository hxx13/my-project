import { Link } from "react-router-dom";
import { BookOpen, FileText, HelpCircle, Phone } from "lucide-react";
import { useAdminContents } from "@/api/hooks/usePortalContent";
import { portalExtension } from "@/features/portal/noticePriority";
import { dateOnly } from "@/utils/beijingTime";
import type { PortalContentView } from "@/api/domains/portalContent.api";

const PAGE_TYPES = [
  { key: "about", title: "关于我们", desc: "部门简介、平台实力、统计数字、内容分段", icon: FileText },
  { key: "faq", title: "常见问题", desc: "问答条目管理，前端手风琴展示", icon: HelpCircle },
  { key: "contact", title: "联系我们", desc: "地址、电话、邮箱、办公时间等联系方式", icon: Phone },
  { key: "service_guide", title: "服务指南", desc: "使用流程与收费标准（通用编辑器）", icon: BookOpen },
] as const;

/** PAGE 类型记录的 page_key 存在 extension_json 里；缺省时用 id 兜底老数据 */
function pageKeyOf(row: PortalContentView): string | null {
  const ext = portalExtension(row);
  const key = ext.page_key;
  return typeof key === "string" ? key : null;
}

export default function PageManagementPage() {
  // 一次拿到全部 PAGE 记录，用来标出每页当前是发布中还是草稿，省掉逐页查询
  const { data } = useAdminContents({ type: "PAGE", size: 50 });
  const byKey = new Map<string, PortalContentView>();
  for (const row of data?.data ?? []) {
    const key = pageKeyOf(row);
    if (!key) continue;
    const prev = byKey.get(key);
    // 同一 page_key 有多条时，优先取已发布的那条，否则取更新的
    if (!prev) byKey.set(key, row);
    else if (prev.status !== "PUBLISHED" && row.status === "PUBLISHED") byKey.set(key, row);
    else if (prev.status === row.status && (row.updatedAt || "") > (prev.updatedAt || "")) byKey.set(key, row);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
      <div className="shrink-0">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--app-color-text-primary)]">页面管理</h1>
        <p className="mt-0.5 text-xs text-[var(--app-color-text-tertiary)]">
          选择要编辑的页面，进入对应编辑器。保存后需要选一个版本发布，门户才会更新。
        </p>
      </div>

      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PAGE_TYPES.map((pt) => {
          const Icon = pt.icon;
          const row = byKey.get(pt.key);
          const href = `/content-manager/pages/${pt.key}`;
          return (
            <Link
              key={pt.key}
              to={href}
              state={{ returnTo: "/content-manager/pages", returnLabel: "返回页面管理" }}
              className="flex flex-col gap-3 rounded-xl border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-4 transition-[border-color,box-shadow] hover:border-[var(--app-color-border-strong)] hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--app-color-surface-hover)]">
                  <Icon className="h-5 w-5 text-[var(--app-color-text-secondary)]" aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-[var(--app-color-text-primary)]">{pt.title}</div>
                  <div className="mt-0.5 text-xs leading-relaxed text-[var(--app-color-text-tertiary)]">{pt.desc}</div>
                </div>
              </div>

              <div className="mt-auto flex items-center gap-2 text-[11px]">
                {row ? (
                  <>
                    <span className="review-status" data-tone={row.status === "PUBLISHED" ? "ok" : "none"}>
                      {row.status === "PUBLISHED" ? "发布中" : "草稿"}
                    </span>
                    <span className="text-[var(--app-color-text-tertiary)]">
                      更新于 {dateOnly(row.updatedAt) || "—"}
                    </span>
                  </>
                ) : (
                  <span className="review-status" data-tone="none">
                    未创建
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
