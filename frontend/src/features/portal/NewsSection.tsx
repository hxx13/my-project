import { useState } from "react";
import { cn } from "@/lib/utils";
import { Calendar, ArrowRight } from "lucide-react";
import { StaggerCards } from "@/components/scroll-reveal";

const TABS = ["文章干货", "通知公告", "平台更新"] as const;

const MOCK_ARTICLES = [
  { title: "SLC6A19靶点与人源化小鼠模型：PKU及代谢疾病研究新进展", date: "2026-07-29", tag: "技术分享" },
  { title: "huIL4/huIL4RA双人源化小鼠突破IL-4Rα靶向药物评价瓶颈", date: "2026-07-29", tag: "新品发布" },
  { title: "新药研发痛点：ADC、TCE的PK/PD到底难在哪？", date: "2026-07-29", tag: "技术分享" },
  { title: "hSCN10A(Nav1.8)(SD)大鼠：Nav1.8抑制剂临床前药效评价", date: "2026-07-28", tag: "模型推荐" },
  { title: "Nat Commun: 哈尔滨医科大学团队揭示心力衰竭的驱动因素Bclaf1", date: "2026-07-20", tag: "文献解读" },
];

export function NewsSection() {
  const [activeTab, setActiveTab] = useState<string>(TABS[0]);
  const featured = MOCK_ARTICLES[0];
  const list = MOCK_ARTICLES.slice(1);

  return (
    <section id="news" className="min-h-screen flex items-center py-24 px-6 bg-neutral-50">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs font-semibold tracking-[0.2em] text-amber-600 uppercase mb-3">News & Updates</p>
          <h2 className="text-3xl font-bold text-neutral-900">新闻动态</h2>
          <p className="mt-4 text-[15px] text-neutral-600">平台最新资讯与研究进展</p>
        </div>

        {/* Tab pills */}
        <div className="flex justify-center gap-2 mb-10">
          {TABS.map((tab) => (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)}
              className={cn("px-5 py-2 rounded-full text-sm font-medium transition-all",
                activeTab === tab
                  ? "bg-amber-600 text-white shadow-sm"
                  : "text-neutral-600 hover:bg-neutral-100")}>
              {tab}
            </button>
          ))}
        </div>

        <StaggerCards className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Featured */}
          <div className="lg:col-span-2 rounded-2xl border border-neutral-200 bg-white overflow-hidden group hover:shadow-md transition-shadow">
            <div className="h-52 bg-gradient-to-br from-amber-50 via-white to-amber-100/50 flex items-center justify-center">
              <div className="text-center">
                <div className="text-5xl mb-3 opacity-15">📰</div>
                <span className="text-xs font-medium text-neutral-400 tracking-[0.15em] uppercase">Featured Article</span>
              </div>
            </div>
            <div className="p-6">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">{featured.tag}</span>
                <span className="text-[11px] text-neutral-400 flex items-center gap-1"><Calendar className="size-3" />{featured.date}</span>
              </div>
              <h3 className="text-lg font-semibold text-neutral-900 leading-snug group-hover:text-amber-600 transition-colors">{featured.title}</h3>
              <p className="mt-3 text-sm text-neutral-500 line-clamp-2">点击查看完整文章内容，了解最新研究进展与技术分享。</p>
            </div>
          </div>

          {/* Side list */}
          <StaggerCards className="space-y-3">
            {list.map((article, i) => (
              <div key={i}
                className="p-4 rounded-2xl border border-neutral-200 bg-white hover:shadow-sm hover:border-amber-200 transition-all cursor-pointer group/item">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500 font-medium">{article.tag}</span>
                  <span className="text-[10px] text-neutral-400">{article.date}</span>
                </div>
                <h4 className="text-sm font-medium text-neutral-800 leading-snug line-clamp-2 group-hover/item:text-amber-600 transition-colors">{article.title}</h4>
              </div>
            ))}
            <div className="pt-2">
              <a href="#" className="inline-flex items-center gap-1.5 text-[13px] font-medium text-amber-600 hover:underline">
                查看更多 <ArrowRight className="size-3.5" />
              </a>
            </div>
          </StaggerCards>
        </StaggerCards>
      </div>
    </section>
  );
}
