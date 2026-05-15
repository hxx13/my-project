import type { Dispatch, SetStateAction } from "react";
import toast from "react-hot-toast";
import type { PurchaseOrderRecord } from "@/api/domains/purchase.api";
import type { RepairOrderRecord } from "@/api/domains/repair.api";
import type { SupplyClaimLine, SupplyClaimOrder, SupplyClaimPdfLinkItem } from "@/api/domains/supplies.api";
import { formatBeijingDateTimeMedium } from "@/utils/beijingTime";
import { webImageSrc } from "@/utils/mediaUrl";

function claimStatusText(s: string) {
  if (s === "PENDING") return "待出库";
  if (s === "FULFILLED") return "已完成";
  if (s === "WITHDRAWN") return "已撤回";
  return s || "-";
}

function orderStatusText(s: string) {
  if (s === "PENDING") return "待处理";
  if (s === "PROCESSING") return "处理中";
  if (s === "COMPLETED") return "已完成";
  return s || "-";
}

function claimApplicantLabel(o: SupplyClaimOrder) {
  const n = (o.applicantName && o.applicantName.trim()) || "";
  if (n) return n;
  return (o.userId && o.userId.trim()) || "-";
}

function orderApplicantLabel(row: RepairOrderRecord | PurchaseOrderRecord) {
  const n = (row.applicantName && row.applicantName.trim()) || "";
  if (n) return n;
  return (row.applicantId && row.applicantId.trim()) || "-";
}

function isPublicText(n: number | undefined) {
  if (n === 1) return "公开";
  if (n === 0) return "非公开";
  return "";
}

function displayClaimLink(item: SupplyClaimPdfLinkItem) {
  return item.downloadUrl || item.downloadPath;
}

export type WorkOrderInlineModel =
  | { kind: "claim"; order: SupplyClaimOrder }
  | { kind: "repair"; order: RepairOrderRecord }
  | { kind: "purchase"; order: PurchaseOrderRecord };

export type WorkOrderInlineDetailProps = {
  model: WorkOrderInlineModel;
  isAdmin: boolean;
  claimGrantMap: Record<number, boolean>;
  setClaimGrantMap: Dispatch<SetStateAction<Record<number, boolean>>>;
  claimLinks: SupplyClaimPdfLinkItem[];
  claimLinksLoading: boolean;
  fulfilling: boolean;
  onGenerateClaimLink: () => Promise<void>;
  onFulfillClaim: () => Promise<void>;
};

export function WorkOrderInlineDetail({
  model,
  isAdmin,
  claimGrantMap,
  setClaimGrantMap,
  claimLinks,
  claimLinksLoading,
  fulfilling,
  onGenerateClaimLink,
  onFulfillClaim,
}: WorkOrderInlineDetailProps) {
  if (model.kind === "claim") {
    const claimDetail = model.order;
    return (
      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
        <div className="font-semibold text-slate-900">出库处理 · 领用单</div>
        <div className="text-xs text-slate-600">
          状态: {claimStatusText(claimDetail.status)} · 申请人: {claimApplicantLabel(claimDetail)} ·{" "}
          {formatBeijingDateTimeMedium(claimDetail.createdAt)}
        </div>
        <ul className="space-y-2">
          {(claimDetail.lines || []).map((l: SupplyClaimLine) => (
            <li key={l.id} className="flex items-center justify-between rounded border border-slate-100 px-2 py-2">
              <div>
                <div className="font-medium text-slate-900">{l.snapshotName}</div>
                <div className="text-xs text-slate-500">
                  申请 {l.qty} · 已发 {l.fulfilledQty}
                </div>
              </div>
              {isAdmin && claimDetail.status === "PENDING" ? (
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={claimGrantMap[l.id] === true}
                    onChange={(e) => setClaimGrantMap((m) => ({ ...m, [l.id]: e.target.checked }))}
                  />
                  发放
                </label>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="rounded border border-slate-200 p-3 text-xs">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold text-slate-700">PDF下载链接</span>
            <button
              type="button"
              className="rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-emerald-800 disabled:opacity-50"
              disabled={claimLinksLoading}
              onClick={() => void onGenerateClaimLink()}
            >
              {claimLinksLoading ? "处理中…" : "获取下载链接"}
            </button>
          </div>
          {claimLinks.length === 0 ? (
            <div className="text-slate-500">{claimLinksLoading ? "加载中…" : "暂无链接"}</div>
          ) : (
            <div className="space-y-1">
              {claimLinks.map((item) => (
                <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-slate-100 px-2 py-1">
                  <span className="text-slate-600">{item.fileName || "-"}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-0.5"
                      onClick={async () => {
                        await navigator.clipboard.writeText(displayClaimLink(item));
                        toast.success("已复制");
                      }}
                    >
                      复制
                    </button>
                    <a
                      href={displayClaimLink(item)}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded border border-indigo-300 bg-indigo-50 px-2 py-0.5 text-indigo-800"
                    >
                      打开
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {isAdmin && claimDetail.status === "PENDING" ? (
          <button
            type="button"
            disabled={fulfilling}
            className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void onFulfillClaim()}
          >
            {fulfilling ? "提交中…" : "确认出库"}
          </button>
        ) : null}
      </div>
    );
  }

  const workOrderDetail = model.order;
  const modalKind = model.kind;
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm">
      <div className="font-semibold text-slate-900">{modalKind === "repair" ? "报修单" : "采购单"}</div>
      <div className="space-y-2">
        <div>
          <span className="text-slate-500">状态：</span>
          {orderStatusText(workOrderDetail.status)}
        </div>
        <div>
          <span className="text-slate-500">申请人：</span>
          {orderApplicantLabel(workOrderDetail)}
        </div>
        {isPublicText(workOrderDetail.isPublic) ? (
          <div>
            <span className="text-slate-500">可见性：</span>
            {isPublicText(workOrderDetail.isPublic)}
          </div>
        ) : null}
        <div>
          <span className="text-slate-500">地点：</span>
          {workOrderDetail.location || "-"}
        </div>
        <div>
          <span className="text-slate-500">内容：</span>
          <div className="mt-1 whitespace-pre-wrap break-words">{workOrderDetail.content || "-"}</div>
        </div>
        {workOrderDetail.startTime ? (
          <div>
            <span className="text-slate-500">接单时间：</span>
            {formatBeijingDateTimeMedium(workOrderDetail.startTime)}
          </div>
        ) : null}
        {workOrderDetail.finishTime ? (
          <div>
            <span className="text-slate-500">完成时间：</span>
            {formatBeijingDateTimeMedium(workOrderDetail.finishTime)}
          </div>
        ) : null}
        {(workOrderDetail.processorName && workOrderDetail.processorName.trim()) ||
        (workOrderDetail.processorId && workOrderDetail.processorId.trim()) ? (
          <div>
            <span className="text-slate-500">处理人：</span>
            {(workOrderDetail.processorName && workOrderDetail.processorName.trim()) || workOrderDetail.processorId || "-"}
          </div>
        ) : null}
        {workOrderDetail.resultRemark ? (
          <div>
            <span className="text-slate-500">处理说明：</span>
            <div className="mt-1 whitespace-pre-wrap break-words">{workOrderDetail.resultRemark}</div>
          </div>
        ) : null}
      </div>

      {workOrderDetail.requestImages?.some((u) => webImageSrc(u)) ? (
        <div>
          <div className="mb-2 text-xs font-semibold text-slate-800">申请附图</div>
          <div className="flex flex-wrap gap-2">
            {workOrderDetail.requestImages
              .map((u) => webImageSrc(u))
              .filter(Boolean)
              .map((src, i) => (
                <img key={`req-${i}-${src}`} src={src} alt="" className="h-24 w-24 rounded border object-cover" />
              ))}
          </div>
        </div>
      ) : null}
      {workOrderDetail.resultImages?.some((u) => webImageSrc(u)) ? (
        <div>
          <div className="mb-2 text-xs font-semibold text-slate-800">处理附图</div>
          <div className="flex flex-wrap gap-2">
            {workOrderDetail.resultImages
              .map((u) => webImageSrc(u))
              .filter(Boolean)
              .map((src, i) => (
                <img key={`res-${i}-${src}`} src={src} alt="" className="h-24 w-24 rounded border object-cover" />
              ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
