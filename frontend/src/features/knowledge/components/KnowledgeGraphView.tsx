import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { fetchKnowledgeGraph } from "@/api/domains/knowledge.api";
import type { GraphData, GraphNode as GraphNodeType } from "@/features/knowledge/types";

interface Props {
  onSelectPage: (pageId: number) => void;
}

export function KnowledgeGraphView({ onSelectPage }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [tooltip, setTooltip] = useState<{ node: GraphNodeType; x: number; y: number } | null>(null);

  useEffect(() => {
    fetchKnowledgeGraph().then(setGraphData);
  }, []);

  useEffect(() => {
    if (!graphData || !svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 500;

    const simulation = d3.forceSimulation(graphData.nodes as any)
      .force("link", d3.forceLink(graphData.edges).id((d: any) => d.id).distance(80))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg.append("g")
      .selectAll("line")
      .data(graphData.edges)
      .join("line")
      .attr("stroke", (d: any) => d.type === "manual" ? "rgba(99,102,241,0.5)" : "rgba(245,158,11,0.3)")
      .attr("stroke-width", (d: any) => d.type === "manual" ? 1.5 : 1)
      .attr("stroke-dasharray", (d: any) => d.type === "auto" ? "4 2" : null);

    const node = svg.append("g")
      .selectAll("circle")
      .data(graphData.nodes)
      .join("circle")
      .attr("r", (d: any) => 8 + Math.min(d.refCount * 3, 20))
      .attr("fill", (d: any) => {
        const colors = ["#11a8cd", "#6366f1", "#22c55e", "#f59e0b", "#ef4444"];
        return colors[d.categoryId % colors.length];
      })
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5)
      .style("cursor", "pointer")
      .on("click", (_e: any, d: any) => onSelectPage(d.id))
      .on("mouseenter", (e: any, d: any) => {
        setTooltip({ node: d as GraphNodeType, x: e.pageX, y: e.pageY });
      })
      .on("mouseleave", () => setTooltip(null))
      .call(d3.drag()
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
        }) as any);

    const label = svg.append("g")
      .selectAll("text")
      .data(graphData.nodes)
      .join("text")
      .text((d: any) => d.title.length > 10 ? d.title.slice(0, 10) + "…" : d.title)
      .attr("font-size", "9px")
      .attr("fill", "#c9d1d9")
      .attr("text-anchor", "middle")
      .attr("dy", (d: any) => -14 - Math.min(d.refCount * 3, 20));

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);
      node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y);
      label.attr("x", (d: any) => d.x).attr("y", (d: any) => d.y);
    });

    return () => { simulation.stop(); };
  }, [graphData, onSelectPage]);

  return (
    <div className="relative h-full w-full" style={{ background: "linear-gradient(135deg, #0a0f1a 0%, #111827 50%, #0d1520 100%)" }}>
      <svg ref={svgRef} className="h-full w-full" />
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
