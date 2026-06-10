/**
 * 知识图谱 — 全屏沉浸式力导向图
 *
 * ## 架构约束（AI 开发者必读）
 *
 * 1. **不使用三栏布局**：图谱需要全部可用空间，渲染时左侧目录和右侧大纲均隐藏。
 *    Shell 在 graph 视图下应跳过 KnowledgeLayout，直接渲染本组件。
 *
 * 2. **touch-action: none**：父级滚动容器（overflow-y-auto）会拦截 pointer 事件。
 *    必须在图谱容器上设置 `touch-action: none`，否则 D3 drag 永远不触发。
 *    这是 D3 拖拽在 scroll container 内的**必须配置**，非可选。
 *
 * 3. **SVG 尺寸**：用 ResizeObserver 获取容器像素尺寸后，通过 `width`/`height`
 *    **属性**（非 CSS class）传给 `<svg>`。CSS `h-full w-full` 对 SVG 不可靠——
 *    SVG 元素有自己的 intrinsic sizing 规则，`height:100%` 可能解析为 150px。
 *
 * 4. **viewBox**：必须与 width/height 同步设为 `0 0 W H`，确保 D3 坐标与像素对齐。
 *
 * 5. **d3.zoom + d3.drag 共存**：zoom 处理画布平移/缩放，drag 处理节点拖拽。
 *    D3 v7 中两者通过事件冒泡自然协作——drag 消费事件后不会传播到 zoom。
 *
 * 6. **React StrictMode**：useEffect cleanup 必须 `sim.stop()` 防止双挂载时内存泄漏。
 */
import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import { fetchKnowledgeGraph } from "@/api/domains/knowledge.api";
import { X, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import type { GraphNode } from "@/features/knowledge/types";

interface Props {
  onSelectPage: (id: number) => void;
  onClose: () => void;
}

// 配色：按分类循环，暗色画布上高饱和节点
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

  // ── 容器尺寸监听 ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const { width, height } = e.contentRect;
        if (width > 0 && height > 0) setDims({ w: width, h: height });
      }
    });
    ro.observe(el);
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) setDims({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, []);

  // ── 数据加载 ──
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchKnowledgeGraph()
      .then(d => setGraphData(d as any))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // ── 稳定回调 ──
  const handleNodeClick = useCallback((_: any, d: any) => onSelectPage(d.id), [onSelectPage]);

  // ── D3 渲染（graphData 或 dims 变化时重建） ──
  useEffect(() => {
    if (!graphData || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { w, h } = dims;
    svg.attr("viewBox", `0 0 ${w} ${h}`);

    // 缩放行为
    const zoom = d3.zoom<SVGSVGElement, any>()
      .scaleExtent([0.2, 5])
      .on("zoom", (ev) => {
        mainG.attr("transform", ev.transform);
      });
    svg.call(zoom);
    zoomRef.current = zoom;

    const mainG = svg.append("g");

    // 力模拟
    const sim = d3.forceSimulation(graphData.nodes)
      .force("link", d3.forceLink(graphData.edges).id((d: any) => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(w / 2, h / 2))
      .force("collision", d3.forceCollide().radius((d: any) => 14 + Math.min((d.refCount || 0) * 3, 24)));

    // 连线
    const link = mainG.append("g").selectAll("line").data(graphData.edges).join("line")
      .attr("stroke", (d: any) => d.type === "manual" ? "rgba(99,102,241,0.4)" : "rgba(245,158,11,0.25)")
      .attr("stroke-width", (d: any) => d.type === "manual" ? 2 : 1)
      .attr("stroke-dasharray", (d: any) => d.type === "auto" ? "4 3" : null);

    // 节点
    const node = mainG.append("g").selectAll("g").data(graphData.nodes).join("g")
      .style("cursor", "pointer");

    node.append("circle")
      .attr("r", (d: any) => 9 + Math.min((d.refCount || 0) * 3, 22))
      .attr("fill", (d: any) => NODE_COLORS[(d.categoryId || 0) % NODE_COLORS.length])
      .attr("stroke", "rgba(255,255,255,0.2)")
      .attr("stroke-width", 2);

    // 标签
    node.append("text")
      .text((d: any) => (d.title || "").length > 8 ? d.title.slice(0, 8) + "…" : d.title || "")
      .attr("font-size", "10px")
      .attr("fill", "#e2e8f0")
      .attr("text-anchor", "middle")
      .attr("dy", (d: any) => -16 - Math.min((d.refCount || 0) * 3, 22))
      .style("pointer-events", "none")
      .style("text-shadow", "0 1px 3px rgba(0,0,0,0.8)");

    // 交互
    node.on("click", handleNodeClick)
      .on("mouseenter", (e: any, d: any) => setTip({ node: d, x: e.clientX, y: e.clientY }))
      .on("mouseleave", () => setTip(null))
      .call(d3.drag<any, any>()
        .on("start", (ev: any, d: any) => {
          if (!ev.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (ev: any, d: any) => {
          d.fx = ev.x; d.fy = ev.y;
        })
        .on("end", (ev: any, d: any) => {
          if (!ev.active) sim.alphaTarget(0);
          d.fx = null; d.fy = null;
        }) as any);

    // 刻度
    sim.on("tick", () => {
      link.attr("x1", (d: any) => d.source.x).attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x).attr("y2", (d: any) => d.target.y);
      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => { sim.stop(); };
  }, [graphData, dims, handleNodeClick]);

  // ── 工具栏操作 ──
  const handleZoomIn = () => { if (svgRef.current && zoomRef.current) d3.select(svgRef.current).transition().call(zoomRef.current.scaleBy, 1.5); };
  const handleZoomOut = () => { if (svgRef.current && zoomRef.current) d3.select(svgRef.current).transition().call(zoomRef.current.scaleBy, 0.67); };
  const handleReset = () => { if (svgRef.current && zoomRef.current) d3.select(svgRef.current).transition().call(zoomRef.current.transform, d3.zoomIdentity); };

  // ── 渲染 ──
  return (
    <div className="relative h-full w-full" style={{ background: "radial-gradient(ellipse at center, #111827 0%, #0a0f1a 100%)" }}>
      {/* 浮动工具栏 */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1">
        <button onClick={onClose} className="flex items-center gap-1 rounded-lg bg-black/60 px-3 py-1.5 text-xs text-white/80 hover:bg-black/80 hover:text-white backdrop-blur">
          <X className="size-3.5" /> 返回
        </button>
        <div className="w-px h-5 bg-white/15 mx-1" />
        <button onClick={handleZoomIn} className="rounded-lg bg-black/60 p-1.5 text-white/70 hover:bg-black/80 hover:text-white backdrop-blur" title="放大">
          <ZoomIn className="size-3.5" />
        </button>
        <button onClick={handleZoomOut} className="rounded-lg bg-black/60 p-1.5 text-white/70 hover:bg-black/80 hover:text-white backdrop-blur" title="缩小">
          <ZoomOut className="size-3.5" />
        </button>
        <button onClick={handleReset} className="rounded-lg bg-black/60 p-1.5 text-white/70 hover:bg-black/80 hover:text-white backdrop-blur" title="重置视图">
          <Maximize2 className="size-3.5" />
        </button>
        <span className="ml-2 text-[10px] text-white/30 font-mono">
          {graphData ? `${graphData.nodes.length} 节点 · ${graphData.edges.length} 连线` : ""}
        </span>
      </div>

      {/* 图例 */}
      <div className="absolute bottom-3 right-3 z-10 rounded-lg bg-black/60 px-3 py-2 text-[10px] text-white/50 font-mono backdrop-blur">
        <div>🖱 拖拽节点 · 滚轮缩放 · 平移画布</div>
        <div className="mt-1">━━ 实线: wikilink &nbsp; ┅┅ 虚线: 自动发现</div>
      </div>

      {/* SVG 画布 — touch-action:none 是拖拽生效的必要条件 */}
      <svg
        ref={svgRef}
        width={dims.w}
        height={dims.h}
        style={{ display: "block", touchAction: "none", cursor: "grab" }}
      />

      {/* 加载/错误状态 */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="text-white/60 text-sm font-mono">加载图谱数据…</div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <div className="text-red-400 text-sm font-mono">加载失败: {error}</div>
        </div>
      )}

      {/* 悬停提示 */}
      {tip && (
        <div
          className="fixed z-[9999] rounded-lg border border-white/10 bg-black/85 backdrop-blur px-3 py-2 shadow-lg text-xs min-w-[150px] pointer-events-none"
          style={{ left: tip.x + 14, top: tip.y - 10 }}
        >
          <div className="font-semibold text-white">{tip.node.title}</div>
          <div className="mt-1 text-white/50">
            📁 {tip.node.categoryName} · 🔗 {tip.node.refCount} 引用
          </div>
          <div className="mt-1 text-white/30 text-[10px]">单击打开文档</div>
        </div>
      )}
    </div>
  );
}
