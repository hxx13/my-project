// 基于浏览器 localStorage 的 StorageAdapter 实现。
// key 约定为 `aro.dt.floor.${floor}`，写前用 serializeGraph 序列化，读时用 parseGraph 校验版本。

import { parseGraph, serializeGraph } from "@/features/digital-twin/schema/types";
import type { TwinGraph } from "@/features/digital-twin/schema/types";
import type { StorageAdapter } from "./adapter";

/** localStorage key 前缀。 */
const KEY_PREFIX = "aro.dt.floor.";

/** Phase A 落地实现：把每层拓扑以 JSON 字符串存进 localStorage。 */
export class LocalStorageAdapter implements StorageAdapter {
  load(floor: string): TwinGraph | null {
    try {
      const text = localStorage.getItem(KEY_PREFIX + floor);
      if (text === null) return null;
      return parseGraph(text);
    } catch {
      // 任何解析/校验异常都视为无有效数据，返回 null。
      return null;
    }
  }

  save(floor: string, graph: TwinGraph): void {
    localStorage.setItem(KEY_PREFIX + floor, serializeGraph(graph));
  }
}
