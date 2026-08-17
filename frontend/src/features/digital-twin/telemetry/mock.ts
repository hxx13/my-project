// 模拟遥测数据源：内存存储变量值，用于开发与测试。

import type { TelemetryAdapter, TelemetryValue, TelemetryVariable } from "./adapter";

/** 内置变量目录（含分组）。 */
const BUILTIN_VARIABLES: TelemetryVariable[] = [
  { name: "SF-01.FREQ", group: "设备" },
  { name: "SF-01.STATUS", group: "设备" },
  { name: "AHU-01.TEMP", group: "设备" },
  { name: "AHU-01.VALVE", group: "设备" },
  { name: "ACZONE-A.TEMP", group: "空调区" },
  { name: "ACZONE-A.VALVE", group: "空调区" },
  { name: "ROOM101.TEMP", group: "房间" },
  { name: "ROOM101.HUMI", group: "房间" },
  { name: "ROOM101.PRESS", group: "房间" },
  { name: "ROOM102.TEMP", group: "房间" },
];

/** 默认示例变量值。 */
const DEFAULT_VALUES: Record<string, string> = {
  "SF-01.FREQ": "45",
  "SF-01.STATUS": "运行",
  "AHU-01.TEMP": "18.5",
  "AHU-01.VALVE": "62",
  "ACZONE-A.TEMP": "22.4",
  "ACZONE-A.VALVE": "48",
  "ROOM101.TEMP": "24.1",
  "ROOM101.HUMI": "58",
  "ROOM101.PRESS": "-3.2",
  "ROOM102.TEMP": "23.6",
};

/** 基于内存的模拟遥测适配器。 */
export class MockTelemetryAdapter implements TelemetryAdapter {
  private store: Record<string, string>;

  constructor(initialValues: Record<string, string> = {}) {
    this.store = { ...DEFAULT_VALUES, ...initialValues };
  }

  /** 返回 names 中存在的变量（不存在的跳过）。 */
  async poll(variableNames: string[]): Promise<TelemetryValue[]> {
    return variableNames
      .filter((name) => name in this.store)
      .map((name) => ({ variableName: name, value: this.store[name] }));
  }

  /** 更新内存中的变量值。 */
  async write(variableName: string, value: string | number): Promise<void> {
    this.store[variableName] = String(value);
  }

  /** 返回内置变量目录。 */
  async listVariables(): Promise<TelemetryVariable[]> {
    return [...BUILTIN_VARIABLES];
  }
}
