import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, Loader2, ChevronLeft } from "lucide-react";
import type { ScanDelayOptionSummary } from "@/api/types/scanner";
import type { ScanDelayRequestResult } from "@/api/domains/scanDelay.api";
import { formatExemptTimeRule } from "@/constants/exemptDurationPresets";
import { submitScanDelayRequest } from "@/api/domains/scanDelay.api";
import { Z_INDEX } from "@/constants/zIndex";
import toast from "react-hot-toast";

type MenuStep = "options" | "confirm";

type Props = {
  open: boolean;
  /** 延迟按钮锚点 DOM（由 ActionButtons 传入，避免 ref 对象每次 render 重建） */
  anchorEl: HTMLElement | null;
  options: ScanDelayOptionSummary[];
  subjectUserId: string;
  roomId: string;
  buttonLabel: string;
  onClose: () => void;
  onSuccess: (status: "PENDING" | "GRANTED", optionLabel?: string) => void;
  /** 定位模式：anchor=相对按钮定位（扫码弹窗），center=居中卡片（H5） */
  positioning?: "anchor" | "center";
  /** H5 移动端适配：增大触控区域与字号 */
  mobile?: boolean;
  /** 自定义提交函数（H5 token 模式传入 token-aware 实现） */
  onSubmitRequest?: (payload: {
    subjectUserId: string;
    roomId: string;
    optionId: number;
  }) => Promise<ScanDelayRequestResult>;
  /** 今日已被拒绝的选项 ID（菜单中标记"已被拒绝"并禁用） */
  rejectedOptionIds?: number[];
};

function formatDelayHint(option: ScanDelayOptionSummary): string {
  const parts: string[] = [];
  const timeRule = formatExemptTimeRule(option.extendUntilTime, option.durationMinutes);
  if (timeRule !== "—") parts.push(timeRule);
  if (option.exemptMode) {
    parts.push(option.exemptMode);
  }
  return parts.length ? parts.join(" · ") : "";
}

/** 延迟按钮的实时状态（由父组件通过 API 查询注入） */
export type DelayButtonStatus = {
  status: "none" | "pending" | "approved";
  /** 已通过时显示的选项标签 */
  optionLabel?: string;
  /** 豁免到期时间（ISO 字符串），供房间按钮展示 */
  expireAt?: string;
};

export function ScanDelayButton({
  label,
  disabled,
  active,
  onClick,
  delayStatus,
}: {
  label: string;
  disabled?: boolean;
  active?: boolean;
  onClick: (e: React.MouseEvent) => void;
  delayStatus?: DelayButtonStatus;
}) {
  const ds = delayStatus;
  const isDisabled = disabled || ds?.status === "approved" || ds?.status === "pending";
  const hasStatus = ds?.status === "pending" || ds?.status === "approved";

  let displayLabel = label;
  let extraClass = "";
  if (ds?.status === "pending") {
    displayLabel = "审核中";
    extraClass = "border-amber-300 bg-amber-50 text-amber-700";
  } else if (ds?.status === "approved") {
    displayLabel = ds.optionLabel || "已通过";
    extraClass = "border-emerald-300 bg-emerald-50 text-emerald-700";
  }

  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={(e) => {
        e.stopPropagation();
        if (ds?.status === "approved" || ds?.status === "pending") return;
        onClick(e);
      }}
      className={`shrink-0 flex items-center justify-center gap-1 rounded-[var(--app-radius-element)] border px-2.5 h-full min-w-[78px] text-[11px] font-bold transition-colors ${
        extraClass
          ? extraClass
          : active
            ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent-ink)]"
            : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-secondary)] hover:border-[var(--app-color-accent)] hover:text-[var(--app-color-text-primary)]"
      } ${hasStatus ? "" : "disabled:opacity-40"} disabled:pointer-events-none`}
    >
      {ds?.status === "approved" ? (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
      ) : (
        <Clock className="h-3.5 w-3.5" strokeWidth={2.5} />
      )}
      {displayLabel}
    </button>
  );
}

export function ScanDelayMenuPortal({
  open,
  anchorEl,
  options,
  subjectUserId,
  roomId,
  onClose,
  onSuccess,
  positioning = "anchor",
  mobile = false,
  onSubmitRequest,
  rejectedOptionIds,
}: Props) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [step, setStep] = useState<MenuStep>("options");
  const [pendingOption, setPendingOption] = useState<ScanDelayOptionSummary | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const anchorElRef = useRef(anchorEl);

  useEffect(() => {
    anchorElRef.current = anchorEl;
  }, [anchorEl]);

  const resetFlow = useCallback(() => {
    setStep("options");
    setPendingOption(null);
  }, []);

  const syncPos = useCallback(() => {
    const anchor = anchorElRef.current;
    const menu = menuRef.current;
    if (!anchor) return;
    const ar = anchor.getBoundingClientRect();
    const menuW = menu?.offsetWidth ?? 240;
    const menuH = menu?.offsetHeight ?? 120;
    const gap = 8;
    let left = ar.left - menuW - gap;
    let top = ar.top + (ar.height - menuH) / 2;
    if (left < gap) {
      left = ar.right + gap;
    }
    left = Math.min(left, window.innerWidth - menuW - gap);
    top = Math.max(gap, Math.min(top, window.innerHeight - menuH - gap));
    setPos({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      resetFlow();
      return;
    }
    syncPos();
    const raf = requestAnimationFrame(() => syncPos());
    return () => cancelAnimationFrame(raf);
  }, [open, anchorEl, step, options.length, syncPos, resetFlow]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", syncPos);
    window.addEventListener("scroll", syncPos, true);
    return () => {
      window.removeEventListener("resize", syncPos);
      window.removeEventListener("scroll", syncPos, true);
    };
  }, [open, syncPos]);

  useEffect(() => {
    if (!open) return;
    let removeListener: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      const onDoc = (e: MouseEvent) => {
        const t = e.target as Node;
        if (menuRef.current?.contains(t) || anchorElRef.current?.contains(t)) return;
        onClose();
      };
      document.addEventListener("mousedown", onDoc);
      removeListener = () => document.removeEventListener("mousedown", onDoc);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      removeListener?.();
    };
  }, [open, onClose]);

  const doSubmit = async (option: ScanDelayOptionSummary) => {
    setSubmitting(true);
    try {
      const submitFn = onSubmitRequest ?? submitScanDelayRequest;
      const res = await submitFn({
        subjectUserId,
        roomId,
        optionId: option.id,
      });
      const status = res.status === "PENDING" ? "PENDING" as const : "GRANTED" as const;
      if (status === "PENDING") {
        toast.success(res.message || "已提交申请，等待确认");
      } else {
        toast.success(res.message || "已授权");
      }
      onSuccess(status, pendingOption?.optionLabel);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "操作失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePickOption = (option: ScanDelayOptionSummary) => {
    setPendingOption(option);
    setStep("confirm");
  };

  const handleConfirmApply = async () => {
    if (!pendingOption) return;
    if (pendingOption.requireApproval) {
      const configuredIds = pendingOption.reviewerUserIds ?? [];
      if (configuredIds.length === 0) {
        toast.error("该规则未配置审核教职工，请联系管理员");
        return;
      }
    }
    await doSubmit(pendingOption);
  };

  if (!open || typeof document === "undefined") return null;

  const hint = pendingOption ? formatDelayHint(pendingOption) : "";
  const isCenter = positioning === "center";
  const z = isCenter ? Z_INDEX.mobileDelayMenu : Z_INDEX.scanDelayMenu;
  const textSm = mobile ? "text-[13px]" : "text-[12px]";
  const textXs = mobile ? "text-[12px]" : "text-[11px]";
  const textTiny = mobile ? "text-[11px]" : "text-[10px]";
  const btnPy = mobile ? "py-3" : "py-2";
  const optionPy = mobile ? "py-3" : "py-2";
  const spacing = mobile ? "space-y-1.5" : "space-y-1";

  return createPortal(
    <>
      {isCenter && (
        <div
          className="fixed inset-0 bg-black/40"
          style={{ zIndex: z - 1 }}
          onClick={onClose}
        />
      )}
      <div
        ref={menuRef}
        className={`fixed rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-2 shadow-[var(--app-elevation-popover)] ${
          isCenter
            ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 min-w-[260px] max-w-[min(92vw,340px)]"
            : "min-w-[220px] max-w-[min(92vw,300px)]"
        }`}
        style={isCenter ? { zIndex: z } : { top: pos.top, left: pos.left, zIndex: z }}
        role="menu"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {step === "confirm" && pendingOption ? (
          <div className="space-y-2 px-1 py-1">
            <button
              type="button"
              className={`flex items-center gap-1 ${textTiny} font-bold text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]`}
              onClick={() => setStep("options")}
            >
              <ChevronLeft className="h-3 w-3" />
              返回选项
            </button>
            <p className={`${textSm} font-bold text-[var(--app-color-text-primary)]`}>确认申请延迟免冻结</p>
            <p className={`${textXs} leading-relaxed text-[var(--app-color-text-secondary)]`}>
              已选「{pendingOption.optionLabel}」
              {hint ? `（${hint}）` : ""}。
              {pendingOption.requireApproval
                ? "确认后将提交至后台配置的审核教职工。"
                : "确认后将立即通过。"}
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                disabled={submitting}
                className={`flex-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] px-3 ${btnPy} ${textXs} font-bold text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50`}
                onClick={() => setStep("options")}
              >
                取消
              </button>
              <button
                type="button"
                disabled={submitting}
                className={`flex-1 rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-3 ${btnPy} ${textXs} font-bold text-[var(--app-color-text-inverse)] disabled:opacity-50`}
                onClick={() => void handleConfirmApply()}
              >
                {pendingOption.requireApproval ? "提交审核" : "确认"}
              </button>
            </div>
          </div>
        ) : options.length === 0 ? (
          <p className={`px-2 py-3 ${textXs} text-[var(--app-color-text-tertiary)]`}>该房间暂无可用延迟选项</p>
        ) : (
          <ul className={spacing}>
            {options.map((opt) => {
              const isRejected = rejectedOptionIds?.includes(opt.id);
              return (
                <li key={opt.id}>
                  <button
                    type="button"
                    disabled={submitting || isRejected}
                    className={`w-full rounded-[var(--app-radius-element)] px-3 ${optionPy} text-left ${textSm} font-bold text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50`}
                    onClick={() => handlePickOption(opt)}
                  >
                    {opt.optionLabel}
                    {isRejected ? (
                      <span className={`ml-1 ${textTiny} font-normal text-[var(--app-color-text-tertiary)]`}>
                        (已被拒绝)
                      </span>
                    ) : opt.requireApproval ? (
                      <span className={`ml-1 ${textTiny} font-normal text-[var(--app-color-feedback-warning)]`}>
                        点击申请
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {submitting ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-[var(--app-color-surface-container)]/80">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--app-color-accent)]" />
          </div>
        ) : null}
      </div>
    </>,
    document.body
  );
}
