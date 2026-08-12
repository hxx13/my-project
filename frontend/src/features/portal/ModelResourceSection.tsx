import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Beaker, Database, Microscope, Stethoscope, ArrowRight, Search } from "lucide-react";
import { StaggerCards } from "@/components/scroll-reveal";
import { usePublicCategories } from "@/api/hooks/usePortalContent";

const CAT_ICONS = [Microscope, Beaker, Database, Stethoscope];
const CAT_COLORS = ["from-blue-50 to-indigo-50", "from-emerald-50 to-teal-50", "from-violet-50 to-purple-50", "from-amber-50 to-orange-50"];

export function ModelResourceSection() {
  const navigate = useNavigate();
  const { data: allCats = [] } = usePublicCategories("MODEL_RESOURCE");
  const cards = allCats.slice(0, 4).map((c) => ({
    key: c.name, title: c.name, link: `/models?search=${encodeURIComponent(c.name)}`,
  }));
  const placeholders = Array.from({ length: Math.max(0, 4 - cards.length) });

  const [searchFocused, setSearchFocused] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const doSearch = () => {
    if (searchValue.trim()) {
      navigate(`/models?search=${encodeURIComponent(searchValue.trim())}`);
    } else {
      navigate("/models");
    }
  };

  return (
    <section id="model-resource" className="min-h-screen flex items-center py-24 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-14">
          <p className="text-xs font-semibold tracking-[0.2em] text-amber-600 uppercase mb-3">Model Resources</p>
          <h2 className="text-3xl font-bold text-neutral-900">模型资源</h2>
          <p className="mt-4 text-[15px] text-neutral-600 max-w-2xl mx-auto leading-relaxed">
            涵盖基因编辑、免疫缺陷、人源化等多品系实验动物模型，支撑各类生命科学研究与药物开发
          </p>
        </div>

        <StaggerCards className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {cards.map((card, i) => {
            const Icon = CAT_ICONS[i % CAT_ICONS.length];
            const color = CAT_COLORS[i % CAT_COLORS.length];
            return (
              <div key={card.key} onClick={() => navigate(card.link)}
                className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-6 hover:shadow-lg hover:border-amber-200 transition-all duration-200 cursor-pointer">
                <div className={cn("absolute inset-0 bg-gradient-to-br opacity-40 group-hover:opacity-50 transition-opacity", color)} />
                <div className="relative">
                  <div className="size-10 rounded-xl bg-amber-50 flex items-center justify-center mb-4">
                    <Icon className="size-5 text-amber-600" />
                  </div>
                  <h3 className="font-semibold text-neutral-900">{card.title}</h3>
                  <p className="mt-2 text-[13px] text-neutral-500 leading-relaxed">点击浏览该分类下的全部品系</p>
                  <div className="mt-4 flex items-center gap-1.5 text-[13px] font-medium text-amber-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    了解详情 <ArrowRight className="size-3.5" />
                  </div>
                </div>
              </div>
            );
          })}
          {placeholders.map((_, i) => (
            <div key={`ph-${i}`} className="relative overflow-hidden rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-6 flex items-center justify-center min-h-[180px]">
              <p className="text-sm text-neutral-300">暂无分类</p>
            </div>
          ))}
        </StaggerCards>

        {/* Search bar */}
        <div className="mt-12 max-w-xl mx-auto">
          <div
            className={cn(
              "relative group flex items-center gap-3 rounded-2xl border bg-white px-5 py-3.5 transition-all duration-300 cursor-text",
              searchFocused
                ? "border-amber-400 shadow-lg shadow-amber-100/50 ring-4 ring-amber-50"
                : "border-neutral-200 shadow-sm hover:border-neutral-300 hover:shadow-md",
            )}
            onClick={() => searchRef.current?.focus()}
          >
            <div className={cn(
              "size-9 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-300",
              searchFocused ? "bg-amber-100" : "bg-neutral-100",
            )}>
              <Search className={cn(
                "size-4 transition-colors duration-300",
                searchFocused ? "text-amber-600" : "text-neutral-400",
              )} />
            </div>
            <input
              ref={searchRef}
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder="搜索基因编辑模型、免疫缺陷品系…"
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
              className="flex-1 bg-transparent text-[14px] text-neutral-900 placeholder:text-neutral-300 outline-none border-none"
            />
            <button
              type="button"
              onClick={doSearch}
              className={cn(
                "shrink-0 inline-flex items-center gap-1 px-3.5 py-1.5 rounded-lg text-[12px] font-medium transition-all duration-300",
                searchValue.trim()
                  ? "bg-neutral-900 text-white hover:bg-neutral-800"
                  : "bg-neutral-100 text-neutral-400",
              )}
            >
              搜索
            </button>
          </div>
          <div className="flex flex-wrap justify-center gap-1.5 mt-3">
            {allCats.slice(0, 4).map((cat) => (
              <button
                key={cat.name}
                type="button"
                onClick={() => { setSearchValue(cat.name); searchRef.current?.focus(); }}
                className="px-3 py-1 rounded-full text-[11px] font-medium text-neutral-400 bg-neutral-50 hover:bg-amber-50 hover:text-amber-600 transition-colors"
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 text-center">
          <a href="/#/models" className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-600 hover:underline">
            查看全部模型资源 <ArrowRight className="size-3.5" />
          </a>
        </div>
      </div>
    </section>
  );
}
