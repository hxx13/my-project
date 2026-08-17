// 数字孪生 HVAC 拓扑的领域模型：节点（房间/设备/空调区）与边（风管气流）。
// 本文件只定义类型与序列化/解析工具，不包含任何 React 逻辑。

export type NodeKind = "equipment" | "acZone" | "room";
export type EdgeRole = "main" | "return";
export type BindingSemantic = "temperature" | "humidity" | "pressure" | "status" | "generic";

/** 一个节点上的遥测绑定槽：把某个外部变量映射到节点的某个读数/指令。 */
export interface BindingSlot {
  variableName: string;
  /** 展示标签（如「频率」「送风温」「压差」）；缺省时按 semantic 推导短标签 */
  label?: string;
  semantic: BindingSemantic;
  unit?: string;
  decimals?: number;
  format: "number" | "text";
  bindingKind: "readout" | "command";
}

/** 绑定槽上的告警阈值规则。 */
export interface AlarmRule {
  bindingIndex: number;
  min?: number;
  max?: number;
  severity: "warn" | "critical";
}

/** 拓扑中的节点：房间、设备或空调区。 */
export interface TwinNode {
  id: string;
  kind: NodeKind;
  lane: string;
  x: number;
  y: number;
  title: string;
  sublabel?: string;
  bindings: BindingSlot[];
  alarmRules: AlarmRule[];
}

/** 拓扑中的边：节点间的风管气流。 */
export interface TwinEdge {
  id: string;
  from: string;
  to: string;
  role: EdgeRole;
  flow: number;
  label?: string;
}

/** 完整拓扑图。 */
export interface TwinGraph {
  version: number;
  lanes: string[];
  nodes: TwinNode[];
  edges: TwinEdge[];
}

/** 当前图数据结构的版本号，用于序列化兼容性校验。 */
export const CURRENT_GRAPH_VERSION = 1;

/** 将图序列化为 JSON 字符串。 */
export function serializeGraph(graph: TwinGraph): string {
  return JSON.stringify(graph);
}

/**
 * 解析并校验拓扑 JSON。
 * 版本号必须是数字且等于 CURRENT_GRAPH_VERSION，否则抛出错误。
 * 解析成功后兜底保证 lanes/nodes/edges 为数组。
 */
export function parseGraph(text: string): TwinGraph {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error("拓扑数据不是合法的 JSON，无法解析");
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error("拓扑数据格式不正确：应为对象");
  }

  const version = (raw as { version?: unknown }).version;
  if (typeof version !== "number" || version !== CURRENT_GRAPH_VERSION) {
    throw new Error(`拓扑数据版本不兼容：期望版本 ${CURRENT_GRAPH_VERSION}，实际为 ${String(version)}`);
  }

  const obj = raw as Partial<TwinGraph>;
  return {
    version: CURRENT_GRAPH_VERSION,
    lanes: Array.isArray(obj.lanes) ? obj.lanes : [],
    nodes: Array.isArray(obj.nodes) ? obj.nodes : [],
    edges: Array.isArray(obj.edges) ? obj.edges : [],
  };
}

/** 生成唯一 id，不依赖 Node 特有 API。 */
export function newId(prefix: string): string {
  const suffix =
    typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${suffix}`;
}
