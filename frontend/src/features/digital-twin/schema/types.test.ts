import { describe, expect, it } from "vitest";
import { emptyGraph } from "./defaults";
import {
  CURRENT_GRAPH_VERSION,
  newId,
  parseGraph,
  serializeGraph,
  type TwinGraph,
} from "./types";

const sampleGraph: TwinGraph = {
  version: CURRENT_GRAPH_VERSION,
  lanes: ["设备", "空调区", "房间"],
  nodes: [
    {
      id: "n-1",
      kind: "equipment",
      lane: "设备",
      x: 120,
      y: 120,
      title: "送风机",
      bindings: [
        {
          variableName: "SF-01.FREQ",
          semantic: "status",
          unit: "Hz",
          decimals: 1,
          format: "number",
          bindingKind: "readout",
        },
      ],
      alarmRules: [],
    },
  ],
  edges: [],
};

describe("types 序列化与解析", () => {
  it("serializeGraph 与 parseGraph 往返一致", () => {
    const text = serializeGraph(sampleGraph);
    expect(parseGraph(text)).toEqual(sampleGraph);
  });

  it("parseGraph 对非法 JSON 抛错", () => {
    expect(() => parseGraph("not-json")).toThrow(/JSON/);
  });

  it("parseGraph 对版本不是 1 的输入抛错", () => {
    const wrongVersion = JSON.stringify({ ...sampleGraph, version: 2 });
    expect(() => parseGraph(wrongVersion)).toThrow(/版本/);
  });

  it("parseGraph 对非对象输入抛错", () => {
    expect(() => parseGraph("[]")).toThrow(/对象/);
  });

  it("parseGraph 兜底保证 lanes/nodes/edges 为数组", () => {
    const text = JSON.stringify({ version: CURRENT_GRAPH_VERSION });
    const graph = parseGraph(text);
    expect(graph.lanes).toEqual([]);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });

  it("newId 生成带前缀的唯一 id", () => {
    const a = newId("node");
    const b = newId("node");
    expect(a.startsWith("node-")).toBe(true);
    expect(a).not.toBe(b);
  });
});

describe("emptyGraph 默认结构", () => {
  it("返回默认版本、三个泳道、空节点与边", () => {
    const graph = emptyGraph();
    expect(graph.version).toBe(CURRENT_GRAPH_VERSION);
    expect(graph.lanes).toEqual(["设备", "空调区", "房间"]);
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});
