// 空调区节点：两个读数并排一行（送风温 · 开度）。
// 注册 key 为 NodeKind 的 "acZone"。

import type { Node, NodeProps } from "@xyflow/react";
import { BindingInline, NodeCard, type TwinNodeData } from "./NodeCard";

/** 空调区节点：150×64，标题 + 副标 + 一行两个读数。 */
export function AcZoneNode({ data }: NodeProps<Node<TwinNodeData>>) {
  const [b0, b1] = data.bindings;
  return (
    <NodeCard data={data} width={150} height={64}>
      <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 6 }}>
        {b0 ? <BindingInline binding={b0} /> : null}
        {b0 && b1 ? <span style={{ color: "var(--twin-mute)" }}>·</span> : null}
        {b1 ? <BindingInline binding={b1} /> : null}
      </div>
    </NodeCard>
  );
}

export default AcZoneNode;
