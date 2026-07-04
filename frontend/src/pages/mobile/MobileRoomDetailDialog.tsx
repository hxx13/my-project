/** 小程序房间详情弹窗（数据来自 wechat-overview occupants） */
import { useState } from "react";
import { ChevronDown, ChevronUp, Clock, Loader2, X } from "lucide-react";
import { submitScanDelayRequest } from "@/api/domains/scanDelay.api";
import type { ScanDelayOptionSummary } from "@/api/types/scanner";
import type { ScanDelayRequestResult } from "@/api/domains/scanDelay.api";
import { formatExemptTimeRule } from "@/constants/exemptDurationPresets";
import type { DetailRoom } from "./utils/roomPreviewMeta";
import toast from "react-hot-toast";

interface MobileRoomDetailDialogProps {
  detail: DetailRoom;
  onClose: () => void;
  /** 延迟免冻结总开关 */
  scanDelayEnabled?: boolean;
  /** 延迟按钮文案 */
  scanDelayButtonLabel?: string;
  /** 当前房间的延迟菜单项 */
  delayOptions?: ScanDelayOptionSummary[];
  /** 申请人 userId */
  subjectUserId?: string;
  /** 自定义提交（H5 token 模式传入 token-aware 实现） */
  onSubmitDelay?: (payload: {
    subjectUserId: string;
    roomId: string;
    optionId: number;
  }) => Promise<ScanDelayRequestResult>;
  /** 延迟申请成功后回调（触发刷新） */
  onDelaySuccess?: () => void;
}

function formatDelayHint(option: ScanDelayOptionSummary): string {
  const parts: string[] = [];
  const timeRule = formatExemptTimeRule(option.extendUntilTime, option.durationMinutes);
  if (timeRule !== "—") parts.push(timeRule);
  if (option.exemptMode) parts.push(option.exemptMode);
  return parts.length ? parts.join(" · ") : "";
}

export default function MobileRoomDetailDialog({
  detail,
  onClose,
  scanDelayEnabled = false,
  scanDelayButtonLabel = "延迟申请",
  delayOptions = [],
  subjectUserId,
  onSubmitDelay,
  onDelaySuccess,
}: MobileRoomDetailDialogProps) {
  const [delayOpen, setDelayOpen] = useState(false);
  const [activeOptionId, setActiveOptionId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const showDelay =
    scanDelayEnabled && delayOptions.length > 0 && Boolean(subjectUserId);

  const activeOption = delayOptions.find((o) => o.id === activeOptionId);

  const handleSubmit = async (opt: ScanDelayOptionSummary) => {
    if (!subjectUserId) return;
    if (opt.requireApproval) {
      const ids = opt.reviewerUserIds ?? [];
      if (ids.length === 0) {
        toast.error("该规则未配置审核教职工，请联系管理员");
        return;
      }
    }
    setSubmitting(true);
    try {
      const submitFn = onSubmitDelay ?? submitScanDelayRequest;
      const res = await submitFn({
        subjectUserId,
        roomId: String(detail.roomId),
        optionId: opt.id,
      });
      toast.success(res.status === "PENDING" ? (res.message || "已提交申请，等待确认") : (res.message || "已授权"));
      setActiveOptionId(null);
      setDelayOpen(false);
      onDelaySuccess?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      style={{ zIndex: 800, background: "rgba(0,0,0,0.5)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xs rounded-2xl overflow-hidden shadow-2xl"
        style={{ background: "#fff", maxHeight: "64vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div
          className="flex items-center justify-between px-4 py-2.5 border-b"
          style={{ borderColor: "#ebedf0" }}
        >
          <span className="text-[13px] font-bold truncate pr-2" style={{ color: "#323233" }}>
            房间详情
          </span>
          <button type="button" onClick={onClose} className="p-1 rounded-lg shrink-0">
            <X className="size-4" style={{ color: "#94a3b8" }} />
          </button>
        </div>

        {/* body */}
        <div
          className="overflow-y-auto px-5 py-4 text-center"
          style={{ maxHeight: "calc(64vh - 40px)" }}
        >
          <p className="text-[15px] font-bold mb-3 break-all" style={{ color: "#323233" }}>
            {detail.roomName}
          </p>

          {/* stats */}
          <div className="flex flex-wrap justify-center gap-2 mb-4">
            <div
              className="min-w-[80px] px-3 py-2.5 rounded-xl flex flex-col items-center gap-0.5"
              style={{ background: "#f7f8fa", border: "1px solid #ebedf0" }}
            >
              <span className="text-[10px]" style={{ color: "#969799" }}>上限</span>
              <span className="text-base font-bold" style={{ color: "#323233" }}>
                {detail.totalCapacity}
              </span>
            </div>
            <div
              className="min-w-[80px] px-3 py-2.5 rounded-xl flex flex-col items-center gap-0.5"
              style={{
                background: "linear-gradient(135deg, #e8f3ff 0%, #f0f7ff 100%)",
                border: "1px solid rgba(25,137,250,0.25)",
              }}
            >
              <span className="text-[10px]" style={{ color: "#969799" }}>当前人数</span>
              <span className="text-base font-bold" style={{ color: "#1989fa" }}>
                {detail.currentRoomCount}
              </span>
            </div>
          </div>

          {/* occupants */}
          <p className="text-[13px] font-semibold mb-2.5" style={{ color: "#323233" }}>在场人员</p>
          {detail.occupantRows.length === 0 ? (
            <p className="text-xs py-2" style={{ color: "#969799" }}>暂无人员</p>
          ) : (
            <div className="space-y-2 text-left">
              {detail.occupantRows.map((row, i) => (
                <div
                  key={i}
                  className="p-2.5 rounded-xl"
                  style={{
                    background: "#fff",
                    border: "1px solid #ebedf0",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.03)",
                  }}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[13px] font-semibold truncate" style={{ color: "#323233" }}>
                      {row.userName}
                    </span>
                    <span
                      className="text-[10px] px-2 py-0.5 rounded-full shrink-0 font-medium"
                      style={{ color: "#1989fa", background: "#e8f3ff" }}
                    >
                      {row.entryTypeLabel}
                    </span>
                  </div>
                  {row.projectGroup && (
                    <div className="flex justify-between gap-2 pt-1 border-t" style={{ borderColor: "#f2f3f5" }}>
                      <span className="text-[11px]" style={{ color: "#969799" }}>课题组</span>
                      <span className="text-[11px] font-medium" style={{ color: "#646566" }}>
                        {row.projectGroup}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2 pt-1 border-t" style={{ borderColor: "#f2f3f5" }}>
                    <span className="text-[11px]" style={{ color: "#969799" }}>进入时间</span>
                    <span className="text-[11px] font-medium" style={{ color: "#646566" }}>
                      {row.entryTime}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ──────── 延迟免冻结 — 内联展开 ──────── */}
          {showDelay && (
            <div className="mt-4 pt-3 border-t" style={{ borderColor: "#ebedf0" }}>
              {/* 一级按钮 */}
              <button
                type="button"
                onClick={() => { setDelayOpen((p) => !p); setActiveOptionId(null); }}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold active:scale-[0.98] transition-transform"
                style={{
                  background: "linear-gradient(135deg, #FFF7E8 0%, #FFF1D6 100%)",
                  color: "#B86E00",
                  border: "1px solid rgba(184,110,0,0.25)",
                  boxShadow: "0 2px 8px rgba(184,110,0,0.08)",
                }}
              >
                <Clock className="size-[18px]" strokeWidth={2.5} />
                {scanDelayButtonLabel}
                {delayOpen ? <ChevronUp className="size-4 ml-1" /> : <ChevronDown className="size-4 ml-1" />}
              </button>

              {/* 内联展开 — 选项左边界不动，右边界压缩露出右侧按钮 */}
              {delayOpen && (
                <ul className="mt-2 space-y-1">
                  {delayOptions.map((opt) => {
                    const isActive = activeOptionId === opt.id;
                    const hint = formatDelayHint(opt);
                    return (
                      <li key={opt.id} className="overflow-hidden rounded-lg">
                        <div className="flex gap-2">
                          {/* 选项 — 左边界固定，右边界向左压缩 */}
                          <button
                            type="button"
                            disabled={submitting}
                            className="shrink-0 rounded-lg px-3 py-2.5 text-left text-[12px] font-medium transition-[width] duration-200 ease-out disabled:opacity-50 truncate"
                            style={{
                              width: isActive ? "calc(100% - 134px)" : "100%",
                              color: "#323233",
                              background: "#fafafa",
                              border: "1px solid #ebedf0",
                            }}
                            onClick={() => setActiveOptionId((prev) => (prev === opt.id ? null : opt.id))}
                          >
                            {opt.optionLabel}
                            {opt.requireApproval && (
                              <span className="ml-1 text-[10px] font-normal" style={{ color: "#ed6a0c" }}>需审核</span>
                            )}
                            {hint && (
                              <span className="block text-[10px] font-normal mt-0.5" style={{ color: "#969799" }}>{hint}</span>
                            )}
                          </button>

                          {/* 取消 */}
                          <button
                            type="button"
                            disabled={submitting}
                            className="shrink-0 rounded-lg text-[11px] font-medium disabled:opacity-50"
                            style={{ width: 62, color: "#646566", background: "#fff", border: "1px solid #ebedf0" }}
                            onClick={() => setActiveOptionId(null)}
                          >
                            取消
                          </button>

                          {/* 确认 */}
                          <button
                            type="button"
                            disabled={submitting}
                            className="shrink-0 rounded-lg text-[11px] font-bold text-white disabled:opacity-50"
                            style={{ width: 62, background: "#B86E00" }}
                            onClick={() => handleSubmit(opt)}
                          >
                            {submitting && isActive ? (
                              <Loader2 className="size-3.5 animate-spin mx-auto" />
                            ) : opt.requireApproval ? (
                              "提交"
                            ) : (
                              "确认"
                            )}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
