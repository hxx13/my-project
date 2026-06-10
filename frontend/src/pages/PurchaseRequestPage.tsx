import { type FormEvent, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "react-hot-toast";
import { usePurchaseList, useCreatePurchase, useWithdrawPurchase } from "@/api/hooks/usePurchase";
import type { PurchaseOrderRecord } from "@/api/domains/purchase.api";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { WorkorderImageThumb } from "@/components/WorkorderImageThumb";
import { WorkorderNotificationReadButton } from "@/components/WorkorderNotificationReadButton";
import { useWorkorderUnreadFlags } from "@/features/notification/useWorkorderUnreadFlags";
import DataSkeleton from "@/components/ui/DataSkeleton";
import EmptyState from "@/components/ui/EmptyState";
import { Button } from "@/components/ui/button";

const STATUS_TEXT: Record<string, string> = {
  PENDING: "待处理",
  PROCESSING: "处理中",
  COMPLETED: "已完成",
};

export default function PurchaseRequestPage() {
  const [location, setLocation] = useState("");
  const [content, setContent] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [size] = useState(10);
  const [previewUrl, setPreviewUrl] = useState("");

  const {
    data: listData,
    isLoading,
    refetch,
  } = usePurchaseList({ page, size, status, dateFrom, dateTo });

  const rows: PurchaseOrderRecord[] = listData?.data ?? [];
  const total = listData?.total ?? 0;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / size)), [total, size]);

  const orderIds = rows.map((r) => r.id);
  const { isUnread: isPurchaseNoticeUnread } = useWorkorderUnreadFlags("PURCHASE", orderIds);

  const createMutation = useCreatePurchase();
  const withdrawMutation = useWithdrawPurchase();

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const urls = await Promise.all(Array.from(files).map((f) => uploadSingleImage(f)));
      setImageUrls((prev) => [...prev, ...urls]);
      toast.success(`已上传 ${urls.length} 张图片`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传失败");
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!location.trim() || !content.trim()) {
      toast.error("请填写申请位置和采购内容");
      return;
    }
    createMutation.mutate(
      { location: location.trim(), content: content.trim(), requestImages: imageUrls, isPublic },
      {
        onSuccess: () => {
          setLocation("");
          setContent("");
          setImageUrls([]);
          setIsPublic(true);
          setPage(1);
        },
      }
    );
  };

  const handleWithdraw = (id: string) => {
    if (!window.confirm("确认撤回该订单吗？处理中和已处理订单不可撤回。")) return;
    withdrawMutation.mutate(id);
  };

  const handleQuery = () => {
    setPage(1);
    void refetch();
  };

  return (
    <div className="p-6 space-y-6">
      <section className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-5 shadow-twin-level-2">
        <h2 className="text-lg font-semibold text-[var(--twin-ink)] mb-4">新增采购申请</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            className="w-full rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-sm text-[var(--twin-ink)] bg-[var(--twin-canvas)] placeholder:text-[var(--twin-mute)]"
            placeholder="申请位置"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <textarea
            className="w-full rounded-twin-sm border border-[var(--twin-hairline)] px-3 py-2 text-sm text-[var(--twin-ink)] min-h-24 bg-[var(--twin-canvas)] placeholder:text-[var(--twin-mute)]"
            placeholder="采购内容"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <input type="file" multiple accept="image/*" onChange={(e) => handleUpload(e.target.files)} />
            <span className="text-xs text-[var(--twin-mute)]">已上传 {imageUrls.length} 张</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-[var(--twin-body)]">
            <label className="inline-flex items-center gap-1">
              <input type="radio" checked={!isPublic} onChange={() => setIsPublic(false)} />
              个人
            </label>
            <label className="inline-flex items-center gap-1">
              <input type="radio" checked={isPublic} onChange={() => setIsPublic(true)} />
              公开
            </label>
          </div>
          {imageUrls.length > 0 && (
            <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
              {imageUrls.map((url) => (
                <WorkorderImageThumb key={url} url={url} alt="采购图片" onPreview={setPreviewUrl} />
              ))}
            </div>
          )}
          <Button type="submit" disabled={createMutation.isPending}>
            {createMutation.isPending ? "提交中..." : "提交采购申请"}
          </Button>
        </form>
      </section>

      <section className="rounded-twin-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-5 shadow-twin-level-2">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-sm bg-[var(--twin-canvas)] text-[var(--twin-ink)]"
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            <option value="">全部状态</option>
            <option value="PENDING">待处理</option>
            <option value="PROCESSING">处理中</option>
            <option value="COMPLETED">已完成</option>
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-sm bg-[var(--twin-canvas)] text-[var(--twin-ink)]" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-twin-sm border border-[var(--twin-hairline)] px-2 py-1 text-sm bg-[var(--twin-canvas)] text-[var(--twin-ink)]" />
          <Button variant="secondary" size="sm" onClick={handleQuery}>
            查询
          </Button>
        </div>

        {isLoading ? (
          <DataSkeleton variant="table" rows={4} />
        ) : rows.length === 0 ? (
          <EmptyState title="暂无采购记录" description="提交第一条采购单开始使用" />
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="rounded-twin-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
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
                <div className="text-sm text-[var(--twin-body)] mt-1">{row.content}</div>
                {row.requestImages?.length > 0 && (
                  <div className="mt-2 flex flex-nowrap gap-2 overflow-x-auto pb-1">
                    {row.requestImages.map((url) => (
                      <WorkorderImageThumb key={url} url={url} alt="采购图片" onPreview={setPreviewUrl} />
                    ))}
                  </div>
                )}
                {row.resultImages?.length > 0 && (
                  <div className="mt-2 flex flex-nowrap gap-2 overflow-x-auto pb-1">
                    {row.resultImages.map((url) => (
                      <WorkorderImageThumb key={url} url={url} alt="处理结果图片" onPreview={setPreviewUrl} />
                    ))}
                  </div>
                )}
                <div className="mt-2 text-xs text-[var(--twin-mute)]">
                  时间线：提交 {row.createTime || "-"} / 开始 {row.startTime || "-"} / 完成 {row.finishTime || "-"}
                </div>
                <div className="mt-1 text-xs text-[var(--twin-mute)]">
                  可见范围：{row.isPublic === 1 ? "公开" : "个人"}
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={row.status !== "PENDING" || withdrawMutation.isPending}
                    className="rounded bg-amber-600 px-3 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => handleWithdraw(row.id)}
                  >
                    撤回
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-3 flex items-center justify-end gap-2 text-sm text-[var(--twin-body)]">
          <button className="rounded border border-[var(--twin-hairline)] px-2 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
          <span>{page}/{totalPages}</span>
          <button className="rounded border border-[var(--twin-hairline)] px-2 py-1 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</button>
        </div>
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
