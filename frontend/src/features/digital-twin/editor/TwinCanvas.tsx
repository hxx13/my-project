// 数字孪生 HVAC 拓扑的受控 React Flow 画布。
// 节点/边完全由 store 派生，遥测读数经 useTelemetry 轮询后格式化注入卡片。

import { useCallback, useMemo } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { Background, BackgroundVariant, ReactFlow } from "@xyflow/react";
import type { Edge, Node, OnNodesChange } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AirFlowEdge, type TwinEdgeData } from "@/features/digital-twin/render/edges/AirFlowEdge";
import { AcZoneNode } from "@/features/digital-twin/render/nodes/AcZoneNode";
import { EquipmentNode } from "@/features/digital-twin/render/nodes/EquipmentNode";
import type { TwinNodeData } from "@/features/digital-twin/render/nodes/NodeCard";
import { RoomNode } from "@/features/digital-twin/render/nodes/RoomNode";
import type { BindingSlot, NodeKind, TwinEdge, TwinNode } from "@/features/digital-twin/schema/types";
import { MockTelemetryAdapter } from "@/features/digital-twin/telemetry/mock";
import { useTelemetry } from "@/features/digital-twin/telemetry/useTelemetry";
import { currentGraph, useDigitalTwinStore } from "./store";

/** 各节点类型在画布上的固定尺寸。 */
const NODE_DIMENSIONS: Record<NodeKind, { width: number; height: number }> = {
  equipment: { width: 150, height: 76 },
  acZone: { width: 150, height: 64 },
  room: { width: 160, height: 82 },
};

/** 把遥测原始值格式化为显示文本：数字按 decimals 取小数位，其余原样，空则占位符。 */
function formatValue(binding: BindingSlot, valueByName: Map<string, string>): string {
  const raw = valueByName.get(binding.variableName);
  if (raw === undefined || raw === "") {
    return "—";
  }
  if (binding.format === "number") {
    const num = Number(raw);
    if (Number.isFinite(num)) {
      return num.toFixed(binding.decimals ?? 0);
    }
  }
  return raw;
}

/** TwinNode → 节点卡片展示数据，含告警判定。 */
function toNodeData(node: TwinNode, valueByName: Map<string, string>): TwinNodeData {
  const bindings = node.bindings.map((b) => ({
    label: b.label ?? "",
    semantic: b.semantic,
    unit: b.unit,
    value: formatValue(b, valueByName),
  }));

  // 简化告警判定：任一绑定的值越出 alarmRules 的 min/max 即告警。
  const alarm = node.alarmRules.some((rule) => {
    const binding = node.bindings[rule.bindingIndex];
    if (!binding) return false;
    const raw = valueByName.get(binding.variableName);
    if (raw === undefined || raw === "") return false;
    const num = Number(raw);
    if (!Number.isFinite(num)) return false;
    if (rule.min !== undefined && num < rule.min) return true;
    if (rule.max !== undefined && num > rule.max) return true;
    return false;
  });

  return { kind: node.kind, title: node.title, sublabel: node.sublabel, bindings, alarm };
}

/** TwinEdge → React Flow 边。 */
function toRfEdge(edge: TwinEdge): Edge<TwinEdgeData> {
  return { id: edge.id, source: edge.from, target: edge.to, type: "airflow", data: { flow: edge.flow, role: edge.role } };
}

// 节点/边类型注册表：模块级常量，保证引用稳定（避免 React Flow #002 警告）。
const nodeTypes = { equipment: EquipmentNode, acZone: AcZoneNode, room: RoomNode };
const edgeTypes = { airflow: AirFlowEdge };

export function TwinCanvas() {
  const graph = useDigitalTwinStore(currentGraph);
  const mode = useDigitalTwinStore((s) => s.mode);
  const selected = useDigitalTwinStore((s) => s.selected);
  const connectMode = useDigitalTwinStore((s) => s.connectMode);
  const connectSource = useDigitalTwinStore((s) => s.connectSource);

  // 遥测适配器保持稳定引用，避免每次渲染重建导致轮询重启。
  const adapter = useMemo(() => new MockTelemetryAdapter(), []);
  const { valueByName } = useTelemetry(graph.nodes, adapter);

  const rfNodes: Node<TwinNodeData>[] = useMemo(
    () =>
      graph.nodes.map((n) => {
        const dim = NODE_DIMENSIONS[n.kind];
        return {
          id: n.id,
          type: n.kind,
          position: { x: n.x, y: n.y },
          style: { width: dim.width, height: dim.height },
          data: toNodeData(n, valueByName),
          selected: selected?.kind === "node" && selected.id === n.id,
        };
      }),
    [graph.nodes, valueByName, selected],
  );

  const rfEdges: Edge<TwinEdgeData>[] = useMemo(
    () =>
      graph.edges.map((e) => ({
        ...toRfEdge(e),
        selected: selected?.kind === "edge" && selected.id === e.id,
      })),
    [graph.edges, selected],
  );

  const onNodesChange: OnNodesChange<Node<TwinNodeData>> = useCallback((changes) => {
    // 拖拽位置变化：低层写回 x/y，不推撤销（撤销由 onNodeDragStart 的快照兜底）。
    for (const change of changes) {
      if (change.type === "position" && change.position) {
        useDigitalTwinStore.getState().setNodePosition(change.id, change.position.x, change.position.y);
      }
    }
  }, []);

  const onNodeDragStart = useCallback(() => {
    // 拖拽开始前把当前图快照进 past，一次拖拽只产生一条撤销记录。
    useDigitalTwinStore.getState().pushUndoSnapshot();
  }, []);

  const onNodeClick = useCallback(
    (_event: ReactMouseEvent, node: Node<TwinNodeData>) => {
      if (mode === "display") return;
      const store = useDigitalTwinStore.getState();
      if (connectMode) {
        if (connectSource === null) {
          store.setConnectSource(node.id);
        } else if (connectSource === node.id) {
          // 再次点击起点视为取消。
          store.setConnectSource(null);
        } else {
          store.addEdge(connectSource, node.id);
          store.setConnectMode(false);
        }
        return;
      }
      store.select({ kind: "node", id: node.id });
    },
    [mode, connectMode, connectSource],
  );

  const onEdgeClick = useCallback(
    (_event: ReactMouseEvent, edge: Edge<TwinEdgeData>) => {
      if (mode === "display") return;
      useDigitalTwinStore.getState().select({ kind: "edge", id: edge.id });
    },
    [mode],
  );

  const onPaneClick = useCallback(() => {
    useDigitalTwinStore.getState().select(null);
  }, []);

  const isConnectReady = connectMode && connectSource !== null;

  return (
    <div className="absolute inset-0 bg-[var(--twin-canvas)]">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={onPaneClick}
        // 选择由 store 的 selected 驱动，关闭 RF 内置选中/删除避免两套状态打架。
        elementsSelectable={false}
        deleteKeyCode={null}
        nodesConnectable={false}
        nodesDraggable={mode === "edit"}
        fitView
        proOptions={{ hideAttribution: true }}
        colorMode="system"
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.5} color="var(--twin-hairline-strong)" bgColor="var(--twin-canvas)" />
        {isConnectReady ? (
          <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full border border-[var(--twin-link)] bg-[var(--twin-canvas-soft)] px-4 py-1.5 text-xs text-[var(--twin-link)] shadow-lg">
            已选起点，点击目标节点完成连线（再点起点取消）
          </div>
        ) : null}
      </ReactFlow>
    </div>
  );
}
