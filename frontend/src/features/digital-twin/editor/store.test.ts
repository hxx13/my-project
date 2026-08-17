import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_FLOORS, emptyGraph } from "@/features/digital-twin/schema/defaults";
import type { TwinGraph } from "@/features/digital-twin/schema/types";
import { currentGraph, useDigitalTwinStore } from "./store";

/** 构造一份与 store 初始状态一致的干净状态，供 beforeEach 重置。 */
function freshState() {
  const floors: Record<string, TwinGraph> = {};
  for (const floor of DEFAULT_FLOORS) {
    floors[floor] = emptyGraph();
  }
  return {
    floors,
    activeFloor: DEFAULT_FLOORS[0],
    mode: "edit" as const,
    selected: null,
    past: [],
    future: [],
    connectMode: false,
    connectSource: null,
  };
}

beforeEach(() => {
  useDigitalTwinStore.setState(freshState());
});

describe("digital-twin editor store", () => {
  it("addNode 后节点入图且 past 增长", () => {
    const before = useDigitalTwinStore.getState().past.length;
    useDigitalTwinStore.getState().addNode("equipment");

    const state = useDigitalTwinStore.getState();
    const graph = currentGraph(state);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].kind).toBe("equipment");
    expect(state.past.length).toBe(before + 1);
  });

  it("undo 还原、redo 重做", () => {
    const store = useDigitalTwinStore.getState();
    store.addNode("room");
    const afterAdd = currentGraph(useDigitalTwinStore.getState());
    expect(afterAdd.nodes).toHaveLength(1);

    useDigitalTwinStore.getState().undo();
    expect(currentGraph(useDigitalTwinStore.getState()).nodes).toHaveLength(0);

    useDigitalTwinStore.getState().redo();
    expect(currentGraph(useDigitalTwinStore.getState()).nodes).toHaveLength(1);
  });

  it("deleteSelected 删节点连带删边", () => {
    const store = useDigitalTwinStore.getState();
    store.addNode("equipment");
    store.addNode("room");
    const graph = currentGraph(useDigitalTwinStore.getState());
    const [from, to] = graph.nodes.map((n) => n.id);

    useDigitalTwinStore.getState().addEdge(from, to);
    const withEdge = currentGraph(useDigitalTwinStore.getState());
    expect(withEdge.edges).toHaveLength(1);

    // 选中源节点并删除，应连带删除指向它的边。
    useDigitalTwinStore.getState().select({ kind: "node", id: from });
    useDigitalTwinStore.getState().deleteSelected();

    const after = currentGraph(useDigitalTwinStore.getState());
    expect(after.nodes.map((n) => n.id)).not.toContain(from);
    expect(after.nodes).toHaveLength(1);
    expect(after.edges).toHaveLength(0);
    expect(useDigitalTwinStore.getState().selected).toBeNull();
  });

  it("switchFloor 隔离各层", () => {
    useDigitalTwinStore.getState().addNode("equipment");
    expect(currentGraph(useDigitalTwinStore.getState()).nodes).toHaveLength(1);

    useDigitalTwinStore.getState().switchFloor("2F");
    expect(currentGraph(useDigitalTwinStore.getState()).nodes).toHaveLength(0);
    expect(useDigitalTwinStore.getState().past).toHaveLength(0);
    expect(useDigitalTwinStore.getState().selected).toBeNull();

    useDigitalTwinStore.getState().addNode("room");
    expect(currentGraph(useDigitalTwinStore.getState()).nodes).toHaveLength(1);

    // 回到 1F，原节点仍保留。
    useDigitalTwinStore.getState().switchFloor("1F");
    expect(currentGraph(useDigitalTwinStore.getState()).nodes).toHaveLength(1);
  });

  it("setNodePosition 不改撤销栈，pushUndoSnapshot 推入一次", () => {
    useDigitalTwinStore.getState().addNode("equipment");
    const id = currentGraph(useDigitalTwinStore.getState()).nodes[0].id;
    const pastBefore = useDigitalTwinStore.getState().past.length;

    useDigitalTwinStore.getState().setNodePosition(id, 500, 500);
    expect(useDigitalTwinStore.getState().past.length).toBe(pastBefore);
    expect(currentGraph(useDigitalTwinStore.getState()).nodes[0]).toMatchObject({ x: 500, y: 500 });

    useDigitalTwinStore.getState().pushUndoSnapshot();
    expect(useDigitalTwinStore.getState().past.length).toBe(pastBefore + 1);
  });
});
