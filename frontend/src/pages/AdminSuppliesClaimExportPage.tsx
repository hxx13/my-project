/**
 * 单张领用单：明细预览 + 导出 Excel（与小程序 suppliesClaimExport 一致）。
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { downloadPersonalClaimExcel, fetchSupplyClaimDetail, type SupplyClaimOrder } from "@/api/domains/supplies.api";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "待出库",
  FULFILLED: "已完成",
  WITHDRAWN: "已撤回",
  CLOSED: "已关闭",
  DELETED: "已删除",
};

export default function AdminSuppliesClaimExportPage() {
  const [searchParams] = useSearchParams();
  const claimId = (searchParams.get("claimId") || "").trim();
  const [detail, setDetail] = useState<SupplyClaimOrder | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!claimId) return;
    setLoading(true);
    try {
      const d = await fetchSupplyClaimDetail(claimId);
      setDetail(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载失败");
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }, [claimId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onExport = async () => {
    if (!claimId || exporting) return;
    setExporting(true);
    try {
      const blob = await downloadPersonalClaimExcel(claimId);
      downloadBlob(blob, `supply-claim-${claimId}.xlsx`);
      toast.success("已下载 Excel");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导出失败");
    } finally {
      setExporting(false);
    }
  };

  if (!claimId) {
    return (
      <div className="space-y-4">
        <AdminSubPageHeader
          fallbackTo="/admin/supplies/mine"
          backLabel="返回我的记录"
          title="领用单导出"
          description="缺少领用单参数。"
        />
        <p className="text-sm text-neutral-600">
          请在 URL 中提供 <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-xs">claimId</code>
          ，或从
          <Link className="ml-1 font-medium text-[#0070f3] underline underline-offset-2 hover:text-neutral-900" to="/admin/supplies/mine">
            我的记录
          </Link>
          打开「导出/预览」。
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <AdminSubPageHeader
        fallbackTo="/admin/supplies/mine"
        backLabel="返回我的记录"
        title="领用单导出 / 预览"
        description="查看明细行并导出 Excel；与小程序 suppliesClaimExport 一致。"
      />
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
        <span className="text-slate-500">领用单 </span>
        <span className="font-mono text-slate-900">{claimId}</span>
        {detail ? (
          <span className="ml-2 text-slate-500">
            · {STATUS_LABEL[String(detail.status || "").toUpperCase()] || detail.status}
          </span>
        ) : null}
      </div>
      {loading ? <div className="text-sm text-slate-500">加载中…</div> : null}
      {detail ? (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="border-b border-slate-200 px-3 py-2">物品</th>
                <th className="border-b border-slate-200 px-3 py-2">申请</th>
                <th className="border-b border-slate-200 px-3 py-2">实发</th>
              </tr>
            </thead>
            <tbody>
              {(detail.lines || []).map((line) => (
                <tr key={line.id}>
                  <td className="border-b border-slate-100 px-3 py-2">{line.snapshotName}</td>
                  <td className="border-b border-slate-100 px-3 py-2">{line.qty}</td>
                  <td className="border-b border-slate-100 px-3 py-2">{line.fulfilledQty ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !loading ? (
        <div className="text-sm text-slate-500">暂无数据</div>
      ) : null}
      <button
        type="button"
        disabled={!detail || exporting}
        className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm disabled:opacity-50"
        onClick={() => void onExport()}
      >
        {exporting ? "导出中…" : "导出 Excel"}
      </button>
    </div>
  );
}
