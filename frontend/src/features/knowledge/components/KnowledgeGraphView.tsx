import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";
import { fetchKnowledgeGraph } from "@/api/domains/knowledge.api";
import type { GraphData, GraphNode as GraphNodeType } from "@/features/knowledge/types";

interface Props {
  onSelectPage: (pageId: number) => void;
}

export function KnowledgeGraphView({ onSelectPage }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [tooltip, setTooltip] = useState<{ node: GraphNodeType; x: number; y: number } | null>(null);
  const [dims, setDims] = useState({ width: 800, height: 500 });

  // ── Responsive sizing via ResizeObserver ──
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDims({ width, height });
        }
      }
    });
    ro.observe(el);
    // Initial measure
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) setDims({ width: r.width, height: r.height });
    return () => ro.disconnect();
  }, []);

  // ── Fetch data ──
  useEffect(() => {
    fetchKnowledgeGraph().then(setGraphData);
  }, []);

  // ── Stable callback ──
  const handleNodeClick = useCallback((_e: any, d: any) => {
    onSelectPage(d.id);
  }, [onSelectPage]);

  // ── D3 render ──
  useEffect(() => {
    if (!graphData || !svgRef.current || !dims.width || !dims.height) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const { width, height } = dims;

    // Set viewBox so SVG coordinates match container pixel dimensions
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const simulation = d3.forceSimulation(graphData.nodes as any)
      .force("link", d3.forceLink(graphData.edges).id((d: any) => d.id).distance(80))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d: any) => 12 + Math.min(d.refCount * 3, 20)));

    // ── Links ──
    const link = svg.append("g")
      .selectAll("line")
      .data(graphData.edges)
      .join("line")
      .attr("stroke", (d: any) => d.type === "manual" ? "rgba(99,102,241,0.5)" : "rgba(245,158,11,0.3)")
      .attr("stroke-width", (d: any) => d.type === "manual" ? 1.5 : 1)
      .attr("stroke-dasharray", (d: any) => d.type === "auto" ? "4 2" : null);

    // ── Nodes (circles) ──
    const node = svg.append("g")
      .selectAll("circle")
      .data(graphData.nodes)
      .join("circle")
      .attr("r", (d: any) => 8 + Math.min(d.refCount * 3, 20))
      .attr("fill", (d: any) => {
        const colors = ["#11a8cd", "#6366f1", "#22c55e", "#f59e0b", "#ef4444"];
        return colors[(d.categoryId || 0) % colors.length];
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("click", handleNodeClick)
      .on("mouseenter", (e: any, d: any) => {
        setTooltip({ node: d as GraphNodeType, x: e.clientX, y: e.clientY });
      })
      .on("mouseleave", () => setTooltip(null))
      .call(
        d3.drag<SVGCircleElement, any>()
          .on("start", (event: any, d: any) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x; d.fy = d.y;
          })
          .on("drag", (event: any, d: any) => {
            d.fx = event.x; d.fy = event.y;
          })
          .on("end", (event: any, d: any) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null; d.fy = null;
          }) as any
      );

    // ── Labels ──
    svg.append("g")
      .selectAll("text")
      .data(graphData.nodes)
      .join("text")
      .text((d: any) => d.title.length > 10 ? d.title.slice(0, 10) + "…" : d.title)
      .attr("font-size", "9px")
      .attr("fill", "#c9d1d9")
      .attr("text-anchor", "middle")
      .attr("dy", (d: any) => -14 - Math.min(d.refCount * 3, 20))
      .style("pointer-events", "none");

    // ── Tick ──
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);
      node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y);
      svg.selectAll("text")
        .attr("x", (d: any) => d.x)
        .attr("y", (d: any) => d.y);
    });

    return () => { simulation.stop(); };
  }, [graphData, dims, handleNodeClick]);

  // ── Render ──
  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ background: "linear-gradient(135deg, #0a0f1a 0%, #111827 50%, #0d1520 100%)" }}
    >
      <svg
        ref={svgRef}
        width={dims.width}
        height={dims.height}
        style={{ display: "block" }}
        preserveAspectRatio="xMidYMid meet"
      />
      {tooltip && (
        <div
          className="fixed z-50 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-2.5 shadow-lg text-[11px] min-w-[140px]"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10, pointerEvents: "none" }}
        >
          <div className="font-semibold text-[var(--app-color-text-primary)]">{tooltip.node.title}</div>
          <div className="mt-1 text-[var(--app-color-text-tertiary)]">
            📁 {tooltip.node.categoryName} · 🔗 {tooltip.node.refCount} 引用
          </div>
        </div>
      )}
    </div>
  );
}
