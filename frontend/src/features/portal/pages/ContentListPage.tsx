import { Link } from "react-router-dom";
import { ArrowRight, AlertTriangle, Bell, FileText, Pin, Megaphone } from "lucide-react";
import { usePublicContents } from "@/api/hooks/usePortalContent";
import type { PortalContentView } from "@/api/domains/portalContent.api";

const PRIORITY_ICONS: Record<string, typeof AlertTriangle> = {
  important: AlertTriangle,
  notice: Bell,
  routine: FileText,
};

export default function ContentListPage() {
  const { data: articles } = usePublicContents({ type: "NEWS", size: 5, sort: "published" });
  const { data: notices } = usePublicContents({ type: "NOTICE", size: 5, sort: "published" });

  const articleList = articles?.data ?? [];
  const noticeList = notices?.data ?? [];
  const featured = articleList[0];
  const sideArticles = articleList.slice(1, 5);

  return (
    <div className="min-h-screen">
      {/* ═══════════ 科研文章区 ═══════════ */}
      <section className="bg-[#fafaf9] py-12 md:py-16">
        <div className="max-w-[1200px] mx-auto px-5 md:px-12">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-[11px] font-bold px-4 py-1.5 rounded-full bg-amber-50 text-amber-700 tracking-wider">文章干货</span>
            <div className="flex-1 h-px bg-neutral-200" />
          </div>
          <h2 className="text-xl md:text-2xl font-extrabold text-neutral-900 mb-1">科研文章</h2>
          <p className="text-sm text-neutral-400 mb-8">技术分享、文献解读、新品发布 — 来自实验动物科学部的学术内容</p>

          {articleList.length === 0 ? (
            <p className="text-neutral-400 text-sm py-8 text-center">暂无文章</p>
          ) : (
            <div className="flex flex-col lg:flex-row gap-5">
              {/* 头条 */}
              {featured && (
                <Link to={`/news/article/${featured.id}`} className="flex-1 bg-white rounded-2xl overflow-hidden border border-neutral-200 shadow-sm hover:shadow-md transition-shadow group text-left no-underline">
                  <div className="h-52 md:h-64 bg-gradient-to-br from-amber-50 via-white to-amber-100/50 flex items-center justify-center">
                    <span className="text-6xl opacity-20">📰</span>
                  </div>
                  <div className="p-6">
                    <div className="text-[11px] text-neutral-400 mb-2">{featured.publishedAt?.split("T")[0] || ""}</div>
                    <h3 className="text-lg font-bold text-neutral-900 leading-snug group-hover:text-amber-600 transition-colors">{featured.title}</h3>
                    <p className="mt-3 text-sm text-neutral-500 line-clamp-2">{featured.summary || "点击查看详情"}</p>
                    <span className="inline-block mt-4 text-[12px] font-semibold text-amber-600">阅读全文 →</span>
                  </div>
                </Link>
              )}

              {/* 侧栏 */}
              <div className="w-full lg:w-[300px] flex-shrink-0 flex flex-col gap-3">
                {sideArticles.map((item) => (
                  <Link key={item.id} to={`/news/article/${item.id}`} className="bg-white rounded-xl border border-neutral-200 p-4 hover:shadow-sm hover:border-amber-200 transition-all group/item text-left no-underline">
                    <div className="text-[10px] text-neutral-400 mb-1">{item.publishedAt?.split("T")[0] || ""}</div>
                    <h4 className="text-[13px] font-bold text-neutral-800 leading-snug line-clamp-2 group-hover/item:text-amber-600 transition-colors">{item.title}</h4>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ═══════════ 通知公告区 ═══════════ */}
      <section className="bg-[#f7f5f2] py-12 md:py-16">
        <div className="max-w-[1200px] mx-auto px-5 md:px-12">
          <div className="flex items-center gap-3 mb-6">
            <span className="text-[11px] font-bold px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-700 tracking-wider">通知公告</span>
            <div className="flex-1 h-px bg-neutral-200" />
          </div>
          <h2 className="text-xl md:text-2xl font-extrabold text-neutral-900 mb-1">通知公告</h2>
          <p className="text-sm text-neutral-400 mb-8">平台运营、管理通知 — 部门信息发布</p>

          {noticeList.length === 0 ? (
            <p className="text-neutral-400 text-sm py-8 text-center">暂无公告</p>
          ) : (
            <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
              <div className="flex-1 flex flex-col">
                {noticeList.map((item, i) => {
                  const ext = (item.extensionJson as Record<string, unknown>) || {};
                  const priority = (ext.priority as string) || "routine";
                  const Icon = PRIORITY_ICONS[priority] || FileText;
                  const badgeColors: Record<string, string> = {
                    important: "bg-red-50 text-red-600",
                    notice: "bg-emerald-50 text-emerald-600",
                    routine: "bg-neutral-100 text-neutral-500",
                  };
                  const iconBgs: Record<string, string> = {
                    important: "bg-red-50",
                    notice: "bg-emerald-50",
                    routine: "bg-neutral-100",
                  };
                  const iconColors: Record<string, string> = {
                    important: "text-red-500",
                    notice: "text-emerald-500",
                    routine: "text-neutral-400",
                  };
                  const labels: Record<string, string> = {
                    important: "重要",
                    notice: "通知",
                    routine: "常规",
                  };
                  return (
                    <Link key={item.id} to={`/news/notice/${item.id}`}
                      className={`flex items-start gap-4 py-3.5 border-b border-neutral-200 hover:pl-1.5 transition-all group/item text-left no-underline ${i === noticeList.length - 1 ? "border-b-0" : ""}`}>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBgs[priority]}`}>
                        <Icon className={`size-4 ${iconColors[priority]}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2.5 mb-1">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeColors[priority]}`}>{labels[priority]}</span>
                        </div>
                        <h4 className="text-sm font-bold text-neutral-900 group-hover/item:text-amber-600 transition-colors">{item.title}</h4>
                        <p className="text-xs text-neutral-400 line-clamp-1 mt-0.5">{item.summary || ""}</p>
                      </div>
                      <span className="text-[11px] text-neutral-400 whitespace-nowrap pt-3">{item.publishedAt?.split("T")[0] || ""}</span>
                    </Link>
                  );
                })}
              </div>

              {/* 置顶侧栏 */}
              <div className="w-full lg:w-[260px] flex-shrink-0 flex flex-col gap-3">
                {noticeList.slice(0, 3).map((item, i) => {
                  const ext = (item.extensionJson as Record<string, unknown>) || {};
                  const pinned = ext.pinned as boolean;
                  if (!pinned && i !== 0) return null;
                  return (
                    <div key={item.id} className={`bg-white border rounded-xl p-4 shadow-sm ${i === 0 ? "border-amber-200 bg-amber-50/30" : "border-neutral-200"}`}>
                      <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-2 ${i === 0 ? "text-amber-700" : "text-red-500"}`}>
                        <Pin className="size-3" />
                        {i === 0 ? "最新公告" : "通知"}
                      </div>
                      <h4 className="text-[13px] font-bold text-neutral-900 leading-snug">{item.title}</h4>
                      <div className="text-[10px] text-neutral-400 mt-1">{item.publishedAt?.split("T")[0] || ""}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="mt-8 text-center">
            <Link to="/news" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-amber-600 hover:underline">
              查看全部公告 <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
