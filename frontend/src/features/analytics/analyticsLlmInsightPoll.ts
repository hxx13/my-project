import type { QueryClient } from "@tanstack/react-query";
import { fetchAnalyticsLlmInsight } from "@/api/domains/analytics.api";
import toast from "react-hot-toast";

const POLL_INTERVAL_MS = 5000;
const POLL_MAX_ATTEMPTS = 36;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isTimeoutError(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /timeout|timed out|超时/i.test(msg);
}

/** 客户端超时或关窗后，服务端可能仍在生成；轮询缓存直至就绪 */
export function pollAnalyticsLlmInsightUntilReady(
  auditLogId: number,
  qc: QueryClient,
  opts?: { notifyOnReady?: boolean }
) {
  const notify = opts?.notifyOnReady !== false;
  void (async () => {
    for (let i = 0; i < POLL_MAX_ATTEMPTS; i++) {
      await delay(POLL_INTERVAL_MS);
      try {
        const cached = await fetchAnalyticsLlmInsight(auditLogId, false);
        if (cached.exists) {
          qc.setQueryData(["analytics", "llm-insight", auditLogId], cached);
          if (notify) {
            toast.success("AI 解读已生成，请再次点击「AI 解读」查看", { id: `llm-insight-ready-${auditLogId}` });
          }
          return;
        }
      } catch {
        /* 忽略单次轮询失败 */
      }
    }
  })();
}

export function mergeInsightWhenDialogClosed(
  auditLogId: number,
  qc: QueryClient,
  dialogOpen: boolean
) {
  if (dialogOpen) return;
  void qc.invalidateQueries({ queryKey: ["analytics", "llm-insight", auditLogId] });
  toast.success("AI 解读已生成，请再次点击「AI 解读」查看", { id: `llm-insight-ready-${auditLogId}` });
}

export { isTimeoutError };
