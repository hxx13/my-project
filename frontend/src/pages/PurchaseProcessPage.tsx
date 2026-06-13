import { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import {
  usePurchaseList,
  usePurchaseRecycle,
  useStartPurchase,
  useCompletePurchase,
  useDeletePurchase,
  usePurgePurchaseRecycle,
  usePurgeAllPurchaseRecycle,
  useRestorePurchaseRecycle,
} from "@/api/hooks/usePurchase";
import type { PurchaseOrderRecord } from "@/api/domains/purchase.api";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { WorkorderImageThumb } from "@/components/WorkorderImageThumb";
import { WorkorderNotificationReadButton } from "@/components/WorkorderNotificationReadButton";
import { useWorkorderUnreadFlags } from "@/features/notification/useWorkorderUnreadFlags";
import DataSkeleton from "@/components/ui/DataSkeleton";
import EmptyState from "@/components/ui/EmptyState";

const STATUS_TEXT: Record<string, string> = {
  PENDING: "待处理",
  PROCESSING: "处理中",
  COMPLETED: "已完成",
};

export default function PurchaseProcessPage() {
  const [remark, setRemark] = useState<Record<string, string>>({});
  const [resultImages, setResultImages] = useState<Record<string, string[]>>({});
  const [previewUrl, setPreviewUrl] = useState("");
  const [selectedRecycleIds, setSelectedRecycleIds] = useState<string[]>([]);

  const {
    data: listData,
    isLoading,
  } = usePurchaseList({ page: 1, size: 100, includePrivate: true });

  const { data: recycleData, isLoading: recycleLoading } = usePurchaseRecycle({ page: 1, size: 100 });

  const rows: PurchaseOrderRecord[] = listData?.data ?? [];
  const recycleRows: PurchaseOrderRecord[] = recycleData?.data ?? [];

  const orderIds = rows.map((r) => r.id);
  const { isUnread: isPurchaseNoticeUnread } = useWorkorderUnreadFlags("PURCHASE", orderIds);

  const startMutation = useStartPurchase();
  const completeMutation = useCompletePurchase();
  const deleteMutation = useDeletePurchase();
  const purgeSelectedMutation = usePurgePurchaseRecycle();
  const purgeAllMutation = usePurgeAllPurchaseRecycle();
  const restoreMutation = useRestorePurchaseRecycle();

  const handleStart = (id: string) => {
    startMutation.mutate(id);
  };

  const handleUpload = async (id: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const urls = await Promise.all(Array.from(files).map(async (f) => (await uploadSingleImage(f)).publicUrl));
      setResultImages((prev) => ({ ...prev, [id]: [...(prev[id] || []), ...urls] }));
      toast.success(`已上传 ${urls.length} 张处理图片`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传失败");
    }
  };

  const handleComplete = (id: string) => {
    completeMutation.mutate({
      id,
      payload: {
        resultRemark: remark[id] || "",
        resultImages: resultImages[id] || [],
      },
    });
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("确认删除该订单吗？将同步删除相关图片，且不可恢复。")) return;
    deleteMutation.mutate(id);
  };

  const handlePurgeSelected = () => {
    if (selectedRecycleIds.length === 0) return toast.error("请先勾选回收站订单");
    if (!window.confirm(`确认彻底删除 ${selectedRecycleIds.length} 条回收站订单吗？`)) return;
    purgeSelectedMutation.mutate(selectedRecycleIds, {
      onSuccess: () => setSelectedRecycleIds([]),
    });
  };

  const handlePurgeAll = () => {
    if (!window.confirm("确认一键清空回收站吗？")) return;
    purgeAllMutation.mutate(undefined, {
      onSuccess: () => setSelectedRecycleIds([]),
    });
  };

  const handleRestore = (id: string) => {
    restoreMutation.mutate(id, {
      onSuccess: () => setSelectedRecycleIds((prev) => prev.filter((item) => item !== id)),
    });
  };

  return (
    <div className="p-6">
      <section className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-5 shadow-twin-level-2">
        <h2 className="text-lg font-semibold text-[var(--twin-ink)] mb-4">采购处理台</h2>
        {isLoading ? (
          <DataSkeleton variant="table" rows={4} />
        ) : rows.length === 0 ? (
          <EmptyState title="暂无工单" description="当前没有待处理的采购工单" />
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between">
                  <div className="font-medium text-[var(--twin-ink)]">{row.location}</div>
                  <div className="flex items-center gap-2">
                    <WorkorderNotificationReadButton
                      bizType="PURCHASE"
                      bizId={row.id}
                      unreadOverride={isPurchaseNoticeUnread(row.id)}
                    />
                    <div className="text-sm text-[var(--twin-body)]">{STATUS_TEXT[row.status]}</div>
                  </div>
                </div>
                <div className="text-sm text-[var(--twin-body)]">{row.content}</div>
                {row.requestImages?.length > 0 && (
                  <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
                    {row.requestImages.map((url) => (
                      <WorkorderImageThumb key={url} url={url} alt="申请图片" onPreview={setPreviewUrl} />
                    ))}
                  </div>
                )}
                {row.resultImages?.length > 0 && (
                  <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
                    {row.resultImages.map((url) => (
                      <WorkorderImageThumb key={url} url={url} alt="处理图片" onPreview={setPreviewUrl} />
                    ))}
                  </div>
                )}
                <div className="text-xs text-[var(--twin-mute)]">
                  申请人：{(row.applicantName && row.applicantName.trim()) || row.applicantId}
                  {(row.processorName && row.processorName.trim()) || row.processorId
                    ? ` | 处理人：${(row.processorName && row.processorName.trim()) || row.processorId}`
                    : ""}{" "}
                  | 提交：{row.createTime || "-"} | 开始：{row.startTime || "-"} | 完成：{row.finishTime || "-"}
                </div>
                {row.status === "PENDING" && (
                  <button
                    className="rounded bg-indigo-600 px-3 py-1 text-white text-sm disabled:opacity-50"
                    disabled={startMutation.isPending}
                    onClick={() => handleStart(row.id)}
                  >
                    接单处理
                  </button>
                )}
                {row.status === "PROCESSING" && (
                  <div className="space-y-2">
                    <textarea
                      className="w-full rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-sm text-[var(--twin-ink)] min-h-20 bg-[var(--twin-canvas)] placeholder:text-[var(--twin-mute)]"
                      placeholder="处理备注"
                      value={remark[row.id] || ""}
                      onChange={(e) => setRemark((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="file" multiple accept="image/*" onChange={(e) => handleUpload(row.id, e.target.files)} />
                      <span className="text-xs text-[var(--twin-mute)]">已上传 {(resultImages[row.id] || []).length} 张</span>
                    </div>
                    {(resultImages[row.id] || []).length > 0 && (
                      <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
                        {(resultImages[row.id] || []).map((url) => (
                          <WorkorderImageThumb key={url} url={url} alt="待提交处理图片" onPreview={setPreviewUrl} />
                        ))}
                      </div>
                    )}
                    <button
                      className="rounded bg-emerald-600 px-3 py-1 text-white text-sm disabled:opacity-50"
                      disabled={completeMutation.isPending}
                      onClick={() => handleComplete(row.id)}
                    >
                      完成处理
                    </button>
                  </div>
                )}
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className="rounded bg-rose-600 px-3 py-1 text-xs text-white disabled:opacity-50"
                    disabled={deleteMutation.isPending}
                    onClick={() => handleDelete(row.id)}
                  >
                    删除订单
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-4 rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-5 shadow-twin-level-2">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-[var(--twin-ink)]">回收站（7天后自动清空）</h3>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded border border-rose-300 px-3 py-1 text-xs text-rose-700 disabled:opacity-50"
              disabled={purgeSelectedMutation.isPending}
              onClick={handlePurgeSelected}
            >
              选择性彻底删除
            </button>
            <button
              type="button"
              className="rounded bg-rose-600 px-3 py-1 text-xs text-white disabled:opacity-50"
              disabled={purgeAllMutation.isPending}
              onClick={handlePurgeAll}
            >
              一键清空
            </button>
          </div>
        </div>
        {recycleLoading ? (
          <DataSkeleton variant="table" rows={3} />
        ) : recycleRows.length === 0 ? (
          <EmptyState title="回收站为空" />
        ) : (
          <div className="space-y-2">
            {recycleRows.map((row) => (
              <div key={row.id} className="flex items-center justify-between rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-sm">
                <span className="text-[var(--twin-body)]">{row.location}（{row.status}）</span>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={selectedRecycleIds.includes(row.id)}
                    onChange={(e) =>
                      setSelectedRecycleIds((prev) =>
                        e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id)
                      )
                    }
                  />
                  <button
                    type="button"
                    className="rounded border border-emerald-300 px-2 py-0.5 text-emerald-700 disabled:opacity-50"
                    disabled={restoreMutation.isPending}
                    onClick={() => handleRestore(row.id)}
                  >
                    恢复
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {previewUrl &&
        createPortal(
          <div
            className="fixed inset-0 top-16 z-[1200] bg-black/70 flex items-center justify-center p-4"
            onClick={() => setPreviewUrl("")}
          >
            <img
              src={previewUrl}
              alt="预览图片"
              className="max-h-[90vh] max-w-[90vw] rounded-lg border border-white/20 object-contain"
            />
          </div>,
          document.body,
        )}
    </div>
  );
}
