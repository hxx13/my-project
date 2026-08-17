// 数字孪生 HVAC 拓扑的默认值：空图、默认楼层、各类型节点的默认绑定槽。

import type { BindingSlot, NodeKind, TwinGraph } from "./types";
import { CURRENT_GRAPH_VERSION } from "./types";

/** 默认楼层列表。 */
export const DEFAULT_FLOORS: string[] = ["1F", "2F", "3F", "4F"];

/** 返回一个空的拓扑图（包含默认的三个泳道）。 */
export function emptyGraph(): TwinGraph {
  return {
    version: CURRENT_GRAPH_VERSION,
    lanes: ["设备", "空调区", "房间"],
    nodes: [],
    edges: [],
  };
}

/**
 * 按节点类型返回默认绑定槽。
 * 所有槽的 variableName 初始化为空串（未绑定）。
 */
export function defaultBindings(kind: NodeKind): BindingSlot[] {
  switch (kind) {
    case "equipment":
      return [
        {
          variableName: "",
          label: "频率",
          semantic: "status",
          unit: "Hz",
          decimals: 1,
          format: "number",
          bindingKind: "readout",
        },
      ];
    case "acZone":
      return [
        {
          variableName: "",
          label: "送风温",
          semantic: "temperature",
          unit: "°C",
          format: "number",
          bindingKind: "readout",
        },
        {
          variableName: "",
          label: "开度",
          semantic: "generic",
          unit: "%",
          decimals: 0,
          format: "number",
          bindingKind: "readout",
        },
      ];
    case "room":
      return [
        {
          variableName: "",
          label: "温",
          semantic: "temperature",
          unit: "°C",
          format: "number",
          bindingKind: "readout",
        },
        {
          variableName: "",
          label: "湿",
          semantic: "humidity",
          unit: "%",
          format: "number",
          bindingKind: "readout",
        },
        {
          variableName: "",
          label: "压差",
          semantic: "pressure",
          unit: "Pa",
          format: "number",
          bindingKind: "readout",
        },
      ];
  }
}
