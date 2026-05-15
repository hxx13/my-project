import { useEffect, useState } from "react";
import { toast } from "react-hot-toast";
import { completeRepairOrder, deleteRepairOrder, fetchRepairOrders, fetchRepairRecycle, purgeAllRepairRecycle, purgeRepairRecycleByIds, restoreRepairRecycle, startRepairOrder, type RepairOrderRecord } from "@/api/domains/repair.api";
import { uploadSingleImage } from "@/api/domains/upload.api";
import { WorkorderImageThumb } from "@/components/WorkorderImageThumb";

const STATUS_TEXT: Record<string, string> = {
  PENDING: "待处理",
  PROCESSING: "处理中",
  COMPLETED: "已完成",
};

export default function RepairProcessPage() {
  const [rows, setRows] = useState<RepairOrderRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [remark, setRemark] = useState<Record<string, string>>({});
  const [resultImages, setResultImages] = useState<Record<string, string[]>>({});
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [recycleRows, setRecycleRows] = useState<RepairOrderRecord[]>([]);
  const [selectedRecycleIds, setSelectedRecycleIds] = useState<string[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await fetchRepairOrders({ page: 1, size: 100, includePrivate: true });
      setRows(res.data);
      const recycle = await fetchRepairRecycle({ page: 1, size: 100 });
      setRecycleRows(recycle.data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  };

  const handlePurgeSelected = async () => {
    if (selectedRecycleIds.length === 0) return toast.error("请先勾选回收站订单");
    if (!window.confirm(`确认彻底删除 ${selectedRecycleIds.length} 条回收站订单吗？`)) return;
    await purgeRepairRecycleByIds(selectedRecycleIds);
    setSelectedRecycleIds([]);
    toast.success("已彻底删除");
    await loadData();
  };

  const handlePurgeAll = async () => {
    if (!window.confirm("确认一键清空回收站吗？")) return;
    await purgeAllRepairRecycle();
    setSelectedRecycleIds([]);
    toast.success("回收站已清空");
    await loadData();
  };

  const handleRestore = async (id: string) => {
    try {
      await restoreRepairRecycle(id);
      setSelectedRecycleIds((prev) => prev.filter((item) => item !== id));
      toast.success("已恢复订单");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "恢复失败");
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStart = async (id: string) => {
    try {
      await startRepairOrder(id);
      toast.success("已接单");
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "接单失败");
    }
  };

  const handleUpload = async (id: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    try {
      const urls = await Promise.all(Array.from(files).map((f) => uploadSingleImage(f)));
      setResultImages((prev) => ({ ...prev, [id]: [...(prev[id] || []), ...urls] }));
      toast.success(`已上传 ${urls.length} 张处理图片`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "上传失败");
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await completeRepairOrder(id, {
        resultRemark: remark[id] || "",
        resultImages: resultImages[id] || [],
      });
      toast.success("已完成处理");
      loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "处理失败");
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("确认删除该订单吗？将同步删除相关图片，且不可恢复。")) return;
    try {
      await deleteRepairOrder(id);
      toast.success("已删除订单");
      await loadData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    }
  };

  return (
    <div className="p-6">
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="text-lg font-semibold mb-4">报修处理台</h2>
        {loading ? (
          <div className="text-sm text-slate-500">加载中...</div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <div key={row.id} className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="flex flex-wrap items-center justify-between">
                  <div className="font-medium">{row.location}</div>
                  <div className="text-sm text-slate-600">{STATUS_TEXT[row.status]}</div>
                </div>
                <div className="text-sm text-slate-700">{row.content}</div>
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
                <div className="text-xs text-slate-500">
                  申请人：{(row.applicantName && row.applicantName.trim()) || row.applicantId}
                  {(row.processorName && row.processorName.trim()) || row.processorId
                    ? ` | 处理人：${(row.processorName && row.processorName.trim()) || row.processorId}`
                    : ""}{" "}
                  | 提交：{row.createTime || "-"} | 开始：{row.startTime || "-"} | 完成：{row.finishTime || "-"}
                </div>
                {row.status === "PENDING" && (
                  <button className="rounded bg-indigo-600 px-3 py-1 text-white text-sm" onClick={() => handleStart(row.id)}>
                    接单处理
                  </button>
                )}
                {row.status === "PROCESSING" && (
                  <div className="space-y-2">
                    <textarea
                      className="w-full rounded border border-slate-300 px-2 py-1 text-sm min-h-20"
                      placeholder="处理备注"
                      value={remark[row.id] || ""}
                      onChange={(e) => setRemark((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="file" multiple accept="image/*" onChange={(e) => handleUpload(row.id, e.target.files)} />
                      <span className="text-xs text-slate-500">已上传 {(resultImages[row.id] || []).length} 张</span>
                    </div>
                    {(resultImages[row.id] || []).length > 0 && (
                      <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
                        {(resultImages[row.id] || []).map((url) => (
                          <WorkorderImageThumb key={url} url={url} alt="待提交处理图片" onPreview={setPreviewUrl} />
                        ))}
                      </div>
                    )}
                    <button className="rounded bg-emerald-600 px-3 py-1 text-white text-sm" onClick={() => handleComplete(row.id)}>
                      完成处理
                    </button>
                  </div>
                )}
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className="rounded bg-rose-600 px-3 py-1 text-xs text-white"
                    onClick={() => handleDelete(row.id)}
                  >
                    删除订单
                  </button>
                </div>
              </div>
            ))}
            {rows.length === 0 && <div className="text-sm text-slate-500">暂无工单</div>}
          </div>
        )}
      </section>
      <section className="mt-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold">回收站（7天后自动清空）</h3>
          <div className="flex gap-2">
            <button type="button" className="rounded border border-rose-300 px-3 py-1 text-xs text-rose-700" onClick={handlePurgeSelected}>选择性彻底删除</button>
            <button type="button" className="rounded bg-rose-600 px-3 py-1 text-xs text-white" onClick={handlePurgeAll}>一键清空</button>
          </div>
        </div>
        <div className="space-y-2">
          {recycleRows.map((row) => (
            <div key={row.id} className="flex items-center justify-between rounded border border-slate-200 px-3 py-2 text-sm">
              <span>{row.location}（{row.status}）</span>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedRecycleIds.includes(row.id)}
                  onChange={(e) => setSelectedRecycleIds((prev) => e.target.checked ? [...prev, row.id] : prev.filter((id) => id !== row.id))}
                />
                <button type="button" className="rounded border border-emerald-300 px-2 py-0.5 text-emerald-700" onClick={() => handleRestore(row.id)}>
                  恢复
                </button>
              </div>
            </div>
          ))}
          {recycleRows.length === 0 && <div className="text-sm text-slate-500">回收站为空</div>}
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
