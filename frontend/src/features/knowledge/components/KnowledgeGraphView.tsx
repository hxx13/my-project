/**
 * 知识图谱 — 全屏沉浸式力导向图
 *
 * ## 架构约束
 * 1. touch-action:none 是 D3 拖拽的必要条件
 * 2. SVG 尺寸用 ResizeObserver → 显式 width/height 属性
 * 3. 单击节点 → 浮动弹窗预览（可拖动）；双击 → 跳转浏览视图
 * 4. 默认仅显示手动 wikilink，自动发现可切换
 * 5. 分类复选框控制哪些分类的文档出现在图谱中
 */
import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import { fetchKnowledgeGraph } from "@/api/domains/knowledge.api";
import { useKnowledgePage } from "@/features/knowledge/hooks/useKnowledgePage";
import { KnowledgePageRenderer } from "./KnowledgePageRenderer";
import { X, ExternalLink, Filter } from "lucide-react";
import type { GraphNode, KnowledgeTreeNode } from "@/features/knowledge/types";

interface Props {
  tree: KnowledgeTreeNode[];
  onSelectPage: (id: number) => void;
  onClose: () => void;
}

const NODE_COLORS = ["#11a8cd", "#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6"];

export function KnowledgeGraphView({ tree, onSelectPage, onClose }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const [dims, setDims] = useState({ w: 900, h: 600 });
  const [rawGraph, setRawGraph] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tip, setTip] = useState<{ node: GraphNode; x: number; y: number } | null>(null);

  // 筛选状态
  const [showAuto, setShowAuto] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  // 默认全选分类
  const allCatIds = tree.flatMap(n => [n.categoryId, ...n.children.map(c => c.categoryId)]);
  const [selectedCats, setSelectedCats] = useState<Set<number>>(() => new Set(allCatIds));

  // 浮动弹窗
  const [popup, setPopup] = useState<{ nodeId: number; x: number; y: number } | null>(null);
  const { data: popupPage } = useKnowledgePage(popup?.nodeId ?? null);
  // 弹窗拖拽
  const [popupPos, setPopupPos] = useState({ x: 0, y: 0 });
  const draggingPopup = useRef(false);
  const popupStart = useRef({ x: 0, y: 0, px: 0, py: 0 });

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
    fetchKnowledgeGraph().then(d => setRawGraph(d as any)).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);

  // ── 过滤：分类 + 连线类型 ──
  const filtered = (() => {
    if (!rawGraph) return null;
    const edges = showAuto ? rawGraph.edges : rawGraph.edges.filter((e: any) => e.type === "manual");
    const connectedIds = new Set<number>();
    edges.forEach((e: any) => { connectedIds.add(e.source); connectedIds.add(e.target); });
    const nodes = rawGraph.nodes.filter((n: any) => connectedIds.has(n.id) && selectedCats.has(n.categoryId));
    // 再次过滤 edges：两端节点都必须在过滤后的 nodes 中
    const nodeIds = new Set(nodes.map((n: any) => n.id));
    const filteredEdges = edges.filter((e: any) => nodeIds.has(e.source) && nodeIds.has(e.target));
    return { nodes, edges: filteredEdges };
  })();

  const toggleCat = (id: number) => {
    setSelectedCats(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // ── 节点单击 → 浮动弹窗（约束在视口内）──
  const handleNodeClick = useCallback((e: any, d: any) => {
    const pw = 480, ph = 400; // 弹窗预估尺寸
    let px = e.clientX + 20;
    let py = e.clientY - 20;
    // 约束在视口内
    if (px + pw > window.innerWidth - 20) px = window.innerWidth - pw - 20;
    if (py + ph > window.innerHeight - 20) py = window.innerHeight - ph - 20;
    if (px < 20) px = 20;
    if (py < 60) py = 60;
    setPopup({ nodeId: d.id, x: px, y: py });
    setPopupPos({ x: px, y: py });
  }, []);

  // ── 弹窗拖拽 ──
  const startDragPopup = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingPopup.current = true;
    popupStart.current = { x: e.clientX, y: e.clientY, px: popupPos.x, py: popupPos.y };
  }, [popupPos]);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!draggingPopup.current) return;
      setPopupPos({
        x: popupStart.current.px + (e.clientX - popupStart.current.x),
        y: popupStart.current.py + (e.clientY - popupStart.current.y),
      });
    };
    const up = () => { draggingPopup.current = false; };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
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

    const mainG = svg.append("g");
    const sim = d3.forceSimulation(filtered.nodes)
      .force("link", d3.forceLink(filtered.edges).id((d: any) => d.id).distance(90))
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
      {/* 工具栏 */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1">
        <button onClick={onClose} className="flex items-center gap-1 rounded-[var(--app-radius-element)] bg-white/10 px-3 py-1.5 text-xs text-white/80 hover:bg-white/20 hover:text-white backdrop-blur border border-white/10">
          <X className="size-3.5" /> 返回知识库
        </button>
        <div className="w-px h-5 bg-white/15 mx-1" />
        <button onClick={() => setFilterOpen(!filterOpen)} className={`rounded-[var(--app-radius-element)] p-1.5 backdrop-blur border border-white/10 ${filterOpen ? "bg-white/20 text-white" : "bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"}`} title="筛选">
          <Filter className="size-3.5" />
        </button>
        <span className="ml-2 text-[10px] text-white/30 font-mono">
          {filtered ? `${filtered.nodes.length} 节点 · ${filtered.edges.length} 连线` : ""}
        </span>
      </div>

      {/* 筛选面板 */}
      {filterOpen && (
        <div className="absolute top-10 left-3 z-20 rounded-[var(--app-radius-container)] bg-black/90 backdrop-blur border border-white/10 p-3 text-xs text-white/80 min-w-[220px] max-h-[60vh] overflow-y-auto">
          <div className="font-semibold mb-2 text-white/60 text-[10px] uppercase tracking-wider">连线类型</div>
          <label className="flex items-center gap-2 cursor-pointer py-1"><input type="checkbox" checked={!showAuto} onChange={e => setShowAuto(!e.target.checked)} />仅手动 wikilink</label>
          <label className="flex items-center gap-2 cursor-pointer py-1"><input type="checkbox" checked={showAuto} onChange={e => setShowAuto(e.target.checked)} />含自动发现</label>
          <div className="border-t border-white/10 my-2" />
          <div className="font-semibold mb-2 text-white/60 text-[10px] uppercase tracking-wider">显示分类</div>
          {tree.map(cat => (
            <div key={cat.categoryId}>
              <label className="flex items-center gap-2 cursor-pointer py-0.5 font-medium"><input type="checkbox" checked={selectedCats.has(cat.categoryId)} onChange={() => toggleCat(cat.categoryId)} />{cat.categoryName}</label>
              {cat.children.map(sub => (
                <label key={sub.categoryId} className="flex items-center gap-2 cursor-pointer py-0.5 ml-3 text-white/60"><input type="checkbox" checked={selectedCats.has(sub.categoryId)} onChange={() => toggleCat(sub.categoryId)} />{sub.categoryName}</label>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 图例 */}
      <div className="absolute bottom-3 right-3 z-10 rounded-[var(--app-radius-element)] bg-white/10 px-3 py-2 text-[10px] text-white/50 font-mono backdrop-blur border border-white/10">
        <div>单击预览 · 双击打开 · 拖拽节点 · 滚轮缩放</div>
        {!showAuto && <div className="mt-1 text-indigo-400/70">仅显示手动 wikilink 关系</div>}
      </div>

      {/* SVG */}
      <svg ref={svgRef} width={dims.w} height={dims.h} style={{ display: "block", touchAction: "none", cursor: "grab" }} />

      {/* 加载/错误 */}
      {loading && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><div className="text-white/60 text-sm font-mono">加载图谱…</div></div>}
      {error && <div className="absolute inset-0 flex items-center justify-center bg-black/40"><div className="text-red-400 text-sm font-mono">加载失败: {error}</div></div>}

      {/* 悬停 */}
      {tip && (
        <div className="fixed rounded-lg border border-white/10 bg-black/85 backdrop-blur px-3 py-2 shadow-lg text-xs pointer-events-none" style={{ left: tip.x + 14, top: tip.y - 10, zIndex: "var(--z-tooltip)" }}>
          <div className="font-semibold text-white">{tip.node.title}</div>
          <div className="mt-1 text-white/50">📁 {tip.node.categoryName} · 🔗 {tip.node.refCount} 引用</div>
        </div>
      )}

      {/* ── 浮动弹窗（可拖动标题栏，浅色背景匹配 docs-prose）── */}
      {popup && popupPage && (
        <div
          ref={popupRef}
          className="fixed rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] shadow-[var(--app-elevation-modal)] flex flex-col"
          style={{ zIndex: "var(--z-modal)", left: popupPos.x, top: popupPos.y, width: "480px", maxHeight: "65vh" }}
        >
          {/* 标题栏 — 可拖拽 */}
          <div
            className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--app-color-border-default)] shrink-0 cursor-move select-none bg-[var(--app-color-surface-container)] rounded-t-[var(--app-radius-container)]"
            onMouseDown={startDragPopup}
          >
            <h3 className="text-sm font-semibold text-[var(--app-color-text-primary)] truncate flex-1 mr-2">{popupPage.title}</h3>
            <div className="flex items-center gap-1">
              <button onClick={() => { setPopup(null); onSelectPage(popup.nodeId); }} className="rounded-[var(--app-radius-element)] p-1.5 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-accent)] hover:bg-[var(--app-color-surface-hover)]" title="在浏览视图中打开"><ExternalLink className="size-3.5" /></button>
              <button onClick={() => setPopup(null)} className="rounded-[var(--app-radius-element)] p-1.5 text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)]"><X className="size-3.5" /></button>
            </div>
          </div>
          {/* 内容 — docs-prose 样式，匹配浅色背景 */}
          <div className="flex-1 overflow-y-auto px-5 py-4">
            <KnowledgePageRenderer contentMd={popupPage.contentMd} contentHtml={popupPage.contentHtml} />
          </div>
        </div>
      )}
    </div>
  );
}
