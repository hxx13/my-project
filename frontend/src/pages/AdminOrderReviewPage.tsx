import { useMemo, useState } from "react";
import { useAllOrders, useUpdateOrderStatus } from "@/api/hooks/useReferenceData";
import type { RefOrder, RefOrderLine } from "@/api/domains/referenceData.api";
import DataSkeleton from "@/components/ui/DataSkeleton";
import { formatBeijingDateTimeFull } from "@/utils/beijingTime";

import { appConfirm } from "@/lib/appDialog";
const STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理",
  APPROVED: "已批准",
  REJECTED: "已驳回",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

type Tab = "pending" | "done";

function statusBadge(s: string): string {
  if (s === "PENDING") return "bg-amber-50 text-amber-700 border-amber-200";
  if (s === "APPROVED") return "bg-blue-50 text-blue-700 border-blue-200";
  if (s === "REJECTED") return "bg-red-50 text-red-700 border-red-200";
  if (s === "COMPLETED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  return "bg-gray-50 text-gray-600 border-gray-200";
}

function cardStatusTint(s: string): string {
  if (s === "PENDING") return "bg-[var(--twin-card-pending)]";
  if (s === "APPROVED" || s === "COMPLETED") return "bg-[var(--twin-card-approved)]";
  if (s === "REJECTED") return "bg-[var(--twin-card-rejected)]";
  return "bg-[var(--twin-canvas)]";
}

function lineItemLabel(line: RefOrderLine): string {
  const chain = line.hierarchyChain;
  if (Array.isArray(chain) && chain.length > 0) {
    const leaf = chain[0]?.displayName?.trim();
    if (leaf) return leaf;
  }
  return `物品 #${line.refDataId}`;
}

function formatSpecSelections(spec: RefOrderLine["specSelections"]): string {
  if (!spec) return "";
  if (typeof spec === "string") {
    const raw = spec.trim();
    if (!raw) return "";
    try {
      const obj = JSON.parse(raw) as Record<string, unknown>;
      return Object.entries(obj)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join(" · ");
    } catch {
      return raw;
    }
  }
  return Object.entries(spec)
    .map(([k, v]) => `${k}=${v}`)
    .join(" · ");
}

function lineAupLabel(line: RefOrderLine): string {
  if (line.registerNo?.trim()) return line.registerNo.trim();
  const chain = line.hierarchyChain;
  if (Array.isArray(chain)) {
    const aupNode = chain.find(
      (n) => n && typeof n === "object" && (n as { refType?: string }).refType === "AUP",
    ) as { displayName?: string } | undefined;
    if (aupNode?.displayName?.trim()) return aupNode.displayName.trim();
  }
  if (line.aupRecordId != null) return `AUP#${line.aupRecordId}`;
  return "未归属 AUP";
}

/** 按 AUP 分组明细，便于接收人一眼看清多 AUP 共享车提交 */
function groupLinesByAup(lines: RefOrderLine[]): Array<{ key: string; label: string; lines: RefOrderLine[] }> {
  const map = new Map<string, { label: string; lines: RefOrderLine[] }>();
  for (const line of lines) {
    const key = line.aupRecordId != null ? String(line.aupRecordId) : "none";
    const label = lineAupLabel(line);
    const bucket = map.get(key);
    if (bucket) bucket.lines.push(line);
    else map.set(key, { label, lines: [line] });
  }
  return Array.from(map.entries()).map(([key, v]) => ({ key, label: v.label, lines: v.lines }));
}

function uniqueAupCount(lines: RefOrderLine[]): number {
  const ids = new Set(lines.map((l) => (l.aupRecordId != null ? String(l.aupRecordId) : "none")));
  return ids.size;
}

export default function AdminOrderReviewPage() {
  const { data, isLoading, refetch, isFetching } = useAllOrders(1, 200);
  const [tab, setTab] = useState<Tab>("pending");
  const updateStatus = useUpdateOrderStatus();

  const orders = data?.list ?? [];
  const pendingOrders = useMemo(() => orders.filter((o) => o.status === "PENDING"), [orders]);
  const doneOrders = useMemo(() => orders.filter((o) => o.status !== "PENDING"), [orders]);
  const list = tab === "pending" ? pendingOrders : doneOrders;

  return (
    <div className="flex h-[calc(100dvh-var(--admin-chrome-offset))] max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-0 flex-col gap-2">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] shadow-twin-level-2">
        {/* 工具栏：对齐 animal-order 胶囊 tabs，无大标题 */}
        <div className="flex shrink-0 items-center gap-2 bg-[var(--twin-canvas)] px-3 py-2 overflow-visible">
          <div className="flex shrink-0 items-center gap-1">
            {([
              ["pending", `新订单 (${pendingOrders.length})`],
              ["done", `已完成 (${doneOrders.length})`],
            ] as [Tab, string][]).map(([k, v]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                  tab === k
                    ? "bg-sky-600 text-white"
                    : "border border-[var(--twin-hairline)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="flex-1 min-w-0" />
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="rounded-full border border-[var(--twin-hairline)] px-3 py-1 text-xs font-medium text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] transition-colors whitespace-nowrap disabled:opacity-50"
          >
            {isFetching ? "刷新中…" : "刷新"}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 space-y-2.5 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
          {isLoading ? (
            <DataSkeleton variant="card" rows={5} />
          ) : list.length === 0 ? (
            <div className="flex min-h-[160px] items-center justify-center rounded-twin-lg border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-sm text-[var(--twin-mute)]">
              {tab === "pending" ? "暂无待处理订单" : "暂无已完成订单"}
            </div>
          ) : (
            list.map((order) => (
              <OrderReviewCard
                key={order.id}
                order={order}
                busy={updateStatus.isPending}
                onAction={async (status) => {
                  const label = status === "APPROVED" ? "批准" : status === "REJECTED" ? "驳回" : "标记完成";
                  if (!await appConfirm(`确定${label}订单 #${order.id}？将整单生效。`)) return;
                  updateStatus.mutate({ id: order.id, status });
                }}
              />
            ))
          )}
        </div>
      </div>
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
  const [expanded, setExpanded] = useState(order.status === "PENDING");
  const lines = order.lines ?? [];
  const aupGroups = useMemo(() => groupLinesByAup(lines), [lines]);
  const aupCount = uniqueAupCount(lines);
  const statusLabel = STATUS_LABELS[order.status] || order.status;
  const headerAup =
    order.registerNo?.trim() ||
    (order.aupRecordId != null ? `AUP#${order.aupRecordId}` : null);

  return (
    <div
      className={`rounded-twin-lg border border-[var(--twin-hairline)] p-3 shadow-twin-level-1 flex flex-col gap-2 ${cardStatusTint(order.status)}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="text-[11px] text-[var(--twin-mute)] font-mono shrink-0">#{order.id}</span>
          <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusBadge(order.status)}`}>
            {statusLabel}
          </span>
          {aupCount > 1 ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-sky-200 bg-sky-50 text-sky-700 font-medium">
              多 AUP · {aupCount}
            </span>
          ) : headerAup ? (
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-sky-200 bg-sky-50 text-sky-700 font-medium truncate max-w-[180px]">
              {headerAup}
            </span>
          ) : null}
          <span className="text-[11px] text-[var(--twin-mute)]">{lines.length} 项</span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] text-[var(--twin-mute)] hover:text-[var(--twin-body)] shrink-0"
        >
          {expanded ? "收起明细 ▲" : "展开明细 ▼"}
        </button>
      </div>

      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold text-sm text-[var(--twin-primary)]">
              {order.submitterName || order.submitterId || "未知提交人"}
            </span>
            {(order.projectGroupName || order.groupId) && (
              <span className="text-[11px] text-[var(--twin-mute)]">
                ({order.projectGroupName || order.groupId})
              </span>
            )}
          </div>

          {!expanded && (
            <div className="space-y-0.5">
              {lines.slice(0, 3).map((line) => (
                <div key={line.id} className="flex items-center gap-2 text-xs min-w-0">
                  <span className="text-[var(--twin-body)] truncate">{lineItemLabel(line)}</span>
                  <span className="text-sky-600 shrink-0 text-[10px]">{lineAupLabel(line)}</span>
                  <span className="text-[var(--twin-mute)] shrink-0">×{line.quantity}</span>
                </div>
              ))}
              {lines.length > 3 && (
                <div className="text-[10px] text-[var(--twin-mute)]">另有 {lines.length - 3} 项…</div>
              )}
              {lines.length === 0 && (
                <div className="text-[11px] text-[var(--twin-mute)]">暂无明细行</div>
              )}
            </div>
          )}

          {order.submitRemark && (
            <div className="text-[11px] text-[var(--twin-body)]">
              <span className="text-[var(--twin-mute)]">提交备注：</span>
              {order.submitRemark}
            </div>
          )}
        </div>

        <div className="shrink-0 flex flex-col items-end gap-1.5 min-w-[120px]">
          <span className="text-[11px] text-[var(--twin-mute)] text-right">
            {order.submittedAt ? formatBeijingDateTimeFull(order.submittedAt) : "—"}
          </span>
          {order.status === "PENDING" && (
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction("APPROVED")}
                className="rounded-full bg-green-600 px-3 py-1 text-[11px] font-medium text-white whitespace-nowrap hover:bg-green-700 disabled:opacity-50"
              >
                批准
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction("REJECTED")}
                className="rounded-full bg-red-500 px-3 py-1 text-[11px] font-medium text-white whitespace-nowrap hover:bg-red-600 disabled:opacity-50"
              >
                驳回
              </button>
            </div>
          )}
          {order.status === "APPROVED" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction("COMPLETED")}
              className="rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-medium text-white whitespace-nowrap hover:bg-emerald-700 disabled:opacity-50"
            >
              标记完成
            </button>
          )}
        </div>
      </div>

      {expanded && lines.length > 0 && (
        <div className="mt-1 rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)]/60 px-3 py-2 space-y-3">
          <div className="text-[11px] font-semibold text-[var(--twin-body)]">订单明细（按 AUP）</div>
          {aupGroups.map((group) => (
            <div key={group.key} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-sky-700">{group.label}</span>
                <span className="text-[10px] text-[var(--twin-mute)]">{group.lines.length} 行</span>
              </div>
              <div className="space-y-1.5 pl-2 border-l-2 border-sky-200/80">
                {group.lines.map((line) => {
                  const spec = formatSpecSelections(line.specSelections);
                  return (
                    <div
                      key={line.id}
                      className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-2.5 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="text-sm font-medium text-[var(--twin-ink)] truncate">
                            {lineItemLabel(line)}
                          </div>
                          {spec && (
                            <div className="text-[11px] text-[var(--twin-mute)] truncate">{spec}</div>
                          )}
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--twin-mute)]">
                            {line.addedBy && (
                              <span>加购人 · {(line.addedByName || "").trim() || line.addedBy}</span>
                            )}
                            {line.aupRecordId != null && (
                              <span className="font-mono">aup_record_id={line.aupRecordId}</span>
                            )}
                          </div>
                          {line.lineRemark && (
                            <div className="text-[10px] text-amber-700/90 truncate">
                              包备注：{line.lineRemark}
                            </div>
                          )}
                        </div>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--twin-ink)]">
                          ×{line.quantity}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
