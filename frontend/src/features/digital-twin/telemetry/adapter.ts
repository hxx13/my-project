// 数字孪生 HVAC 拓扑的遥测适配层接口定义。
// 通过 TelemetryAdapter 抽象具体数据源（真实后端 / 模拟数据）。

/** 一次轮询返回的单个遥测值。 */
export interface TelemetryValue {
  variableName: string;
  value: string;
}

/** 数据源可提供的变量目录条目。 */
export interface TelemetryVariable {
  name: string;
  group?: string;
}

/** 遥测数据源适配器，负责读取/写入外部变量。 */
export interface TelemetryAdapter {
  poll(variableNames: string[]): Promise<TelemetryValue[]>;
  write(variableName: string, value: string | number): Promise<void>;
  listVariables(): Promise<TelemetryVariable[]>;
}
