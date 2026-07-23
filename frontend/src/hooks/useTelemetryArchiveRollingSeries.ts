import { useQuery } from "@tanstack/react-query";
import { fetchTelemetryArchiveSeriesRolling } from "@/api/telemetryApi";

const DEFAULT_WINDOW_H = 6;
const DEFAULT_MAX_POINTS = 120;
const DEFAULT_POLL_MS = 20_000;

/**
 * 动物房详情等：归档曲线由服务端 ROLLING 定窗 + 降采样；前端轮询整包替换。
 */
export function useTelemetryArchiveRollingSeries(
  variableName: string | undefined,
  opts?: {
    windowHours?: number;
    maxPoints?: number;
    pollMs?: number;
    enabled?: boolean;
  }
) {
  const vn = (variableName ?? "").trim();
  const wh = opts?.windowHours ?? DEFAULT_WINDOW_H;
  const mp = opts?.maxPoints ?? DEFAULT_MAX_POINTS;
  const enabled = opts?.enabled !== false && vn.length > 0;
  return useQuery({
    queryKey: ["telemetry", "archive", "rolling", vn, wh, mp],
    queryFn: () => fetchTelemetryArchiveSeriesRolling(vn, { windowHours: wh, maxPoints: mp }),
    enabled,
    refetchInterval: enabled ? (opts?.pollMs ?? DEFAULT_POLL_MS) : false,
    staleTime: 10_000,
  });
}
