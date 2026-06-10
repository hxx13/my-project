import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import { fetchKnowledgeGraph } from "@/api/domains/knowledge.api";
import type { GraphNode } from "@/features/knowledge/types";

interface Props { onSelectPage: (id: number) => void }

export function KnowledgeGraphView({ onSelectPage }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [dims, setDims] = useState({ w: 800, h: 500 });
  const [graph, setGraph] = useState<{ nodes: any[]; edges: any[] } | null>(null);
  const [tip, setTip] = useState<{ node: GraphNode; x: number; y: number } | null>(null);

  // ResizeObserver for container dimensions
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) { const { width, height } = e.contentRect; if (width > 0 && height > 0) setDims({ w: width, h: height }); }
    });
    ro.observe(el);
    const r = el.getBoundingClientRect(); if (r.width > 0 && r.height > 0) setDims({ w: r.width, h: r.height });
    return () => ro.disconnect();
  }, []);

  useEffect(() => { fetchKnowledgeGraph().then(g => setGraph(g as any)); }, []);

  const handleClick = useCallback((_: any, d: any) => onSelectPage(d.id), [onSelectPage]);

  useEffect(() => {
    if (!graph || !svgRef.current) return;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    const { w, h } = dims;
    svg.attr("viewBox", `0 0 ${w} ${h}`);

    const sim = d3.forceSimulation(graph.nodes)
      .force("link", d3.forceLink(graph.edges).id((d: any) => d.id).distance(80))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(w / 2, h / 2))
      .force("collision", d3.forceCollide().radius((d: any) => 12 + Math.min((d.refCount || 0) * 3, 20)));

    const link = svg.append("g").selectAll("line").data(graph.edges).join("line")
      .attr("stroke", (d: any) => d.type === "manual" ? "rgba(99,102,241,0.5)" : "rgba(245,158,11,0.3)")
      .attr("stroke-width", (d: any) => d.type === "manual" ? 1.5 : 1)
      .attr("stroke-dasharray", (d: any) => d.type === "auto" ? "4 2" : null);

    const colors = ["#11a8cd", "#6366f1", "#22c55e", "#f59e0b", "#ef4444"];
    const node = svg.append("g").selectAll("circle").data(graph.nodes).join("circle")
      .attr("r", (d: any) => 8 + Math.min((d.refCount || 0) * 3, 20))
      .attr("fill", (d: any) => colors[(d.categoryId || 0) % colors.length])
      .attr("stroke", "#fff").attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("click", handleClick)
      .on("mouseenter", (e: any, d: any) => setTip({ node: d, x: e.clientX, y: e.clientY }))
      .on("mouseleave", () => setTip(null))
      .call(d3.drag<any, any>()
        .on("start", (ev: any, d: any) => { if (!ev.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (ev: any, d: any) => { d.fx = ev.x; d.fy = ev.y; })
        .on("end", (ev: any, d: any) => { if (!ev.active) sim.alphaTarget(0); d.fx = null; d.fy = null; }) as any);

    const label = svg.append("g").selectAll("text").data(graph.nodes).join("text")
      .text((d: any) => (d.title || "").length > 10 ? d.title.slice(0, 10) + "…" : d.title || "")
      .attr("font-size", "9px").attr("fill", "#c9d1d9").attr("text-anchor", "middle")
      .attr("dy", (d: any) => -14 - Math.min((d.refCount || 0) * 3, 20))
      .style("pointer-events", "none");

    sim.on("tick", () => {
      link.attr("x1", (d: any) => d.source.x).attr("y1", (d: any) => d.source.y).attr("x2", (d: any) => d.target.x).attr("y2", (d: any) => d.target.y);
      node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y);
      label.attr("x", (d: any) => d.x).attr("y", (d: any) => d.y);
    });
    return () => { sim.stop(); };
  }, [graph, dims, handleClick]);

  return (
    <div ref={containerRef} className="h-full w-full" style={{ background: "linear-gradient(135deg, #0a0f1a, #111827, #0d1520)" }}>
      <svg ref={svgRef} width={dims.w} height={dims.h} style={{ display: "block" }} />
      {tip && (
        <div className="fixed z-50 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-2.5 shadow-lg text-[11px]" style={{ left: tip.x + 12, top: tip.y - 10, pointerEvents: "none" }}>
          <div className="font-semibold">{tip.node.title}</div>
          <div className="mt-1 text-[var(--app-color-text-tertiary)]">📁 {tip.node.categoryName} · 🔗 {tip.node.refCount} 引用</div>
        </div>
      )}
    </div>
  );
}
