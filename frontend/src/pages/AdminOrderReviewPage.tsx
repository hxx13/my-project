import { useMemo, useState } from "react";
import { useAllOrders, useUpdateOrderStatus } from "@/api/hooks/useReferenceData";
import { exportOrderReviewExcel } from "@/api/domains/referenceData.api";
import type { RefOrder, RefOrderLine } from "@/api/domains/referenceData.api";
import DataSkeleton from "@/components/ui/DataSkeleton";
import { formatBeijingDateTimeFull } from "@/utils/beijingTime";
import { ANIMAL_ORDER_CAMPUSES, type AnimalOrderCampus } from "@/features/reference-data/campus";

import { appConfirm } from "@/lib/appDialog";
import { toast } from "react-hot-toast";
const STATUS_LABELS: Record<string, string> = {
  PENDING: "待处理",
  APPROVED: "已批准",
  REJECTED: "已驳回",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
};

type Tab = "pending" | "done";

function statusTone(s: string): "pending" | "ok" | "bad" | "none" {
  if (s === "PENDING") return "pending";
  if (s === "APPROVED" || s === "COMPLETED") return "ok";
  if (s === "REJECTED") return "bad";
  return "none";
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

const chipCls = "rounded-md bg-[var(--app-color-surface-hover)] px-1.5 py-0.5 text-[10px] text-[var(--app-color-text-secondary)]";

export default function AdminOrderReviewPage() {
  const [campus, setCampus] = useState<AnimalOrderCampus>("浦东");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const { data, isLoading, refetch, isFetching } = useAllOrders(1, 200, campus, from || undefined, to || undefined);
  const [tab, setTab] = useState<Tab>("pending");
  const [view, setView] = useState<"card" | "table">("card");
  const [exporting, setExporting] = useState(false);
  const updateStatus = useUpdateOrderStatus();

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportOrderReviewExcel({
        campus,
        from: from || undefined,
        to: to || undefined,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `animal-order-review-${from || "all"}_${to || "now"}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("已导出");
    } catch {
      toast.error("导出失败");
    } finally {
      setExporting(false);
    }
  };

  const orders = data?.list ?? [];
  const pendingOrders = useMemo(() => orders.filter((o) => o.status === "PENDING"), [orders]);
  const doneOrders = useMemo(() => orders.filter((o) => o.status !== "PENDING"), [orders]);
  const list = tab === "pending" ? pendingOrders : doneOrders;

  return (
    <div className="flex h-[calc(100dvh-var(--admin-chrome-offset))] max-h-[calc(100dvh-var(--admin-chrome-offset))] min-h-0 flex-col gap-2">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] shadow-twin-level-2">
        {/* 工具栏：对齐 animal-order 胶囊 tabs，无大标题 */}
        <div className="flex shrink-0 items-center gap-2 bg-[var(--twin-canvas)] px-3 py-2 overflow-visible">
          <div className="review-tabs shrink-0">
            {([
              ["pending", `新订单 (${pendingOrders.length})`],
              ["done", `已完成 (${doneOrders.length})`],
            ] as [Tab, string][]).map(([k, v]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className="review-tab"
                data-active={tab === k}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="mx-1 h-4 w-px shrink-0 bg-[var(--app-color-border-default)]" />
          <div className="review-tabs shrink-0">
            {ANIMAL_ORDER_CAMPUSES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCampus(c)}
                className="review-tab"
                data-active={campus === c}
              >
                {c}校区
              </button>
            ))}
          </div>
          <div className="mx-1 h-4 w-px shrink-0 bg-[var(--app-color-border-default)]" />
          <div className="review-tabs shrink-0">
            {([["card", "卡片"], ["table", "表格"]] as ["card" | "table", string][]).map(([k, v]) => (
              <button
                key={k}
                type="button"
                onClick={() => setView(k)}
                className="review-tab"
                data-active={view === k}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="mx-1 h-4 w-px shrink-0 bg-[var(--app-color-border-default)]" />
          <label className="flex items-center gap-1 text-xs text-[var(--app-color-text-secondary)]">
            时间
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded border border-[var(--app-color-border-default)] bg-[var(--twin-canvas)] px-1.5 py-1 text-xs"
            />
            <span>~</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded border border-[var(--app-color-border-default)] bg-[var(--twin-canvas)] px-1.5 py-1 text-xs"
            />
            {(from || to) && (
              <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="text-xs text-[var(--twin-link)] hover:underline">
                清除
              </button>
            )}
          </label>
          <div className="flex-1 min-w-0" />
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={exporting}
            className="rounded-lg border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs text-[var(--app-color-text-secondary)] transition-colors hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50"
          >
            {exporting ? "导出中…" : "导出 Excel"}
          </button>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="rounded-lg border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs text-[var(--app-color-text-secondary)] transition-colors hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50"
          >
            {isFetching ? "刷新中…" : "刷新"}
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: "none" }}>
          {isLoading ? (
            <DataSkeleton variant="card" rows={5} />
          ) : list.length === 0 ? (
            <div className="flex min-h-[160px] items-center justify-center rounded-twin-lg border border-dashed border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-sm text-[var(--twin-mute)]">
              {tab === "pending" ? "暂无待处理订单" : "暂无已完成订单"}
            </div>
          ) : view === "table" ? (
            <div className="overflow-auto rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)]">
              <table className="twin-table w-full min-w-max border-collapse text-left text-sm">
                <thead>
                  <tr>
                    <th className="px-3 py-2">单号</th>
                    <th className="px-3 py-2">课题组</th>
                    <th className="px-3 py-2">申领人</th>
                    <th className="px-3 py-2">物品</th>
                    <th className="px-3 py-2">数量</th>
                    <th className="px-3 py-2">AUP</th>
                    <th className="px-3 py-2">状态</th>
                    <th className="px-3 py-2">提交时间</th>
                    <th className="px-3 py-2 text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((order) => {
                    const lines = order.lines ?? [];
                    const totalQty = lines.reduce((sum, l) => sum + (l.quantity ?? 0), 0);
                    return (
                      <tr key={order.id} className="border-b">
                        <td className="px-3 py-2 font-mono text-xs text-[var(--app-color-text-tertiary)]">#{order.id}</td>
                        <td className="px-3 py-2">{order.projectGroupName || "—"}</td>
                        <td className="px-3 py-2">{order.submitterName || "—"}</td>
                        <td className="max-w-[320px] px-3 py-2">
                          {lines.length === 0 ? "—" : (
                            <div className="flex flex-col gap-0.5">
                              {lines.map((l) => (
                                <span key={l.id} className="truncate">
                                  {lineItemLabel(l)} × {l.quantity ?? 0}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{totalQty}</td>
                        <td className="px-3 py-2 text-xs">{order.registerNo || (order.aupRecordId != null ? `AUP#${order.aupRecordId}` : "—")}</td>
                        <td className="px-3 py-2">
                          <span className="review-status">{STATUS_LABELS[order.status] || order.status}</span>
                        </td>
                        <td className="px-3 py-2 text-xs text-[var(--app-color-text-tertiary)]">
                          {formatBeijingDateTimeFull(order.submittedAt || order.createdAt)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1.5">
                            {order.status === "PENDING" ? (
                              <>
                                <button
                                  type="button"
                                  disabled={updateStatus.isPending}
                                  onClick={async () => {
                                    if (!await appConfirm(`确定批准订单 #${order.id}？将整单生效。`)) return;
                                    updateStatus.mutate({ id: order.id, status: "APPROVED" });
                                  }}
                                  className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs text-white disabled:opacity-50"
                                >
                                  批准
                                </button>
                                <button
                                  type="button"
                                  disabled={updateStatus.isPending}
                                  onClick={async () => {
                                    if (!await appConfirm(`确定驳回订单 #${order.id}？将整单生效。`)) return;
                                    updateStatus.mutate({ id: order.id, status: "REJECTED" });
                                  }}
                                  className="rounded-md border border-rose-300 px-2.5 py-1 text-xs text-rose-600 disabled:opacity-50"
                                >
                                  驳回
                                </button>
                              </>
                            ) : order.status === "APPROVED" ? (
                              <button
                                type="button"
                                disabled={updateStatus.isPending}
                                onClick={async () => {
                                  if (!await appConfirm(`确定标记订单 #${order.id} 为已完成？`)) return;
                                  updateStatus.mutate({ id: order.id, status: "COMPLETED" });
                                }}
                                className="rounded-md border border-[var(--app-color-border-default)] px-2.5 py-1 text-xs disabled:opacity-50"
                              >
                                标记完成
                              </button>
                            ) : (
                              <span className="text-xs text-[var(--twin-mute)]">—</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-2.5">
              {list.map((order) => (
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
              ))}
            </div>
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
    <div className="review-card flex flex-col gap-2 p-3" data-tone={statusTone(order.status)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
          <span className="text-[11px] font-mono tabular-nums text-[var(--app-color-text-tertiary)] shrink-0">#{order.id}</span>
          <span className="review-status">{statusLabel}</span>
          {aupCount > 1 ? (
            <span className={chipCls}>多 AUP · {aupCount}</span>
          ) : headerAup ? (
            <span className={`${chipCls} max-w-[180px] truncate`}>{headerAup}</span>
          ) : null}
          <span className="text-[11px] text-[var(--app-color-text-tertiary)]">{lines.length} 项</span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[10px] text-[var(--app-color-text-tertiary)] transition-colors hover:text-[var(--app-color-text-primary)] shrink-0"
        >
          {expanded ? "收起明细 ▲" : "展开明细 ▼"}
        </button>
      </div>

      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-[var(--app-color-text-primary)]">
              {order.submitterName || order.submitterId || "未知提交人"}
            </span>
            {(order.projectGroupName || order.groupId) && (
              <span className="rounded-md bg-[var(--app-color-surface-hover)] px-1.5 py-0.5 text-[11px] text-[var(--app-color-text-secondary)]">
                {order.projectGroupName || order.groupId}
              </span>
            )}
          </div>

          {!expanded && (
            <div className="space-y-0.5">
              {lines.slice(0, 3).map((line) => (
                <div key={line.id} className="flex items-center gap-2 text-xs min-w-0">
                  <span className="text-[var(--app-color-text-secondary)] truncate">{lineItemLabel(line)}</span>
                  <span className="shrink-0 text-[10px] text-[var(--app-color-text-tertiary)]">{lineAupLabel(line)}</span>
                  <span className="shrink-0 tabular-nums text-[var(--app-color-text-tertiary)]">×{line.quantity}</span>
                </div>
              ))}
              {lines.length > 3 && (
                <div className="text-[10px] text-[var(--app-color-text-tertiary)]">另有 {lines.length - 3} 项…</div>
              )}
              {lines.length === 0 && (
                <div className="text-[11px] text-[var(--app-color-text-tertiary)]">暂无明细行</div>
              )}
            </div>
          )}

          {order.submitRemark && (
            <div className="text-[11px] text-[var(--app-color-text-secondary)]">
              <span className="text-[var(--app-color-text-tertiary)]">提交备注：</span>
              {order.submitRemark}
            </div>
          )}
        </div>

        <div className="shrink-0 flex flex-col items-end gap-1.5 min-w-[120px]">
          <span className="text-[11px] tabular-nums text-right text-[var(--app-color-text-tertiary)]">
            {order.submittedAt ? formatBeijingDateTimeFull(order.submittedAt) : "—"}
          </span>
          {order.status === "PENDING" && (
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction("REJECTED")}
                className="review-btn review-btn--reject disabled:opacity-50"
              >
                驳回
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onAction("APPROVED")}
                className="review-btn review-btn--approve disabled:opacity-50"
              >
                批准
              </button>
            </div>
          )}
          {order.status === "APPROVED" && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onAction("COMPLETED")}
              className="review-btn review-btn--approve disabled:opacity-50"
            >
              标记完成
            </button>
          )}
        </div>
      </div>

      {expanded && lines.length > 0 && (
        <div className="mt-1 space-y-3 rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-hover)]/40 px-3 py-2">
          <div className="text-[11px] font-semibold text-[var(--app-color-text-secondary)]">订单明细（按 AUP）</div>
          {aupGroups.map((group) => (
            <div key={group.key} className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold text-[var(--app-color-text-primary)]">{group.label}</span>
                <span className="text-[10px] text-[var(--app-color-text-tertiary)]">{group.lines.length} 行</span>
              </div>
              <div className="space-y-1.5 border-l-2 border-[var(--app-color-border-default)] pl-2">
                {group.lines.map((line) => {
                  const spec = formatSpecSelections(line.specSelections);
                  return (
                    <div
                      key={line.id}
                      className="rounded-lg border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] px-2.5 py-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <div className="truncate text-sm font-medium text-[var(--app-color-text-primary)]">
                            {lineItemLabel(line)}
                          </div>
                          {spec && (
                            <div className="truncate text-[11px] text-[var(--app-color-text-tertiary)]">{spec}</div>
                          )}
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-[var(--app-color-text-tertiary)]">
                            {line.addedBy && (
                              <span>加购人 · {(line.addedByName || "").trim() || line.addedBy}</span>
                            )}
                            {line.aupRecordId != null && (
                              <span className="font-mono">aup_record_id={line.aupRecordId}</span>
                            )}
                          </div>
                          {line.lineRemark && (
                            <div className="truncate text-[10px] text-[var(--app-color-feedback-warning)]">
                              包备注：{line.lineRemark}
                            </div>
                          )}
                        </div>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--app-color-text-primary)]">
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
