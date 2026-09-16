/** 小程序房间详情弹窗（数据来自 wechat-overview occupants） */
import { useState, useEffect } from "react";
import { ChevronDown, ChevronUp, Clock, Loader2, X } from "lucide-react";
import { submitScanDelayRequest, fetchMyActiveDelayRequests } from "@/api/domains/scanDelay.api";
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
  /** 延迟申请成功后回调（status + optionLabel） */
  onDelaySuccess?: (status: string, optionLabel?: string) => void;
  /** 当前房间的扫码系统 officialRoomId（已由父组件解析），用于延迟状态查询 */
  scanRoomId?: string | null;
  /** 移动端进入：总开关 + 灰度名单是否开放（后端 analyze 下发） */
  mobileEnterEnabled?: boolean;
  /** 该房间当前是否可进入（来自 evaluateMobileRoomAccess.enterable） */
  roomEnterable?: boolean;
  /** 不可进入的原因短文案（来自 evaluateMobileRoomAccess.reasonShort） */
  enterBlockedReason?: string;
  /** 当前是否已在场内 */
  alreadyInside?: boolean;
  /** 自动签退剩余秒数（analyze 下发）；null 不显示 */
  autoExitSeconds?: number | null;
  /** 执行进入；resolve 即成功，reject 则展示 message */
  onEnter?: (roomId: string) => Promise<void>;
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
  scanRoomId,
  mobileEnterEnabled = false,
  roomEnterable = false,
  enterBlockedReason,
  alreadyInside = false,
  autoExitSeconds = null,
  onEnter,
}: MobileRoomDetailDialogProps) {
  const [delayOpen, setDelayOpen] = useState(false);
  const [activeOptionId, setActiveOptionId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [delayStatus, setDelayStatus] = useState<"none" | "pending" | "approved">("none");
  const [approvedLabel, setApprovedLabel] = useState("");
  // 免冻结到期时刻：数据源就是下面那次 fetchMyActiveDelayRequests，不额外加接口调用
  const [exemptExpireAt, setExemptExpireAt] = useState("");
  const [enterConfirmOpen, setEnterConfirmOpen] = useState(false);
  const [entering, setEntering] = useState(false);

  // 必须同时满足：后端灰度开放 + 该房间可进入（含违规/未绑卡/满员/时段/等级锁定）+ 尚未在场 + 有回调
  const showEnter = Boolean(mobileEnterEnabled && roomEnterable && !alreadyInside && onEnter);

  const handleEnterConfirm = async () => {
    if (!onEnter || entering) return;
    setEntering(true);
    try {
      await onEnter(scanRoomId || String(detail.roomId));
      setEnterConfirmOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "进入失败");
    } finally {
      setEntering(false);
    }
  };

  const showDelay =
    scanDelayEnabled && delayOptions.length > 0 && Boolean(subjectUserId);

  // 查询活跃申请状态
  useEffect(() => {
    if (!subjectUserId) return;
    const rid = scanRoomId || (detail.roomId != null ? String(detail.roomId) : "");
    if (!rid) return;
    fetchMyActiveDelayRequests(rid, subjectUserId).then((data) => {
      const approved = data.requests.find((r) => r.status === "APPROVED");
      if (data.hasApproved) {
        setDelayStatus("approved");
        setApprovedLabel(approved?.optionLabel || "");
        setExemptExpireAt(approved?.expireAt || "");
      } else if (data.hasPending) {
        setDelayStatus("pending");
        setExemptExpireAt("");
      } else {
        setDelayStatus("none");
        setExemptExpireAt("");
      }
    }).catch(() => {});
  }, [subjectUserId, detail.roomId]);

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
        roomId: scanRoomId || String(detail.roomId),
        optionId: opt.id,
      });
      toast.success(res.status === "PENDING" ? (res.message || "已提交申请，等待确认") : (res.message || "已授权"));
      if (res.status === "PENDING") {
        setDelayStatus("pending");
      } else if (res.status === "GRANTED" || res.status === "APPROVED") {
        setDelayStatus("approved");
        setApprovedLabel(res.optionLabel || opt.optionLabel);
      }
      setActiveOptionId(null);
      setDelayOpen(false);
      onDelaySuccess?.(res.status, res.optionLabel);
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

          {/* ──────── 移动端自助进入 ──────── */}
          {showEnter ? (
            <div className="mt-4 pt-3 border-t" style={{ borderColor: "#ebedf0" }}>
              <button
                type="button"
                disabled={entering}
                onClick={() => setEnterConfirmOpen(true)}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold text-white active:scale-[0.98] transition-transform disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #1989fa 0%, #0a6fd6 100%)" }}
              >
                {entering ? <Loader2 className="size-[18px] animate-spin" /> : null}
                进入 {detail.roomName}
              </button>

              {autoExitSeconds != null && autoExitSeconds > 0 ? (
                <p className="mt-2 text-center text-[11px]" style={{ color: "#ed6a0c" }}>
                  ⏱ 自动签退剩余 {Math.floor(autoExitSeconds / 60)}:{String(autoExitSeconds % 60).padStart(2, "0")}
                </p>
              ) : null}
              {exemptExpireAt ? (
                <p className="mt-1 text-center text-[11px]" style={{ color: "#065F46" }}>
                  免冻结有效至 {exemptExpireAt.slice(11, 16)}
                </p>
              ) : null}
            </div>
          ) : mobileEnterEnabled && !alreadyInside && !roomEnterable && enterBlockedReason ? (
            <div className="mt-4 pt-3 border-t" style={{ borderColor: "#ebedf0" }}>
              <button
                type="button"
                disabled
                className="w-full rounded-xl py-3 text-[13px] font-bold"
                style={{ background: "#f7f8fa", color: "#969799", border: "1px solid #ebedf0" }}
              >
                无法进入：{enterBlockedReason}
              </button>
            </div>
          ) : null}

          {/* ──────── 延迟免冻结 — 内联展开 ──────── */}
          {showDelay && (
            <div className="mt-4 pt-3 border-t" style={{ borderColor: "#ebedf0" }}>
              {/* 一级按钮 */}
              <button
                type="button"
                disabled={delayStatus === "approved"}
                onClick={() => { if (delayStatus !== "approved") { setDelayOpen((p) => !p); setActiveOptionId(null); } }}
                className="w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[14px] font-bold active:scale-[0.98] transition-transform disabled:opacity-60"
                style={delayStatus === "approved" ? {
                  background: "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)",
                  color: "#065F46",
                  border: "1px solid rgba(6,95,70,0.25)",
                  boxShadow: "0 2px 8px rgba(6,95,70,0.08)",
                } : delayStatus === "pending" ? {
                  background: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)",
                  color: "#92400E",
                  border: "1px solid rgba(146,64,14,0.25)",
                  boxShadow: "0 2px 8px rgba(146,64,14,0.08)",
                } : {
                  background: "linear-gradient(135deg, #FFF7E8 0%, #FFF1D6 100%)",
                  color: "#B86E00",
                  border: "1px solid rgba(184,110,0,0.25)",
                  boxShadow: "0 2px 8px rgba(184,110,0,0.08)",
                }}
              >
                {delayStatus === "approved" ? (
                  <svg className="size-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path d="M20 6L9 17l-5-5" /></svg>
                ) : (
                  <Clock className="size-[18px]" strokeWidth={2.5} />
                )}
                {delayStatus === "approved" ? (approvedLabel || scanDelayButtonLabel) : delayStatus === "pending" ? "审核中" : scanDelayButtonLabel}
                {delayOpen && delayStatus !== "approved" ? <ChevronUp className="size-4 ml-1" /> : delayStatus !== "approved" ? <ChevronDown className="size-4 ml-1" /> : null}
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

      {enterConfirmOpen ? (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 900, background: "rgba(0,0,0,0.5)" }}
          onClick={(e) => {
            // 外层遮罩 onClick=onClose，不拦住冒泡会把整个详情弹窗一起关掉
            e.stopPropagation();
            setEnterConfirmOpen(false);
          }}
        >
          <div
            className="w-full max-w-[260px] rounded-2xl p-5 text-center"
            style={{ background: "#fff" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[15px] font-bold mb-1" style={{ color: "#323233" }}>
              确认进入 {detail.roomName}
            </p>
            <p className="text-[12px] mb-4" style={{ color: "#969799" }}>
              当前 {detail.currentRoomCount}/{detail.totalCapacity} 人
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEnterConfirmOpen(false)}
                className="flex-1 rounded-xl py-2.5 text-[13px] font-bold"
                style={{ background: "#f2f3f5", color: "#646566" }}
              >
                取消
              </button>
              <button
                type="button"
                disabled={entering}
                onClick={() => void handleEnterConfirm()}
                className="flex-1 rounded-xl py-2.5 text-[13px] font-bold text-white disabled:opacity-60"
                style={{ background: "#1989fa" }}
              >
                {entering ? "处理中…" : "确认进入"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
