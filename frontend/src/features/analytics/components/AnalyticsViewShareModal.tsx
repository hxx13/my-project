import { useCallback, useEffect, useState } from "react";
import { Copy, RefreshCw, X } from "lucide-react";
import { toast } from "react-hot-toast";
import {
  createAnalyticsViewShare,
  fetchAnalyticsViewShare,
  importAnalyticsViewShare,
  previewAnalyticsViewShare,
  type AnalyticsUserView,
  type AnalyticsViewSharePreview,
  type AnalyticsViewShareStatus,
} from "@/api/domains/analytics.api";

type Mode = "create" | "import";

type Props = {
  mode: Mode;
  open: boolean;
  viewId?: number;
  viewName?: string;
  onClose: () => void;
  onImported?: (view: AnalyticsUserView) => void;
};

function shareMetaFromStatus(s: AnalyticsViewShareStatus) {
  if (!s.active || !s.plainCode || !s.expiresAt) return null;
  return {
    plainCode: s.plainCode,
    auditLogCount: s.auditLogCount ?? 0,
    insightCount: s.insightCount ?? 0,
    expiresAt: s.expiresAt,
    importsRemaining: s.importsRemaining ?? 0,
    maxImports: s.maxImports ?? 0,
  };
}

export function AnalyticsViewShareModal({
  mode,
  open,
  viewId,
  viewName,
  onClose,
  onImported,
}: Props) {
  const [expiresDays, setExpiresDays] = useState(30);
  const [maxImports, setMaxImports] = useState(10);
  const [loadingShare, setLoadingShare] = useState(false);
  const [creating, setCreating] = useState(false);
  const [shareMeta, setShareMeta] = useState<ReturnType<typeof shareMetaFromStatus>>(null);

  const [code, setCode] = useState("");
  const [targetName, setTargetName] = useState("");
  const [preview, setPreview] = useState<AnalyticsViewSharePreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  const loadActiveShare = useCallback(async () => {
    if (!viewId) return;
    setLoadingShare(true);
    try {
      const s = await fetchAnalyticsViewShare(viewId);
      setShareMeta(shareMetaFromStatus(s));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载分享码失败");
    } finally {
      setLoadingShare(false);
    }
  }, [viewId]);

  useEffect(() => {
    if (!open) return;
    setCode("");
    setTargetName("");
    setPreview(null);
    setExpiresDays(30);
    setMaxImports(10);
    if (mode === "create" && viewId) {
      void loadActiveShare();
    } else {
      setShareMeta(null);
    }
  }, [open, mode, viewId, loadActiveShare]);

  if (!open) return null;

  const handleCreateOrRegenerate = async () => {
    if (!viewId) return;
    if (shareMeta && !window.confirm("重新生成将使当前分享码作废，是否继续？")) {
      return;
    }
    setCreating(true);
    try {
      const res = await createAnalyticsViewShare(viewId, { expiresDays, maxImports });
      setShareMeta(shareMetaFromStatus(res));
      toast.success(shareMeta ? "已重新生成分享码，旧码已作废" : "分享码已生成");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "生成失败");
    } finally {
      setCreating(false);
    }
  };

  const handlePreview = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      toast.error("请输入分享码");
      return;
    }
    setPreviewing(true);
    setPreview(null);
    try {
      const p = await previewAnalyticsViewShare(trimmed);
      setPreview(p);
      if (!targetName.trim()) {
        setTargetName(`${p.viewName} (来自 ${p.ownerDisplayName})`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "预览失败");
    } finally {
      setPreviewing(false);
    }
  };

  const handleImport = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      toast.error("请输入分享码");
      return;
    }
    setImporting(true);
    try {
      const res = await importAnalyticsViewShare(trimmed, targetName.trim() || undefined);
      // 保存后仅合并当前行，禁止整表 load — post-save-no-full-refresh.mdc
      onImported?.(res.view);
      toast.success(
        `已导入「${res.view.name}」：${res.importedAuditLogs} 条清算、${res.importedInsights} 条 AI 解读`
      );
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    } finally {
      setImporting(false);
    }
  };

  const copyCode = async () => {
    if (!shareMeta?.plainCode) return;
    try {
      await navigator.clipboard.writeText(shareMeta.plainCode);
      toast.success("已复制分享码");
    } catch {
      toast.error("复制失败，请手动复制");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h3 className="font-semibold text-neutral-900">
            {mode === "create" ? "分享码" : "导入分享码"}
          </h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-neutral-400 hover:bg-neutral-100">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3 px-4 py-4">
          {mode === "create" ? (
            <>
              <p className="text-xs text-neutral-500">
                封箱「{viewName ?? "…"}」的筛选、清算快照与 AI 解读；他人导入后为独立副本。重新生成后旧码作废。
              </p>
              {loadingShare ? (
                <p className="text-xs text-neutral-400">加载分享码…</p>
              ) : shareMeta ? (
                <div>
                  <p className="text-xs font-medium text-violet-900">当前分享码</p>
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
                    <code className="flex-1 break-all text-lg font-bold tracking-widest text-violet-900">
                      {shareMeta.plainCode}
                    </code>
                    <button
                      type="button"
                      onClick={() => void copyCode()}
                      className="shrink-0 rounded-lg border border-violet-300 bg-white p-2 text-violet-700 hover:bg-violet-50"
                      title="复制"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">
                    含 {shareMeta.auditLogCount} 条清算、{shareMeta.insightCount} 条 AI 解读 · 有效期至{" "}
                    {shareMeta.expiresAt.slice(0, 10)} · 剩余导入 {shareMeta.importsRemaining}/
                    {shareMeta.maxImports} 次
                  </p>
                </div>
              ) : (
                <p className="text-xs text-amber-700">暂无有效分享码，请下方生成。</p>
              )}

              <div className="rounded-lg border border-neutral-100 bg-neutral-50/80 p-3">
                <p className="mb-2 text-xs font-medium text-neutral-700">
                  {shareMeta ? "重新生成（按当前数据重新封箱）" : "生成分享码"}
                </p>
                <label className="block text-xs text-neutral-600">
                  有效天数
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={expiresDays}
                    onChange={(e) => setExpiresDays(Number(e.target.value) || 30)}
                    className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                  />
                </label>
                <label className="mt-2 block text-xs text-neutral-600">
                  最多导入次数
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={maxImports}
                    onChange={(e) => setMaxImports(Number(e.target.value) || 10)}
                    className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm"
                  />
                </label>
                <button
                  type="button"
                  disabled={creating || !viewId}
                  onClick={() => void handleCreateOrRegenerate()}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
                >
                  <RefreshCw className={cnIcon(creating)} aria-hidden />
                  {creating ? "封箱中…" : shareMeta ? "重新生成" : "生成分享码"}
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="block text-xs text-neutral-600">
                分享码
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="10 位字母数字"
                  className="mt-1 w-full rounded-lg border px-3 py-2 font-mono text-sm tracking-wider"
                />
              </label>
              <button
                type="button"
                disabled={previewing}
                onClick={() => void handlePreview()}
                className="mt-2 w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-50 disabled:opacity-60"
              >
                {previewing ? "预览中…" : "预览内容"}
              </button>
              {preview ? (
                <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-700">
                  <p>
                    <span className="font-medium">{preview.viewName}</span> · 来自 {preview.ownerDisplayName}
                  </p>
                  <p className="mt-1">
                    {preview.auditLogCount} 条清算 · {preview.insightCount} 条 AI 解读 · 剩余导入{" "}
                    {preview.importsRemaining} 次
                  </p>
                  <p className="mt-1 text-neutral-500">{preview.snapshotNote}</p>
                </div>
              ) : null}
              {preview ? (
                <>
                  <label className="mt-3 block text-xs text-neutral-600">
                    导入后的配置名称（可选）
                    <input
                      value={targetName}
                      onChange={(e) => setTargetName(e.target.value)}
                      className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={importing}
                    onClick={() => void handleImport()}
                    className="mt-4 w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-60"
                  >
                    {importing ? "导入中…" : "确认导入"}
                  </button>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function cnIcon(spinning: boolean) {
  return `h-4 w-4 ${spinning ? "animate-spin" : ""}`;
}
