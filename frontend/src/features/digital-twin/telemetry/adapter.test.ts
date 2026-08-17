import { describe, expect, it } from "vitest";
import type { TwinNode } from "@/features/digital-twin/schema/types";
import { MockTelemetryAdapter } from "./mock";
import { collectVariableNames } from "./useTelemetry";

function makeNode(id: string, variableNames: string[]): TwinNode {
  return {
    id,
    kind: "room",
    lane: "房间",
    x: 0,
    y: 0,
    title: id,
    bindings: variableNames.map((variableName) => ({
      variableName,
      semantic: "temperature",
      format: "number",
      bindingKind: "readout",
    })),
    alarmRules: [],
  };
}

describe("collectVariableNames", () => {
  it("去重且过滤空串", () => {
    const nodes = [
      makeNode("a", ["ROOM101.TEMP", "ROOM101.HUMI"]),
      makeNode("b", ["ROOM101.TEMP", "", "  ", "ROOM101.PRESS"]),
    ];
    const names = collectVariableNames(nodes);
    expect(names.sort()).toEqual(["ROOM101.HUMI", "ROOM101.PRESS", "ROOM101.TEMP"]);
  });

  it("无绑定节点返回空数组", () => {
    expect(collectVariableNames([])).toEqual([]);
  });
});

describe("MockTelemetryAdapter", () => {
  it("poll 按名返回存在的值，跳过不存在的变量", async () => {
    const adapter = new MockTelemetryAdapter();
    const values = await adapter.poll(["SF-01.FREQ", "ROOM101.TEMP", "NOT_EXIST"]);
    const map = new Map(values.map((v) => [v.variableName, v.value]));
    expect(map.get("SF-01.FREQ")).toBe("45");
    expect(map.get("ROOM101.TEMP")).toBe("24.1");
    expect(map.has("NOT_EXIST")).toBe(false);
  });

  it("write 更新内存值并可在 poll 中读到", async () => {
    const adapter = new MockTelemetryAdapter();
    await adapter.write("ROOM101.TEMP", 26.5);
    const values = await adapter.poll(["ROOM101.TEMP"]);
    expect(values).toEqual([{ variableName: "ROOM101.TEMP", value: "26.5" }]);
  });

  it("构造函数可传入初始值覆盖默认值", async () => {
    const adapter = new MockTelemetryAdapter({ "SF-01.FREQ": "60" });
    const values = await adapter.poll(["SF-01.FREQ"]);
    expect(values[0].value).toBe("60");
  });

  it("listVariables 返回非空目录且含 group 字段", async () => {
    const adapter = new MockTelemetryAdapter();
    const vars = await adapter.listVariables();
    expect(vars.length).toBeGreaterThanOrEqual(10);
    expect(vars.every((v) => typeof v.group === "string" && v.group.length > 0)).toBe(true);
  });
});
