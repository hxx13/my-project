// 房间节点：三个读数分两行——前两个并排一行（温 · 湿），第三个单独一行（压差）。
// 注册 key 为 NodeKind 的 "room"。

import type { Node, NodeProps } from "@xyflow/react";
import { BindingInline, NodeCard, type TwinNodeData } from "./NodeCard";

/** 房间节点：160×82，标题 + 副标 + 两行读数（温/湿 一行，压差一行）。 */
export function RoomNode({ data }: NodeProps<Node<TwinNodeData>>) {
  const [b0, b1, b2] = data.bindings;
  return (
    <NodeCard data={data} width={160} height={82}>
      <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          {b0 ? <BindingInline binding={b0} /> : null}
          {b0 && b1 ? <span style={{ color: "var(--twin-mute)" }}>·</span> : null}
          {b1 ? <BindingInline binding={b1} /> : null}
        </div>
        {b2 ? (
          <div>
            <BindingInline binding={b2} />
          </div>
        ) : null}
      </div>
    </NodeCard>
  );
}

export default RoomNode;
