import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { toAdminRoutePath } from "@/features/admin/buildAdminNavModel";
import toast from "react-hot-toast";
import { useQuery } from "@tanstack/react-query";
import { downloadPersonalClaimExcel, fetchSupplyClaimDetail } from "@/api/domains/supplies.api";
import type { SupplyClaimOrder } from "@/api/domains/supplies.api";
import { AdminSubPageHeader } from "@/components/admin/AdminSubPageHeader";
import DataSkeleton from "@/components/ui/DataSkeleton";
import EmptyState from "@/components/ui/EmptyState";

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
  const [exporting, setExporting] = useState(false);

  const { data: detail, isLoading } = useQuery({
    queryKey: ["supplyClaimDetail", claimId] as const,
    queryFn: () => fetchSupplyClaimDetail(claimId),
    enabled: !!claimId,
  });

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
        <p className="text-sm text-[var(--twin-body)]">
          请在 URL 中提供 <code className="rounded-twin-sm bg-[var(--twin-canvas-soft)] px-1.5 py-0.5 font-mono text-xs">claimId</code>
          ，或从
          <Link className="ml-1 font-medium text-[var(--twin-link-deep)] underline underline-offset-2" to={toAdminRoutePath("/admin/supplies/mine")}>
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
      <div className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-4 py-3 text-sm text-[var(--twin-body)] shadow-twin-level-1">
        <span className="text-[var(--twin-mute)]">领用单 </span>
        <span className="font-mono text-[var(--twin-ink)]">{claimId}</span>
        {detail ? (
          <span className="ml-2 text-[var(--twin-mute)]">
            · {STATUS_LABEL[String(detail.status || "").toUpperCase()] || detail.status}
          </span>
        ) : null}
      </div>
      {isLoading ? <DataSkeleton variant="table" rows={4} /> : null}
      {detail ? (
        <div className="overflow-hidden rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-1">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-[var(--twin-canvas-soft)] text-[var(--twin-body)]">
              <tr>
                <th className="border-b border-[var(--twin-hairline)] px-3 py-2">物品</th>
                <th className="border-b border-[var(--twin-hairline)] px-3 py-2">申请</th>
                <th className="border-b border-[var(--twin-hairline)] px-3 py-2">实发</th>
                <th className="border-b border-[var(--twin-hairline)] px-3 py-2">备注</th>
              </tr>
            </thead>
            <tbody>
              {(detail.lines || []).map((line) => (
                <tr key={line.id}>
                  <td className="border-b border-[var(--twin-hairline)] px-3 py-2 text-[var(--twin-ink)]">{line.snapshotName}</td>
                  <td className="border-b border-[var(--twin-hairline)] px-3 py-2">{line.qty}</td>
                  <td className="border-b border-[var(--twin-hairline)] px-3 py-2">{line.fulfilledQty ?? 0}</td>
                  <td className="border-b border-[var(--twin-hairline)] px-3 py-2 text-xs text-[var(--twin-mute)]">{line.remark || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : !isLoading ? (
        <EmptyState title="暂无数据" />
      ) : null}
      <button
        type="button"
        disabled={!detail || exporting}
        className="rounded-twin-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-twin-level-1 disabled:opacity-50"
        onClick={() => void onExport()}
      >
        {exporting ? "导出中…" : "导出 Excel"}
      </button>
    </div>
  );
}
