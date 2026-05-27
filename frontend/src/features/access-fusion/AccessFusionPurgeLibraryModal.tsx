import { useState } from "react";
import toast from "react-hot-toast";
import { AlertTriangle } from "lucide-react";
import { purgeAccessCleanLibrary } from "@/api/domains/accessFusion.api";
import { AdminButton } from "@/components/admin/AdminButton";

type Props = {
  open: boolean;
  onClose: () => void;
  channelCodes: string[];
  onPurged: () => void;
};

export function AccessFusionPurgeLibraryModal({ open, onClose, channelCodes, onPurged }: Props) {
  const [confirmText, setConfirmText] = useState("");
  const [deleteLogs, setDeleteLogs] = useState(true);
  const [scopeChannels, setScopeChannels] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!open) return null;

  const handlePurge = async () => {
    if (confirmText.trim() !== "CLEAR") {
      toast.error('请在确认框输入大写 CLEAR');
      return;
    }
    setLoading(true);
    try {
      const res = await purgeAccessCleanLibrary({
        confirmToken: "CLEAR",
        channelCodes: scopeChannels && channelCodes.length ? channelCodes : undefined,
        deleteExecutionLogs: deleteLogs,
      });
      toast.success(
        `已清空 ${res.itemsDeleted ?? 0} 条总库记录` +
          (res.executionLogsDeleted ? `，删除 ${res.executionLogsDeleted} 条执行日志` : "")
      );
      setConfirmText("");
      onPurged();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "清空失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl text-xs">
        <div className="flex items-start gap-2 text-rose-800">
          <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm">清空清洗总库</p>
            <p className="mt-1 text-slate-600 leading-relaxed">
              将删除已入库的清洗明细（及可选的执行日志），不可恢复。清空后请在「统计清洗」页打开「清洗规则方案」调整规则，并在审计任务中改绑方案，再执行回溯或按日补跑重新入库。
            </p>
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            checked={scopeChannels}
            disabled={channelCodes.length === 0}
            onChange={(e) => setScopeChannels(e.target.checked)}
          />
          <span>
            仅清空当前筛选的 {channelCodes.length} 个通道
            {channelCodes.length === 0 ? "（请先在筛选栏选择通道）" : ""}
          </span>
        </label>
        <label className="mt-2 flex items-center gap-2">
          <input type="checkbox" checked={deleteLogs} onChange={(e) => setDeleteLogs(e.target.checked)} />
          <span>同时删除全部入库执行日志</span>
        </label>
        <label className="mt-3 flex flex-col gap-1">
          <span className="font-medium text-slate-700">输入 CLEAR 确认</span>
          <input
            className="h-9 rounded border px-2 font-mono uppercase"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="CLEAR"
            autoComplete="off"
          />
        </label>
        <div className="mt-4 flex gap-2 justify-end">
          <AdminButton tone="secondary" onClick={onClose} disabled={loading}>
            取消
          </AdminButton>
          <AdminButton
            tone="destructive"
            disabled={loading || confirmText.trim() !== "CLEAR"}
            onClick={() => void handlePurge()}
          >
            {loading ? "清空中…" : "确认清空"}
          </AdminButton>
        </div>
      </div>
    </div>
  );
}
