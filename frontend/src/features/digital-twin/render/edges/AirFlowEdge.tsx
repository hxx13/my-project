// 风管气流边：贝塞尔曲线 + 沿路径移动的风粒子。
// 粒子由 data.flow 驱动，直接操作 SVG DOM（setAttribute），避免每帧触发 React 渲染。

import { useEffect, useRef } from "react";
import { BaseEdge, getBezierPath } from "@xyflow/react";
import type { Edge, EdgeProps } from "@xyflow/react";
import type { EdgeRole } from "@/features/digital-twin/schema/types";
import { particleCount, particleOpacity, particleSpeed } from "../effects/particles";
import { EDGE_MAIN_COLOR, EDGE_RETURN_COLOR } from "../theme";

const SVG_NS = "http://www.w3.org/2000/svg";

/** 边通过 React Flow data 属性传入的展示数据。 */
export type TwinEdgeData = {
  /** 风量 m³/h，驱动粒子数量 / 速度 / 透明度。 */
  flow: number;
  role: EdgeRole;
};

/** 送风/回风自定义边。role === "return" 时虚线灰，否则实线主色。 */
export function AirFlowEdge(props: EdgeProps<Edge<TwinEdgeData>>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const flow = data?.flow ?? 0;
  const role: EdgeRole = data?.role ?? "main";

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    curvature: 0.25,
  });

  const isReturn = role === "return";
  const color = isReturn ? EDGE_RETURN_COLOR : EDGE_MAIN_COLOR;

  // 量测用路径：和可见边同一条 d，供 getPointAtLength 定位粒子。
  const pathRef = useRef<SVGPathElement | null>(null);
  // 粒子容器：SVG <g>，卸载时清空。
  const particlesRef = useRef<SVGGElement | null>(null);

  useEffect(() => {
    const path = pathRef.current;
    const group = particlesRef.current;
    if (!path || !group) return;

    // 路径可能退化（源目标重合），此时长度 0，无法取点，直接跳过。
    const totalLength = path.getTotalLength();
    if (totalLength <= 0) return;

    const count = particleCount(flow);
    const speed = particleSpeed(flow);

    // 生成粒子圆并直接操作 DOM，避免每帧 setState 触发 React 重渲染。
    const circles: SVGCircleElement[] = [];
    const phases: number[] = [];
    for (let i = 0; i < count; i++) {
      const circle = document.createElementNS(SVG_NS, "circle");
      circle.setAttribute("r", "2.4");
      circle.setAttribute("fill", color);
      circle.setAttribute("style", `filter: drop-shadow(0 0 3px ${color})`);
      group.appendChild(circle);
      circles.push(circle);
      phases.push(i / count);
    }

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      // 上限 0.05s，避免后台切回时 dt 过大导致粒子跳跃。
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      for (let i = 0; i < count; i++) {
        let t = phases[i] + dt * speed;
        if (t >= 1) t -= 1;
        phases[i] = t;

        const point = path.getPointAtLength(t * totalLength);
        circles[i].setAttribute("cx", String(point.x));
        circles[i].setAttribute("cy", String(point.y));
        circles[i].setAttribute("opacity", particleOpacity(flow, t).toFixed(3));
      }

      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      for (const circle of circles) circle.remove();
    };
  }, [flow, role, edgePath]);

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={{
          stroke: color,
          strokeWidth: 2,
          opacity: 0.5,
          strokeLinecap: "round",
          strokeDasharray: isReturn ? "5 6" : undefined,
        }}
      />
      {/* 量测路径：不可见，仅用于粒子定位。 */}
      <path ref={pathRef} d={edgePath} fill="none" stroke="none" pointerEvents="none" />
      {/* 粒子层：不拦截边的点击/选中。 */}
      <g ref={particlesRef} pointerEvents="none" />
    </>
  );
}

export default AirFlowEdge;
