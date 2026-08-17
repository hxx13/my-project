import { useMemo, useState } from "react";
import { useAllOrders, useUpdateOrderStatus } from "@/api/hooks/useReferenceData";
import type { RefOrder } from "@/api/domains/referenceData.api";

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

type Tab = "pending" | "done";

export default function AdminOrderReviewPage() {
  const { data, isLoading, refetch } = useAllOrders(1, 200);
  const [tab, setTab] = useState<Tab>("pending");
  const updateStatus = useUpdateOrderStatus();

  const orders = data?.list ?? [];
  const pendingOrders = useMemo(() => orders.filter((o) => o.status === "PENDING"), [orders]);
  const doneOrders = useMemo(() => orders.filter((o) => o.status !== "PENDING"), [orders]);
  const list = tab === "pending" ? pendingOrders : doneOrders;

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-[var(--twin-ink)]">动物订购审核</h1>
          <p className="text-xs text-[var(--twin-mute)] mt-0.5">
            组长提交的订单在此接收处理（待处理 {pendingOrders.length} · 已办结 {doneOrders.length}）
          </p>
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-lg border border-[var(--twin-hairline)] px-3 py-1.5 text-sm text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
        >
          刷新
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-[var(--twin-hairline)]">
        {(["pending", "done"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-[var(--twin-primary)] text-[var(--twin-primary)]"
                : "border-transparent text-[var(--twin-mute)] hover:text-[var(--twin-body)]"
            }`}
          >
            {t === "pending" ? `新订单 (${pendingOrders.length})` : `已完成 (${doneOrders.length})`}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-[var(--twin-mute)] py-12 text-center">加载中…</div>
      ) : list.length === 0 ? (
        <div className="text-sm text-[var(--twin-mute)] py-12 text-center">
          {tab === "pending" ? "暂无待处理订单" : "暂无已完成订单"}
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((order) => (
            <OrderReviewCard
              key={order.id}
              order={order}
              busy={updateStatus.isPending}
              onAction={(status) => updateStatus.mutate({ id: order.id, status })}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OrderReviewCard({
  order,
  busy,
  onAction,
}: {
  order: RefOrder;
  busy: boolean;
  onAction: (status: string) => void;
}) {
  const statusLabel = STATUS_LABELS[order.status] || order.status;
  const statusColor = STATUS_COLORS[order.status] || "#9ca3af";

  return (
    <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 inline-block w-2 h-2 rounded-full"
            style={{ backgroundColor: statusColor }}
          />
          <span className="text-sm font-semibold text-[var(--twin-ink)]">订单 #{order.id}</span>
          <span
            className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium text-white"
            style={{ backgroundColor: statusColor }}
          >
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {order.status === "PENDING" && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction("REJECTED")}
                className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                驳回
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction("APPROVED")}
                className="rounded-lg bg-[var(--twin-primary)] px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
              >
                批准
              </button>
            </>
          )}
          {order.status === "APPROVED" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction("COMPLETED")}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm text-white hover:opacity-90 disabled:opacity-50"
            >
              标记完成
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div>
          <div className="text-[var(--twin-mute)]">课题组</div>
          <div className="text-[var(--twin-body)] mt-0.5">{order.projectGroupName || order.groupId || "—"}</div>
        </div>
        <div>
          <div className="text-[var(--twin-mute)]">提交人</div>
          <div className="text-[var(--twin-body)] mt-0.5">{order.submitterName || order.submitterId || "—"}</div>
        </div>
        <div>
          <div className="text-[var(--twin-mute)]">提交时间</div>
          <div className="text-[var(--twin-body)] mt-0.5">
            {order.submittedAt ? new Date(order.submittedAt).toLocaleString("zh-CN") : "—"}
          </div>
        </div>
        <div>
          <div className="text-[var(--twin-mute)]">备注</div>
          <div className="text-[var(--twin-body)] mt-0.5 truncate">{order.submitRemark || "—"}</div>
        </div>
      </div>
    </div>
  );
}
