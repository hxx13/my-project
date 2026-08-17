// 数字孪生 HVAC 拓扑编辑器的 zustand store。
// 以「楼层」为粒度保存多张 TwinGraph，并维护编辑态、选择态与撤销/重做栈。
// 撤销栈每层独立：past/future 只针对当前 activeFloor 的图做快照。

import { create } from "zustand";
import { gridLayout } from "@/features/digital-twin/schema/layout";
import { DEFAULT_FLOORS, defaultBindings, emptyGraph } from "@/features/digital-twin/schema/defaults";
import { newId } from "@/features/digital-twin/schema/types";
import type { NodeKind, TwinEdge, TwinGraph, TwinNode } from "@/features/digital-twin/schema/types";

/** 撤销栈快照上限。 */
const PAST_LIMIT = 40;

/** 各类节点的默认标题。 */
const KIND_TITLE: Record<NodeKind, string> = {
  equipment: "新设备",
  acZone: "新空调区",
  room: "新房间",
};

/** 各类节点的默认泳道。 */
const KIND_LANE: Record<NodeKind, string> = {
  equipment: "设备",
  acZone: "空调区",
  room: "房间",
};

/** 选中对象：要么一个节点，要么一条边。 */
export type Selection = { kind: "node" | "edge"; id: string };

/** 编辑器 store 的完整接口契约。 */
export interface DigitalTwinStore {
  /** 每层一张拓扑图，键为楼层名（如 "1F"）。 */
  floors: Record<string, TwinGraph>;
  activeFloor: string;
  mode: "edit" | "display";
  selected: Selection | null;
  /** 撤销栈（每层独立）。 */
  past: TwinGraph[];
  future: TwinGraph[];
  /** 连线模式开关。 */
  connectMode: boolean;
  /** 连线模式下已点选的起点节点 id。 */
  connectSource: string | null;

  // —— 编辑动作（走撤销栈） ——
  addNode(kind: NodeKind): void;
  deleteSelected(): void;
  updateNode(id: string, patch: Partial<TwinNode>): void;
  updateEdge(id: string, patch: Partial<TwinEdge>): void;
  addEdge(from: string, to: string): void;
  select(sel: Selection | null): void;
  switchFloor(floor: string): void;
  setMode(mode: "edit" | "display"): void;
  relayout(): void;
  undo(): void;
  redo(): void;

  // —— 连线模式 ——
  setConnectMode(enabled: boolean): void;
  setConnectSource(id: string | null): void;

  // —— 画布拖拽用低层操作（不走撤销栈） ——
  /** 拖拽过程中直接改 x/y，不推撤销；拖拽结束后由 onNodeDragStart 的快照兜底。 */
  setNodePosition(id: string, x: number, y: number): void;
  /** 把当前图快照进 past 并清空 future（拖拽开始前调用一次）。 */
  pushUndoSnapshot(): void;
}

/** 用 DEFAULT_FLOORS 初始化每层为空图。 */
function buildInitialFloors(): Record<string, TwinGraph> {
  const floors: Record<string, TwinGraph> = {};
  for (const floor of DEFAULT_FLOORS) {
    floors[floor] = emptyGraph();
  }
  return floors;
}

/** 从 store 取当前活动楼层的图（供 useStore 选择器使用）。 */
export function currentGraph(s: DigitalTwinStore): TwinGraph {
  return s.floors[s.activeFloor];
}

export const useDigitalTwinStore = create<DigitalTwinStore>()((set, get) => {
  /** 内部：把当前图推入 past（截断到 PAST_LIMIT）并清空 future。 */
  const snapshot = (): void => {
    const { floors, activeFloor, past } = get();
    set({
      past: [...past, floors[activeFloor]].slice(-PAST_LIMIT),
      future: [],
    });
  };

  /** 内部：先快照当前图，再以 next 覆盖活动楼层的图。 */
  const commit = (next: TwinGraph): void => {
    const { floors, activeFloor } = get();
    snapshot();
    set({ floors: { ...floors, [activeFloor]: next } });
  };

  return {
    floors: buildInitialFloors(),
    activeFloor: DEFAULT_FLOORS[0],
    mode: "edit",
    selected: null,
    past: [],
    future: [],
    connectMode: false,
    connectSource: null,

    addNode(kind) {
      const { floors, activeFloor } = get();
      const graph = floors[activeFloor];
      const k = graph.nodes.length;
      const node: TwinNode = {
        id: newId("n"),
        kind,
        lane: KIND_LANE[kind],
        x: 120 + (k % 6) * 180,
        y: 120 + Math.floor(k / 6) * 200,
        title: KIND_TITLE[kind],
        sublabel: "待配置",
        bindings: defaultBindings(kind),
        alarmRules: [],
      };
      commit({ ...graph, nodes: [...graph.nodes, node] });
    },

    deleteSelected() {
      const { selected, floors, activeFloor } = get();
      if (!selected) return;
      const graph = floors[activeFloor];
      if (selected.kind === "node") {
        const nodes = graph.nodes.filter((n) => n.id !== selected.id);
        const edges = graph.edges.filter((e) => e.from !== selected.id && e.to !== selected.id);
        commit({ ...graph, nodes, edges });
      } else {
        const edges = graph.edges.filter((e) => e.id !== selected.id);
        commit({ ...graph, edges });
      }
      set({ selected: null });
    },

    updateNode(id, patch) {
      const { floors, activeFloor } = get();
      const graph = floors[activeFloor];
      const nodes = graph.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
      commit({ ...graph, nodes });
    },

    updateEdge(id, patch) {
      const { floors, activeFloor } = get();
      const graph = floors[activeFloor];
      const edges = graph.edges.map((e) => (e.id === id ? { ...e, ...patch } : e));
      commit({ ...graph, edges });
    },

    addEdge(from, to) {
      const { floors, activeFloor } = get();
      const graph = floors[activeFloor];
      const edge: TwinEdge = { id: newId("e"), from, to, role: "main", flow: 600 };
      commit({ ...graph, edges: [...graph.edges, edge] });
    },

    select(sel) {
      set({ selected: sel });
    },

    switchFloor(floor) {
      set({ activeFloor: floor, selected: null, past: [], future: [], connectSource: null });
    },

    setMode(mode) {
      if (mode === "display") {
        set({ mode, selected: null, connectMode: false, connectSource: null });
      } else {
        set({ mode });
      }
    },

    relayout() {
      const { floors, activeFloor } = get();
      const graph = floors[activeFloor];
      commit({ ...graph, nodes: gridLayout(graph.nodes, graph.lanes) });
    },

    undo() {
      const { past, future, floors, activeFloor } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      const current = floors[activeFloor];
      set({
        floors: { ...floors, [activeFloor]: previous },
        past: past.slice(0, -1),
        future: [current, ...future],
      });
    },

    redo() {
      const { past, future, floors, activeFloor } = get();
      if (future.length === 0) return;
      const next = future[0];
      const current = floors[activeFloor];
      set({
        floors: { ...floors, [activeFloor]: next },
        past: [...past, current],
        future: future.slice(1),
      });
    },

    setConnectMode(enabled) {
      // 开关连线模式时清除已选起点，避免残留悬空的 source。
      set({ connectMode: enabled, connectSource: null });
    },

    setConnectSource(id) {
      set({ connectSource: id });
    },

    setNodePosition(id, x, y) {
      const { floors, activeFloor } = get();
      const graph = floors[activeFloor];
      const nodes = graph.nodes.map((n) => (n.id === id ? { ...n, x, y } : n));
      set({ floors: { ...floors, [activeFloor]: { ...graph, nodes } } });
    },

    pushUndoSnapshot() {
      snapshot();
    },
  };
});
