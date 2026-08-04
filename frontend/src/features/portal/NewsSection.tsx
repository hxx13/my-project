import { useState } from "react";
import { cn } from "@/lib/utils";

const TABS = ["文章干货", "通知公告", "平台更新"] as const;

const MOCK_ARTICLES = [
  { title: "SLC6A19靶点与人源化小鼠模型：PKU及代谢研究", date: "2026-07-29" },
  { title: "huIL4/huIL4RA双人源化小鼠突破IL-4Rα靶向药物评价瓶颈", date: "2026-07-29" },
  { title: "新药研发痛点：ADC、TCE的PK/PD到底难在哪？", date: "2026-07-29" },
  { title: "hSCN10A(Nav1.8)(SD)大鼠：Nav1.8抑制剂临床前药效评价", date: "2026-07-28" },
  { title: "Nat Commun: 哈尔滨医科大学团队揭示心力衰竭的驱动因素Bclaf1", date: "2026-07-20" },
];

export function NewsSection() {
  const [activeTab, setActiveTab] = useState<string>(TABS[0]);
  const featured = MOCK_ARTICLES[0];
  const list = MOCK_ARTICLES.slice(1);

  return (
    <section id="news" className="py-20 px-6 bg-[var(--app-color-surface-container)]">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-[var(--app-color-text-primary)]">新闻动态</h2>
          <p className="mt-3 text-[var(--app-color-text-secondary)]">平台最新资讯与研究进展</p>
        </div>

        <div className="flex justify-center gap-2 mb-10">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 py-2 rounded-full text-sm font-medium transition-colors",
                activeTab === tab
                  ? "bg-[var(--app-color-accent-secondary)] text-white"
                  : "text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)]",
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] overflow-hidden">
            <div className="h-48 bg-gradient-to-br from-[var(--app-color-accent-secondary)]/20 to-[var(--app-color-surface-container)] flex items-center justify-center text-[var(--app-color-text-tertiary)] text-sm">
              头图占位
            </div>
            <div className="p-5">
              <h3 className="text-lg font-semibold text-[var(--app-color-text-primary)]">{featured.title}</h3>
              <p className="mt-2 text-xs text-[var(--app-color-text-tertiary)]">{featured.date}</p>
            </div>
          </div>

          <div className="space-y-3">
            {list.map((article, i) => (
              <div
                key={i}
                className="p-4 rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-page)] hover:shadow-[var(--app-elevation-card)] transition-shadow cursor-pointer"
              >
                <h4 className="text-sm font-medium text-[var(--app-color-text-primary)] line-clamp-2">{article.title}</h4>
                <p className="mt-1 text-xs text-[var(--app-color-text-tertiary)]">{article.date}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
