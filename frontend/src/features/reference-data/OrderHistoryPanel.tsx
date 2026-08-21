import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  useOrders,
  useOrderDetail,
  useOrderLogs,
} from "@/api/hooks/useReferenceData";
import type { RefOrder, RefOrderLine, RefOrderLog } from "@/api/domains/referenceData.api";

interface OrderHistoryPanelProps {
  groupId: string;
  onClose: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理",
  APPROVED: "已批准",
  REJECTED: "已驳回",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};
const STATUS_COLORS: Record<string, string> = {
  PENDING: "#f59e0b",
  APPROVED: "#3b82f6",
  REJECTED: "#ef4444",
  COMPLETED: "#16a34a",
  CANCELLED: "#9ca3af",
};

export default function OrderHistoryPanel({ groupId, onClose }: OrderHistoryPanelProps) {
  const { data: orders = [], isLoading } = useOrders(groupId);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-twin-xl bg-[var(--twin-canvas)] p-4 shadow-twin-level-4 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between shrink-0 mb-3">
          <h3 className="text-base font-semibold text-[var(--twin-ink)]">订单记录</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-sm text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
          >
            关闭
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="text-xs text-[var(--twin-mute)] py-8 text-center">加载中…</div>
          ) : orders.length === 0 ? (
            <div className="text-xs text-[var(--twin-mute)] py-8 text-center">暂无订单记录</div>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  expanded={expandedId === order.id}
                  onToggle={() => setExpandedId(expandedId === order.id ? null : order.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function OrderCard({ order, expanded, onToggle }: { order: RefOrder; expanded: boolean; onToggle: () => void }) {
  const { data: detail } = useOrderDetail(order.id);
  const { data: logs = [] } = useOrderLogs(order.id);

  const lines = detail?.lines || order.lines || [];
  const statusLabel = STATUS_LABELS[order.status] || order.status;
  const statusColor = STATUS_COLORS[order.status] || "#9ca3af";

  return (
    <div className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] overflow-hidden">
      {/* Summary row */}
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-[var(--twin-canvas)] transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: statusColor }}
          />
          <span className="text-sm font-medium text-[var(--twin-ink)] truncate">
            订单 #{order.id}
          </span>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: statusColor }}
          >
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0 ml-2">
          {order.estimatedDeliveryDate && (
            <span className="text-[11px] text-emerald-700">
              预计送达 {order.estimatedDeliveryDate}
            </span>
          )}
          <span className="text-[11px] text-[var(--twin-mute)]">
            {lines.length} 项
          </span>
          <span className="text-[11px] text-[var(--twin-mute)]">
            {order.submittedAt ? new Date(order.submittedAt).toLocaleDateString("zh-CN") : ""}
          </span>
          <span className="text-xs text-[var(--twin-mute)]">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-[var(--twin-hairline)] px-3 py-2 space-y-2 bg-[var(--twin-canvas)]">
          {/* Lines */}
          <div>
            <div className="text-[11px] font-semibold text-[var(--twin-body)] mb-1">订单明细</div>
            <div className="space-y-1">
              {lines.map((line: RefOrderLine, i: number) => (
                <div key={line.id || i} className="flex items-start justify-between text-xs">
                  <div className="min-w-0 flex-1">
                    <span className="text-[var(--twin-ink)]">物品 #{line.refDataId}</span>
                    {line.specSelections && (
                      <span className="text-[var(--twin-mute)] ml-1">
                        {typeof line.specSelections === "string"
                          ? line.specSelections
                          : Object.entries(line.specSelections).map(([k, v]) => `${k}=${v}`).join(" · ")}
                      </span>
                    )}
                    {(line.registerNo || line.aupRecordId != null) && (
                      <span className="text-sky-600 ml-1">
                        {line.registerNo?.trim() || `AUP#${line.aupRecordId}`}
                      </span>
                    )}
                    {line.addedBy && (
                      <span className="text-[var(--twin-mute)] ml-1">
                        加购 · {(line.addedByName || "").trim() || line.addedBy}
                      </span>
                    )}
                    {line.lineRemark && (
                      <span className="text-amber-600 ml-1">包备注: {line.lineRemark}</span>
                    )}
                  </div>
                  <span className="shrink-0 font-semibold text-[var(--twin-ink)] ml-2">×{line.quantity}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Hierarchy chain preview */}
          {lines.some((l: RefOrderLine) => l.hierarchyChain) && (
            <div>
              <div className="text-[11px] font-semibold text-[var(--twin-body)] mb-1">关系链</div>
              {lines.filter((l: RefOrderLine) => l.hierarchyChain).map((line: RefOrderLine, i: number) => (
                <div key={i} className="text-[10px] text-[var(--twin-mute)]">
                  {Array.isArray(line.hierarchyChain)
                    ? line.hierarchyChain.map((n: { displayName: string; refType: string }) => n.displayName).join(" → ")
                    : ""}
                </div>
              ))}
            </div>
          )}

          {/* Submit remark */}
          {order.estimatedDeliveryDate && (
            <div>
              <div className="text-[11px] font-semibold text-[var(--twin-body)] mb-0.5">预计送达</div>
              <div className="text-xs text-emerald-700">{order.estimatedDeliveryDate}</div>
            </div>
          )}

          {order.submitRemark && (
            <div>
              <div className="text-[11px] font-semibold text-[var(--twin-body)] mb-0.5">提交备注</div>
              <div className="text-xs text-[var(--twin-mute)]">{order.submitRemark}</div>
            </div>
          )}

          {/* Operation log timeline */}
          {logs.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-[var(--twin-body)] mb-1">操作日志</div>
              <div className="space-y-1">
                {logs.map((log: RefOrderLog) => (
                  <div key={log.id} className="flex items-start gap-2 text-[10px]">
                    <span className="text-[var(--twin-mute)] shrink-0 w-[80px]">
                      {log.createdAt ? new Date(log.createdAt).toLocaleString("zh-CN") : ""}
                    </span>
                    <span
                      className="shrink-0 rounded px-1 py-0.5 font-medium text-white"
                      style={{ backgroundColor: STATUS_COLORS[log.action] || "#9ca3af" }}
                    >
                      {STATUS_LABELS[log.action] || log.action}
                    </span>
                    <span className="text-[var(--twin-mute)] shrink-0">
                      {(log.operatorName || "").trim() || log.operatorId}
                    </span>
                    <span className="text-[var(--twin-body)]">{log.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
