import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWinccTelemetrySnapshot } from "@/api/telemetryApi";
import type { DtSceneWidget } from "@/features/digital-twin-screen/layout/sceneLayoutTypes";
import type { TelemetryTagItem } from "@/telemetry-view/types";

const MAX_VARIABLES = 32;
const DEFAULT_INTERVAL_MS = 4000;

function collectVariableNames(widgets: DtSceneWidget[]): string[] {
  const set = new Set<string>();
  for (const w of widgets) {
    for (const b of w.bindings) {
      const vn = (b.variableName || "").trim();
      if (vn) set.add(vn);
    }
  }
  return [...set].slice(0, MAX_VARIABLES);
}

export function useTwinWinccWidgetValues(widgets: DtSceneWidget[], enabled: boolean, intervalMs = DEFAULT_INTERVAL_MS) {
  const [valueByName, setValueByName] = useState<Map<string, TelemetryTagItem>>(() => new Map());
  const [winccEnabled, setWinccEnabled] = useState(true);
  const [lastError, setLastError] = useState<string | null>(null);
  const namesKey = useMemo(() => collectVariableNames(widgets).sort().join("\0"), [widgets]);

  const tick = useCallback(async () => {
    const names = collectVariableNames(widgets);
    if (names.length === 0) {
      setValueByName(new Map());
      setLastError(null);
      return;
    }
    try {
      const snap = await fetchWinccTelemetrySnapshot({
        sync: true,
        variableNames: names.join(","),
      });
      setWinccEnabled(snap.winccEnabled !== false);
      setLastError(snap.lastError ?? null);
      const m = new Map<string, TelemetryTagItem>();
      for (const it of snap.items || []) {
        const vn = (it.variableName || "").trim();
        if (vn) m.set(vn, it);
      }
      setValueByName(m);
    } catch (e) {
      setLastError(e instanceof Error ? e.message : String(e));
    }
  }, [widgets]);

  useEffect(() => {
    if (!enabled) {
      setValueByName(new Map());
      return;
    }
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void tick();
    };
    run();
    const id = window.setInterval(run, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled, intervalMs, tick, namesKey]);

  return { valueByName, winccEnabled, lastError, refreshNow: tick, trackedCount: collectVariableNames(widgets).length };
}
