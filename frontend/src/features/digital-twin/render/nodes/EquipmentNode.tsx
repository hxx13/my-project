// 设备节点（风机 / 空调箱）：单个读数行 + 右侧旋转叶轮。
// 注册 key 为 NodeKind 的 "equipment"。

import type { Node, NodeProps } from "@xyflow/react";
import { NODE_KIND_COLOR } from "../theme";
import { BindingInline, NodeCard, type TwinNodeData } from "./NodeCard";

/** 旋转叶轮：conic-gradient 分叶圆 + 中心点，用 Tailwind 的 @keyframes spin 旋转。 */
function Impeller({ color }: { color: string }) {
  const blades = [
    `${color} 0deg 45deg`,
    "transparent 45deg 90deg",
    `${color} 90deg 135deg`,
    "transparent 135deg 180deg",
    `${color} 180deg 225deg`,
    "transparent 225deg 270deg",
    `${color} 270deg 315deg`,
    "transparent 315deg 360deg",
  ].join(", ");

  return (
    <div
      className="animate-spin"
      style={{
        position: "absolute",
        right: 12,
        top: "50%",
        marginTop: -14,
        width: 28,
        height: 28,
        borderRadius: "50%",
        background: `conic-gradient(${blades})`,
        animationDuration: "1.7s",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
      </div>
    </div>
  );
}

/** 设备节点：150×76，标题 + 副标 + 一个读数行 + 右侧叶轮。 */
export function EquipmentNode({ data }: NodeProps<Node<TwinNodeData>>) {
  const binding = data.bindings[0];
  return (
    <NodeCard data={data} width={150} height={76}>
      {binding ? (
        <div style={{ marginTop: 4, maxWidth: 96, overflow: "hidden" }}>
          <BindingInline binding={binding} />
        </div>
      ) : null}
      <Impeller color={NODE_KIND_COLOR.equipment} />
    </NodeCard>
  );
}

export default EquipmentNode;
