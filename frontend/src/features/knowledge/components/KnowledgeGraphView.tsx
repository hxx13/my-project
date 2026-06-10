/**
 * 知识图谱 — 全屏沉浸式力导向图
 *
 * ## 架构约束（AI 开发者必读）
 * 1. 不使用三栏布局——图谱直接占据 Shell 全空间
 * 2. touch-action:none 是 D3 拖拽在 scroll container 内的必须配置
 * 3. SVG 尺寸用 ResizeObserver + 显式 width/height 属性（非 CSS class）
 * 4. viewBox 必须与 width/height 同步
 * 5. 点击节点 → 侧边预览面板（不跳转）；双击 → 跳转到浏览视图
 * 6. 默认只显示手动 wikilink 连线，自动发现连线可切换
 */
import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import { fetchKnowledgeGraph } from "@/api/domains/knowledge.api";
import { useKnowledgePage } from "@/features/knowledge/hooks/useKnowledgePage";
import { X, Eye, ExternalLink, Filter } from "lucide-react";
import type { GraphNode } from "@/features/knowledge/types";

interface Props {
  onSelectPage: (id: number) => void;
  onClose: () => void;
}

const NODE_COLORS = ["#11a8cd", "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6"];

export function KnowledgeGraphView({ onSelectPage, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, any> | null>(null);

  const [dims, setDims] = useState({ w: 900, h: 600 });
  const [graphData, setGraphData] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tip, setTip] = useState<{ node: GraphNode; x: number; y: number } | null>(null);

  // 预览面板
  const [previewId, setPreviewId] = useState<number | null>(null);
  const { data: previewPage } = useKnowledgePage(previewId);
  const [previewOpen, setPreviewOpen] = useState(false);

  // 过滤器
  const [showAuto, setShowAuto] = useState(false); // 默认只显示手动 wikilink
  const [filterOpen, setFilterOpen] = useState(false);

  // ── 尺寸 ──
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) { const { width, height } = e.contentRect; if (width > 0 && height > 0) setDims({ w: width, h: height }); }
    });
    ro.observe(el);
    const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) setDims({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, []);

  // ── 数据 ──
  useEffect(() => {
    setLoading(true); setError(null);
    fetchKnowledgeGraph().then(d => setGraphData(d as any)).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  // ── 过滤后的数据 ──
  const filtered = (() => {
    if (!graphData) return null;
    const edges = showAuto ? graphData.edges : graphData.edges.filter((e: any) => e.type === "manual");
    // 只保留有连线的节点
    const connectedIds = new Set<number>();
    edges.forEach((e: any) => { connectedIds.add(e.source); connectedIds.add(e.target); });
    const nodes = graphData.nodes.filter((n: any) => connectedIds.has(n.id));
    return { nodes, edges };
  })();

  // ── 节点点击 → 预览面板 ──
  const handleNodeClick = useCallback((_: any, d: any) => {
    setPreviewId(d.id);
    setPreviewOpen(true);
  }, []);

  // ── D3 渲染 ──
  useEffect(() => {
    if (!filtered || !filtered.nodes.length || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    const { w, h } = dims;
    svg.attr("viewBox", `0 0 ${w} ${h}`);

    const zoom = d3.zoom<SVGSVGElement, any>().scaleExtent([0.15, 4]).on("zoom", ev => { mainG.attr("transform", ev.transform); });
    svg.call(zoom);
    zoomRef.current = zoom;

    const mainG = svg.append("g");

    const sim = d3.forceSimulation(filtered.nodes)
      .force("link", d3.forceLink(filtered.edges).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-350))
      .force("center", d3.forceCenter(w / 2, h / 2))
      .force("collision", d3.forceCollide().radius((d: any) => 16 + Math.min((d.refCount || 0) * 3, 24)));

    const link = mainG.append("g").selectAll("line").data(filtered.edges).join("line")
      .attr("stroke", (d: any) => d.type === "manual" ? "rgba(99,102,241,0.4)" : "rgba(245,158,11,0.2)")
      .attr("stroke-width", (d: any) => d.type === "manual" ? 2 : 1)
      .attr("stroke-dasharray", (d: any) => d.type === "auto" ? "4 3" : null);

    const node = mainG.append("g").selectAll("g").data(filtered.nodes).join("g").style("cursor", "pointer");

    node.append("circle")
      .attr("r", (d: any) => 9 + Math.min((d.refCount || 0) * 3, 22))
      .attr("fill", (d: any) => NODE_COLORS[(d.categoryId || 0) % NODE_COLORS.length])
      .attr("stroke", "rgba(255,255,255,0.2)").attr("stroke-width", 2);

    node.append("text").text((d: any) => (d.title || "").length > 10 ? d.title.slice(0, 10) + "…" : d.title || "")
      .attr("font-size", "10px").attr("fill", "#e2e8f0").attr("text-anchor", "middle")
      .attr("dy", (d: any) => -18 - Math.min((d.refCount || 0) * 3, 22))
      .style("pointer-events", "none").style("text-shadow", "0 1px 3px rgba(0,0,0,0.8)");

    node.on("click", handleNodeClick)
      .on("dblclick", (_: any, d: any) => onSelectPage(d.id))
      .on("mouseenter", (e: any, d: any) => setTip({ node: d, x: e.clientX, y: e.clientY }))
      .on("mouseleave", () => setTip(null))
      .call(d3.drag<any, any>()
        .on("start", (ev: any, d: any) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (ev: any, d: any) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end", (ev: any, d: any) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }) as any);

    sim.on("tick", () => {
      link.attr("x1", (d: any) => d.source.x).attr("y1", (d: any) => d.source.y).attr("x2", (d: any) => d.target.x).attr("y2", (d: any) => d.target.y);
      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });
    return () => { sim.stop(); };
  }, [filtered, dims, handleNodeClick]);

  return (
    <div ref={containerRef} className="h-full w-full relative" style={{ background: "radial-gradient(ellipse at center, #111827 0%, #0a0f1a 100%)" }}>
      {/* 浮动工具栏 */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1">
        <button onClick={onClose} className="flex items-center gap-1 rounded-[var(--app-radius-element)] bg-white/10 px-3 py-1.5 text-xs text-white/80 hover:bg-white/20 hover:text-white backdrop-blur border border-white/10">
          <X className="size-3.5" /> 返回知识库
        </button>
        <div className="w-px h-5 bg-white/15 mx-1" />
        <button onClick={() => setFilterOpen(!filterOpen)} className={`rounded-[var(--app-radius-element)] p-1.5 backdrop-blur border border-white/10 ${filterOpen ? "bg-white/20 text-white" : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"}`} title="筛选">
          <Filter className="size-3.5" />
        </button>
        {/* 过滤器弹出 */}
        {filterOpen && (
          <div className="absolute top-9 left-0 rounded-[var(--app-radius-container)] bg-black/85 backdrop-blur border border-white/10 p-2 text-xs text-white/80 min-w-[180px]">
            <label className="flex items-center gap-2 cursor-pointer py-1">
              <input type="checkbox" checked={!showAuto} onChange={e => setShowAuto(!e.target.checked)} className="rounded" />
              仅显示手动 wikilink
            </label>
            <label className="flex items-center gap-2 cursor-pointer py-1">
              <input type="checkbox" checked={showAuto} onChange={e => setShowAuto(e.target.checked)} className="rounded" />
              同时显示自动发现
            </label>
          </div>
        )}
        <div className="w-px h-5 bg-white/15 mx-1" />
        <span className="text-[10px] text-white/30 font-mono">
          {filtered ? `${filtered.nodes.length} 节点 · ${filtered.edges.length} 连线` : ""}
        </span>
      </div>

      {/* 图例 */}
      <div className="absolute bottom-3 right-3 z-10 rounded-[var(--app-radius-element)] bg-white/10 px-3 py-2 text-[10px] text-white/50 font-mono backdrop-blur border border-white/10">
        <div>单击预览 · 双击打开 · 拖拽移动 · 滚轮缩放</div>
        {!showAuto && <div className="mt-1 text-indigo-400/70">当前仅显示手动 wikilink 关系</div>}
      </div>

      {/* SVG */}
      <svg ref={svgRef} width={dims.w} height={dims.h} style={{ display: "block", touchAction: "none", cursor: "grab" }} />

      {/* 加载/错误 */}
      {loading && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><div className="text-white/60 text-sm font-mono">加载图谱…</div></div>}
      {error && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><div className="text-red-400 text-sm font-mono">加载失败: {error}</div></div>}

      {/* 悬停提示 */}
      {tip && (
        <div className="fixed z-[9999] rounded-lg border border-white/10 bg-black/85 backdrop-blur px-3 py-2 shadow-lg text-xs min-w-[150px] pointer-events-none" style={{ left: tip.x + 14, top: tip.y - 10 }}>
          <div className="font-semibold text-white">{tip.node.title}</div>
          <div className="mt-1 text-white/50">📁 {tip.node.categoryName} · 🔗 {tip.node.refCount} 引用</div>
        </div>
      )}

      {/* ── 预览面板（从右侧滑入）── */}
      {previewOpen && previewId && (
        <>
          <div className="absolute inset-0 z-20 bg-black/20" onClick={() => setPreviewOpen(false)} />
          <div className="absolute inset-y-0 right-0 z-30 w-[420px] border-l border-white/10 bg-[#111827]/95 backdrop-blur-xl flex flex-col shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 shrink-0">
              <h3 className="text-sm font-semibold text-white truncate flex-1 mr-2">
                {previewPage?.title || "加载中…"}
              </h3>
              <div className="flex items-center gap-1">
                <button onClick={() => { setPreviewOpen(false); onSelectPage(previewId); }} className="rounded-[var(--app-radius-element)] p-1.5 text-white/50 hover:text-white hover:bg-white/10" title="在浏览视图中打开">
                  <ExternalLink className="size-3.5" />
                </button>
                <button onClick={() => setPreviewOpen(false)} className="rounded-[var(--app-radius-element)] p-1.5 text-white/50 hover:text-white hover:bg-white/10">
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 text-sm text-white/80">
              {previewPage ? (
                <div className="prose prose-invert prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: previewPage.contentMd || previewPage.contentHtml || "" }} />
              ) : (
                <div className="flex items-center justify-center h-full text-white/40">加载中…</div>
              )}
            </div>
            <div className="border-t border-white/10 px-4 py-2 shrink-0">
              <button onClick={() => { setPreviewOpen(false); onSelectPage(previewId); }} className="w-full rounded-[var(--app-radius-element)] bg-indigo-600 px-4 py-2 text-xs font-medium text-white hover:bg-indigo-500">
                在浏览视图中打开完整文档
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
