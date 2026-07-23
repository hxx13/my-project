const PREFIX = "[telemetry-insights]";

/** DEV 或 URL ?debug=1 时输出排障日志 */
export function isTelemetryInsightsDebug(): boolean {
  if (import.meta.env.DEV) return true;
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("debug") === "1";
}

export function tiDebug(label: string, payload?: unknown): void {
  if (!isTelemetryInsightsDebug()) return;
  if (payload === undefined) {
    console.debug(PREFIX, label);
  } else {
    console.debug(PREFIX, label, payload);
  }
}

/** 供 API 请求附带排障头（?debug=1 时） */
export function telemetryInsightsDebugHeaders(): Record<string, string> | undefined {
  if (typeof window === "undefined") return undefined;
  if (new URLSearchParams(window.location.search).get("debug") !== "1") return undefined;
  return { "X-Telemetry-Insights-Debug": "1" };
}
