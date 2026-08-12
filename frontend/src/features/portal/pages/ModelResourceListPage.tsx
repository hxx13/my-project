import { useState, useEffect, useRef } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { usePublicContents, usePublicCategories } from "@/api/hooks/usePortalContent";
import type { PortalContentView } from "@/api/domains/portalContent.api";

const DEFAULT_ICONS = ["🧬", "🐁", "🧪", "🔬", "🐭", "📋", "🔍", "💊"];
const CAT_COLORS: string[] = [
  "linear-gradient(135deg, #fef3c7, #fcd34d)",
  "linear-gradient(135deg, #d1fae5, #6ee7b7)",
  "linear-gradient(135deg, #ede9fe, #c4b5fd)",
  "linear-gradient(135deg, #ffedd5, #fdba74)",
  "linear-gradient(135deg, #fce7f3, #f9a8d4)",
  "linear-gradient(135deg, #e0f2fe, #bae6fd)",
  "linear-gradient(135deg, #fef9ee, #fde68a)",
  "linear-gradient(135deg, #f0fdf4, #bbf7d0)",
];
const getIcon = (name: string, idx: number) => DEFAULT_ICONS[idx % DEFAULT_ICONS.length];
const getColor = (idx: number) => CAT_COLORS[idx % CAT_COLORS.length];
const hashIdx = (s: string) => [...s].reduce((a, c) => a + c.charCodeAt(0), 0);

export default function ModelResourceListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("search") || "";
  const [searchInput, setSearchInput] = useState(query);
  const [activeCat, setActiveCat] = useState("全部品系");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<PortalContentView[]>([]);
  const loaderRef = useRef<HTMLDivElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [showTopBtn, setShowTopBtn] = useState(false);

  const { data: categories = [] } = usePublicCategories("MODEL_RESOURCE");
  // 从 URL 参数自动定位分类
  useEffect(() => {
    if (query) {
      const match = categories.find((c) => c.name === query);
      if (match) setActiveCat(match.name);
    }
  }, [query, categories]);
  const { data: pageData, isFetching } = usePublicContents({
    type: "MODEL_RESOURCE",
    search: query || undefined,
    page,
    size: 12,
  });

  // 累加无限滚动数据
  useEffect(() => {
    if (!pageData) return;
    if (page === 1) {
      setAllItems(pageData.data);
    } else {
      setAllItems((prev) => [...prev, ...pageData.data]);
    }
  }, [pageData, page]);

  // 搜索
  const doSearch = () => {
    setPage(1);
    setAllItems([]);
    setSearchParams(searchInput ? { search: searchInput } : {});
  };

  // 切换分类（简化：全部分类时不过滤，点具体分类时用搜索模拟）
  const selectCat = (cat: string) => {
    setActiveCat(cat);
    setPage(1);
    setAllItems([]);
    if (cat === "全部品系") {
      setSearchParams(query ? { search: query } : {});
    } else {
      setSearchParams({ search: cat });
    }
  };

  // 无限滚动 IntersectionObserver
  useEffect(() => {
    const el = loaderRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetching && pageData && allItems.length < pageData.total) {
          setPage((p) => p + 1);
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [isFetching, pageData, allItems.length]);

  // 回到顶部按钮
  useEffect(() => {
    const el = contentScrollRef.current;
    if (!el) return;
    const onScroll = () => setShowTopBtn(el.scrollTop > 400);
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => contentScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" });

  const total = pageData?.total ?? 0;
  const catList = [{ name: "全部品系" }, ...categories.map((c) => ({ name: c.name }))];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh", background: "#f7f5f2" }}>
      {/* Hero 搜索区 */}
      <div style={{ background: "linear-gradient(135deg, #1e293b, #0f172a)", padding: "56px 48px 44px", textAlign: "center", color: "white", flexShrink: 0 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>模型资源数据库</h1>
        <p style={{ fontSize: 14, color: "rgba(255,255,255,0.4)", maxWidth: 520, margin: "0 auto 18px" }}>
          涵盖基因编辑、免疫缺陷、人源化、疾病模型等多品系实验动物模型，支撑生命科学研究与药物开发
        </p>
        <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", borderRadius: 14, overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,0.3)" }}>
          <input
            style={{ flex: 1, border: "none", outline: "none", padding: "14px 20px", fontSize: 14, color: "#1a1a1a" }}
            placeholder="搜索品系名称、基因修饰、品系编号…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
          <button onClick={doSearch} style={{ border: "none", background: "#d97706", color: "white", padding: "14px 26px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            搜索
          </button>
        </div>
        {query && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginTop: 8 }}>
            从门户首页搜索转入 · 当前搜索词：<strong>{query}</strong>
          </div>
        )}
      </div>

      {/* 主体 */}
      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", padding: "0 48px 80px", display: "flex", gap: 56, alignItems: "flex-start", flex: 1 }}>
        {/* 左侧分类目录 sticky */}
        <aside style={{ width: 220, flexShrink: 0, position: "sticky", top: 84, paddingTop: 36 }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "#8b7355", marginBottom: 10, paddingLeft: 4 }}>
            品系分类
          </div>
          {catList.map((cat, i) => (
            <div
              key={cat.name}
              onClick={() => selectCat(cat.name)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10,
                cursor: "pointer", fontSize: 13, color: activeCat === cat.name ? "#92400e" : "#5c4d3c",
                background: activeCat === cat.name ? "#fef3c7" : "transparent",
                fontWeight: activeCat === cat.name ? 600 : 400,
                marginBottom: 2, transition: "all .15s",
              }}
            >
              <span style={{ width: 30, height: 30, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, background: activeCat === cat.name ? "#fef3c7" : "#f0ece6" }}>
                {getIcon(cat.name, i)}
              </span>
              <span style={{ flex: 1 }}>{cat.name}</span>
            </div>
          ))}
        </aside>

        {/* 右侧内容区 */}
        <div style={{ flex: 1, minWidth: 0, paddingTop: 36 }}>
          <div style={{ marginBottom: 16, display: "flex", alignItems: "flex-end", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: "#b0a89a", marginBottom: 4 }}>模型资源 / {activeCat}</div>
              <h2 style={{ fontSize: 20, fontWeight: 800 }}>
                {activeCat} <span style={{ fontSize: 13, fontWeight: 500, color: "#b0a89a" }}>共 {total} 个品系</span>
              </h2>
            </div>
            <div style={{ display: "flex", border: "1px solid #d4c9b8", borderRadius: 8, overflow: "hidden" }}>
              <button onClick={() => setViewMode("grid")} style={{ padding: "7px 14px", border: "none", background: viewMode === "grid" ? "#1e293b" : "white", color: viewMode === "grid" ? "white" : "#8b7355", cursor: "pointer", fontSize: 12 }}>
                ▦ 宫格
              </button>
              <button onClick={() => setViewMode("list")} style={{ padding: "7px 14px", border: "none", borderLeft: "1px solid #d4c9b8", background: viewMode === "list" ? "#1e293b" : "white", color: viewMode === "list" ? "white" : "#8b7355", cursor: "pointer", fontSize: 12 }}>
                ☰ 列表
              </button>
            </div>
          </div>

          {query && (
            <div style={{ background: "#fef9ee", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 16px", marginBottom: 18, fontSize: 13, color: "#92400e", display: "flex", alignItems: "center", gap: 8 }}>
              🔍 搜索 <strong>"{query}"</strong> 找到 {total} 个匹配品系
              <span onClick={() => { setSearchInput(""); setSearchParams({}); setPage(1); setAllItems([]); }} style={{ marginLeft: "auto", fontSize: 11, color: "#b45309", cursor: "pointer", textDecoration: "underline" }}>
                清除搜索
              </span>
            </div>
          )}

          <div ref={contentScrollRef} className="model-list-scroll" style={{ overflowY: "auto", maxHeight: "calc(100vh - 260px)", scrollbarWidth: "thin", scrollbarColor: "#d4c9b8 transparent" }}>
            {viewMode === "grid" ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(270px, 1fr))", gap: 18 }}>
                {allItems.map((item) => (
                  <Link key={item.id} to={`/models/${item.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div style={{
                      background: "white", borderRadius: 16, overflow: "hidden", border: "1px solid #e8e4df",
                      transition: "all .2s", boxShadow: "0 1px 3px rgba(0,0,0,0.03)", cursor: "pointer",
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-4px)"; e.currentTarget.style.boxShadow = "0 16px 36px rgba(0,0,0,0.1)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
                    >
                      <div style={{
                        height: 150, display: "flex", alignItems: "center", justifyContent: "center",
                        background: getColor(hashIdx(item.categoryName || "")) || "linear-gradient(135deg, #fef3c7, #fcd34d)",
                        fontSize: 48,
                      }}>
                        {getIcon(item.categoryName || "", hashIdx(item.categoryName || "")) || "🧬"}
                      </div>
                      <div style={{ padding: "14px 16px 16px" }}>
                        <div style={{ fontSize: 10, color: "#b0a89a", fontFamily: "monospace", marginBottom: 4 }}>{item.extensionJson ? (item.extensionJson as Record<string,unknown>).strainId as string || `SHSMU-M-${String(item.id).padStart(5, "0")}` : `SHSMU-M-${String(item.id).padStart(5, "0")}`}</div>
                        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6, lineHeight: 1.3 }}>{item.title}</h3>
                        <div style={{ fontSize: 11, color: "#8b7355", marginBottom: 8 }}>
                          {item.categoryName && <span style={{ background: "#faf7f2", padding: "2px 8px", borderRadius: 4 }}>{item.categoryName}</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "#666", lineHeight: 1.5, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", marginBottom: 12 }}>
                          {item.summary || "暂无简介"}
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "6px 14px", borderRadius: 8, background: "#d97706", color: "white" }}>查看资料片</span>
                          <span style={{ fontSize: 11, color: "#8b7355", marginLeft: "auto" }}>百科 →</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {allItems.map((item) => (
                  <Link key={item.id} to={`/models/${item.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                    <div style={{
                      background: "white", borderRadius: 14, border: "1px solid #e8e4df", padding: "14px 18px",
                      display: "flex", alignItems: "center", gap: 16, transition: "all .2s", cursor: "pointer",
                    }}>
                      <div style={{ width: 80, height: 56, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, background: getColor(hashIdx(item.categoryName || "")) || "linear-gradient(135deg, #fef3c7, #fcd34d)" }}>
                        {getIcon(item.categoryName || "", hashIdx(item.categoryName || "")) || "🧬"}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
                          <span style={{ fontSize: 10, color: "#b0a89a", fontFamily: "monospace" }}>SHSMU-M-{String(item.id).padStart(5, "0")}</span>
                        </div>
                        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>{item.title}</h3>
                        <div style={{ fontSize: 11, color: "#8b7355", display: "flex", gap: 4 }}>
                          {item.categoryName && <span style={{ background: "#faf7f2", padding: "1px 8px", borderRadius: 4 }}>{item.categoryName}</span>}
                        </div>
                        <div style={{ fontSize: 12, color: "#666", overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                          {item.summary || "暂无简介"}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "6px 14px", borderRadius: 8, background: "#d97706", color: "white", whiteSpace: "nowrap" }}>查看资料片</span>
                        <span style={{ fontSize: 11, color: "#8b7355", whiteSpace: "nowrap" }}>百科 →</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* 无限滚动加载器 */}
            <div ref={loaderRef} style={{ textAlign: "center", padding: "32px 0", color: "#b0a89a", fontSize: 13 }}>
              {isFetching ? (
                <><span style={{ display: "inline-block", width: 22, height: 22, border: "2px solid #e8e4df", borderTopColor: "#d97706", borderRadius: "50%", animation: "spin 0.7s linear infinite", verticalAlign: "middle", marginRight: 8 }} />加载更多品系…</>
              ) : allItems.length >= total ? (
                "已加载全部品系"
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* 回到顶部 */}
      {showTopBtn && (
        <button onClick={scrollToTop} style={{ position: "fixed", bottom: 40, right: 48, width: 44, height: 44, borderRadius: "50%", background: "#1e293b", color: "white", border: "none", cursor: "pointer", fontSize: 18, boxShadow: "0 4px 20px rgba(0,0,0,0.15)", zIndex: 50 }}>
          ↑
        </button>
      )}

      <div style={{ textAlign: "center", padding: "48px", fontSize: 12, color: "#c4bdb2" }}>
        实验动物科学部 · 上海交通大学医学院 | 品系信息持续更新中
      </div>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .model-list-scroll::-webkit-scrollbar { width: 5px; }
        .model-list-scroll::-webkit-scrollbar-track { background: transparent; }
        .model-list-scroll::-webkit-scrollbar-thumb { background: #d4c9b8; border-radius: 3px; }
        .model-list-scroll::-webkit-scrollbar-thumb:hover { background: #b0a090; }
      `}</style>
    </div>
  );
}
