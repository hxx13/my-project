import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { toast } from "react-hot-toast";
import { createRepairOrder, fetchRepairOrders, type RepairOrderRecord, withdrawRepairOrder } from "@/api/domains/repair.api";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { WorkorderImageThumb } from "@/components/WorkorderImageThumb";

const STATUS_TEXT: Record<string, string> = {
  PENDING: "待处理",
  PROCESSING: "处理中",
  COMPLETED: "已完成",
};

export default function RepairRequestPage() {
  const [location, setLocation] = useState("");
  const [content, setContent] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [isPublic, setIsPublic] = useState(true);
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [size] = useState(10);
  const [rows, setRows] = useState<RepairOrderRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");

  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / size)), [total, size]);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchRepairOrders({ page, size, status, dateFrom, dateTo });
      setRows(data.data);
      setTotal(data.total);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, size]);

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
      toast.error("请填写报修位置和内容");
      return;
    }
    setSubmitting(true);
    try {
      await createRepairOrder({
        location: location.trim(),
        content: content.trim(),
        requestImages: imageUrls,
        isPublic,
      });
      toast.success("报修单创建成功");
      setLocation("");
      setContent("");
      setImageUrls([]);
      setIsPublic(true);
      setPage(1);
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleWithdraw = async (id: string) => {
    if (!window.confirm("确认撤回该订单吗？处理中和已处理订单不可撤回。")) return;
    try {
      await withdrawRepairOrder(id);
      toast.success("已撤回");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "撤回失败");
    }
  };

  return (
    <div className="p-6 space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold mb-4">新增报修单</h2>
        <form onSubmit={onSubmit} className="space-y-3">
          <input
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="报修位置"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
          <textarea
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm min-h-24"
            placeholder="报修内容"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <div className="flex flex-wrap items-center gap-3">
            <input type="file" multiple accept="image/*" onChange={(e) => handleUpload(e.target.files)} />
            <span className="text-xs text-slate-500">已上传 {imageUrls.length} 张</span>
          </div>
          <div className="flex items-center gap-4 text-sm">
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
                <WorkorderImageThumb key={url} url={url} alt="报修图片" onPreview={setPreviewUrl} />
              ))}
            </div>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="rounded-lg bg-blue-600 px-4 py-2 text-white disabled:opacity-50"
          >
            {submitting ? "提交中..." : "提交报修"}
          </button>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            className="rounded border border-slate-300 px-2 py-1 text-sm"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">全部状态</option>
            <option value="PENDING">待处理</option>
            <option value="PROCESSING">处理中</option>
            <option value="COMPLETED">已完成</option>
          </select>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm" />
          <button className="rounded bg-slate-800 px-3 py-1 text-white text-sm" onClick={() => { setPage(1); loadData(); }}>
            查询
          </button>
        </div>
        {loading ? (
          <div className="text-sm text-slate-500">加载中...</div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{row.location}</div>
                  <div className="text-sm text-slate-600">{STATUS_TEXT[row.status]}</div>
                </div>
                <div className="text-sm text-slate-700 mt-1">{row.content}</div>
                {row.requestImages?.length > 0 && (
                  <div className="mt-2 flex flex-nowrap gap-2 overflow-x-auto pb-1">
                    {row.requestImages.map((url) => (
                      <WorkorderImageThumb key={url} url={url} alt="报修图片" onPreview={setPreviewUrl} />
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
                <div className="mt-2 text-xs text-slate-500">
                  时间线：提交 {row.createTime || "-"} / 开始 {row.startTime || "-"} / 完成 {row.finishTime || "-"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  可见范围：{row.isPublic === 1 ? "公开" : "个人"}
                </div>
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    disabled={row.status !== "PENDING"}
                    className="rounded bg-amber-600 px-3 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => handleWithdraw(row.id)}
                  >
                    撤回
                  </button>
                </div>
              </div>
            ))}
            {rows.length === 0 && <div className="text-sm text-slate-500">暂无数据</div>}
          </div>
        )}
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <button className="rounded border px-2 py-1 disabled:opacity-40" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</button>
          <span>{page}/{totalPages}</span>
          <button className="rounded border px-2 py-1 disabled:opacity-40" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>下一页</button>
        </div>
      </section>
      {previewUrl && (
        <div
          className="fixed inset-0 z-[1200] bg-black/70 flex items-center justify-center p-4"
          onClick={() => setPreviewUrl("")}
        >
          <img
            src={previewUrl}
            alt="预览图片"
            className="max-h-[90vh] max-w-[90vw] rounded-lg border border-white/20 object-contain"
          />
        </div>
      )}
    </div>
  );
}
