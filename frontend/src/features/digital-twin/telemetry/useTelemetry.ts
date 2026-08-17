// 遥测轮询 React hook：按节点绑定槽收集变量名，定时轮询并暴露最新值。

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TwinNode } from "@/features/digital-twin/schema/types";
import type { TelemetryAdapter, TelemetryValue } from "./adapter";

/** 收集所有节点绑定槽中非空的 variableName（去重）。 */
export function collectVariableNames(nodes: TwinNode[]): string[] {
  const names = new Set<string>();
  for (const node of nodes) {
    for (const binding of node.bindings) {
      const name = binding.variableName.trim();
      if (name.length > 0) {
        names.add(name);
      }
    }
  }
  return Array.from(names);
}

/** 把遥测值数组折叠为 name -> value 的 Map。 */
function toMap(values: TelemetryValue[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const value of values) {
    map.set(value.variableName, value.value);
  }
  return map;
}

/**
 * 轮询遥测数据的 hook。
 * 返回最新的变量值映射、最近一次错误，以及手动刷新函数。
 * adapter 或变量集合变化时自动重启轮询，卸载时清理定时器。
 */
export function useTelemetry(
  nodes: TwinNode[],
  adapter: TelemetryAdapter,
  intervalMs = 4000,
): {
  valueByName: Map<string, string>;
  lastError: string | null;
  refreshNow: () => Promise<void>;
} {
  const variableNames = useMemo(() => collectVariableNames(nodes), [nodes]);

  const [valueByName, setValueByName] = useState<Map<string, string>>(() => new Map());
  const [lastError, setLastError] = useState<string | null>(null);

  const refreshNow = useCallback(async () => {
    try {
      const values = await adapter.poll(variableNames);
      setValueByName(toMap(values));
      setLastError(null);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
    }
  }, [adapter, variableNames]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const values = await adapter.poll(variableNames);
        if (cancelled) {
          return;
        }
        setValueByName(toMap(values));
        setLastError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        setLastError(error instanceof Error ? error.message : String(error));
      }
    };

    void run();
    const timer = setInterval(() => {
      void run();
    }, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [adapter, variableNames, intervalMs]);

  return { valueByName, lastError, refreshNow };
}
