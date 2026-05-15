import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { lockAsset, searchAssets, submitTransferRequest, type AssetRow } from "@/api/domains/asset.api";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => Promise<void> | void;
  initialAsset?: AssetRow | null;
}

export default function AssetTransferApplyModal({ open, onClose, onSuccess, initialAsset }: Props) {
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<Array<Pick<AssetRow, "id" | "assetCode" | "assetName" | "location" | "status" | "locked">>>([]);
  const [selected, setSelected] = useState<Pick<AssetRow, "id" | "assetCode" | "assetName" | "location" | "status" | "locked"> | null>(initialAsset || null);
  const [transferTime, setTransferTime] = useState("");
  const [transferLocation, setTransferLocation] = useState("");
  const [remark, setRemark] = useState("");
  const [photosBeforeLines, setPhotosBeforeLines] = useState("");
  const [photosAfterLines, setPhotosAfterLines] = useState("");
  const [loading, setLoading] = useState(false);

  const title = useMemo(() => (selected ? `${selected.assetName} (${selected.assetCode})` : ""), [selected]);

  const resetForm = (nextSelected?: Pick<AssetRow, "id" | "assetCode" | "assetName" | "location" | "status" | "locked"> | null) => {
    setKeyword("");
    setResults([]);
    setSelected(nextSelected ?? null);
    setTransferTime("");
    setTransferLocation(nextSelected?.location || "");
    setRemark("");
    setPhotosBeforeLines("");
    setPhotosAfterLines("");
  };

  useEffect(() => {
    if (!open) return;
    resetForm(initialAsset || null);
  }, [open, initialAsset]);

  if (!open) return null;

  const handleClose = () => {
    resetForm(null);
    onClose();
  };

  const doSearch = async () => {
    const key = keyword.trim();
    if (!key) {
      setResults([]);
      return;
    }
    setLoading(true);
    try {
      const rows = await searchAssets(key, 15);
      setResults(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "检索失败");
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    if (!selected) {
      toast.error("请先选择资产");
      return;
    }
    if (!transferTime.trim() || !transferLocation.trim()) {
      toast.error("请填写转移时间和地点");
      return;
    }
    const splitUrls = (text: string) =>
      text
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
    const before = splitUrls(photosBeforeLines);
    const after = splitUrls(photosAfterLines);
    setLoading(true);
    try {
      await lockAsset(selected.id);
      await submitTransferRequest({
        assetId: selected.id,
        transferTime: transferTime.trim(),
        transferLocation: transferLocation.trim(),
        remark: remark.trim() || undefined,
        photoUrlsBefore: before.length ? before : undefined,
        photoUrlsAfter: after.length ? after : undefined,
      });
      toast.success("申请转移已提交");
      await onSuccess();
      handleClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "提交失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-3xl rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">申请转移</h3>
          <button className="rounded border border-slate-200 px-3 py-1 text-sm text-slate-600 hover:bg-slate-50" onClick={handleClose}>
            关闭
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              搜索资产（二次封装接口）
              <div className="flex gap-2">
                <input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void doSearch()}
                  className="flex-1 rounded border border-slate-300 px-3 py-2"
                  placeholder="输入资产编码/名称/存放地点"
                />
                <button onClick={() => void doSearch()} className="rounded bg-blue-600 px-3 py-2 text-sm text-white">
                  检索
                </button>
              </div>
            </label>
            <div className="max-h-44 overflow-y-auto rounded border border-slate-200">
              {results.map((it) => (
                <button
                  key={it.id}
                  onClick={() => {
                    setSelected(it);
                    if (!transferLocation && it.location) setTransferLocation(it.location);
                  }}
                  className={`block w-full border-b border-slate-100 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-slate-50 ${
                    selected?.id === it.id ? "bg-blue-50" : ""
                  }`}
                >
                  <div className="font-medium text-slate-900">{it.assetName}</div>
                  <div className="text-xs text-slate-500">{it.assetCode} · {it.location || "未填存放地点"}</div>
                </button>
              ))}
              {!results.length && <div className="px-3 py-6 text-center text-sm text-slate-500">{loading ? "检索中..." : "暂无结果"}</div>}
            </div>
            <div className="rounded border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <div className="font-medium text-slate-800">已锁定资产</div>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setTransferLocation("");
                  }}
                  className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-50"
                >
                  清空选择
                </button>
              </div>
              <div className="mt-1 text-slate-600">{title}</div>
            </div>
          </div>
          <div className="space-y-3">
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              申请转移时间
              <input type="datetime-local" value={transferTime} onChange={(e) => setTransferTime(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              申请转移地点
              <input value={transferLocation} onChange={(e) => setTransferLocation(e.target.value)} className="rounded border border-slate-300 px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              申请备注
              <textarea value={remark} onChange={(e) => setRemark(e.target.value)} rows={3} className="rounded border border-slate-300 px-3 py-2" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              转移前照片 URL（每行一个，可选）
              <textarea
                value={photosBeforeLines}
                onChange={(e) => setPhotosBeforeLines(e.target.value)}
                rows={3}
                className="rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                placeholder="https://..."
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-700">
              转移后照片 URL（每行一个，可选；未完成前可在转移记录中补充）
              <textarea
                value={photosAfterLines}
                onChange={(e) => setPhotosAfterLines(e.target.value)}
                rows={3}
                className="rounded border border-slate-300 px-3 py-2 font-mono text-xs"
                placeholder="https://..."
              />
            </label>
            <button disabled={loading} onClick={() => void submit()} className="w-full rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
              提交申请转移
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

