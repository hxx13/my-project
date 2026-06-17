import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, Loader2, ChevronLeft } from "lucide-react";
import type { ScanDelayOptionSummary } from "@/api/types/scanner";
import { fetchStaffContacts, type StaffContact } from "@/api/domains/chat.api";
import { submitScanDelayRequest } from "@/api/domains/scanDelay.api";
import { Z_INDEX } from "@/constants/zIndex";
import toast from "react-hot-toast";

type MenuStep = "options" | "confirm" | "reviewers";

type Props = {
  open: boolean;
  /** 延迟按钮锚点 DOM（由 ActionButtons 传入，避免 ref 对象每次 render 重建） */
  anchorEl: HTMLElement | null;
  options: ScanDelayOptionSummary[];
  subjectUserId: string;
  roomId: string;
  buttonLabel: string;
  onClose: () => void;
  onSuccess: () => void;
};

function formatDelayHint(option: ScanDelayOptionSummary): string {
  const parts: string[] = [];
  if (option.durationMinutes != null && option.durationMinutes > 0) {
    parts.push(`${option.durationMinutes} 分钟`);
  }
  if (option.exemptMode) {
    parts.push(option.exemptMode);
  }
  return parts.length ? parts.join(" · ") : "";
}

export function ScanDelayButton({
  label,
  disabled,
  active,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  active?: boolean;
  onClick: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      className={`shrink-0 flex items-center justify-center gap-1 rounded-[var(--app-radius-element)] border px-3 h-full min-w-[72px] text-[11px] font-bold transition-colors ${
        active
          ? "border-[var(--app-color-accent)] bg-[var(--app-color-accent-soft)] text-[var(--app-color-accent-ink)]"
          : "border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] text-[var(--app-color-text-secondary)] hover:border-[var(--app-color-accent)] hover:text-[var(--app-color-text-primary)]"
      } disabled:opacity-40 disabled:pointer-events-none`}
    >
      <Clock className="h-3.5 w-3.5" strokeWidth={2.5} />
      {label}
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
}: Props) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [step, setStep] = useState<MenuStep>("options");
  const [pendingOption, setPendingOption] = useState<ScanDelayOptionSummary | null>(null);
  const [reviewers, setReviewers] = useState<StaffContact[]>([]);
  const [loadingReviewers, setLoadingReviewers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const anchorElRef = useRef(anchorEl);

  useEffect(() => {
    anchorElRef.current = anchorEl;
  }, [anchorEl]);

  const resetFlow = useCallback(() => {
    setStep("options");
    setPendingOption(null);
    setReviewers([]);
  }, []);

  const syncPos = useCallback(() => {
    const anchor = anchorElRef.current;
    const menu = menuRef.current;
    if (!anchor) return;
    const ar = anchor.getBoundingClientRect();
    const menuW = menu?.offsetWidth ?? 240;
    const menuH = menu?.offsetHeight ?? 120;
    const gap = 8;
    // 默认贴在延迟按钮左侧，垂直与按钮居中对齐
    let left = ar.left - menuW - gap;
    let top = ar.top + (ar.height - menuH) / 2;
    if (left < gap) {
      // 左侧空间不足时改贴按钮右侧
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
    // 菜单内容高度变化后（确认页/审核人列表）再对齐一次
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

  const loadConfiguredReviewers = async (option: ScanDelayOptionSummary) => {
    const configuredIds = option.reviewerUserIds ?? [];
    if (configuredIds.length === 0) {
      toast.error("该规则未配置审核教职工");
      return false;
    }
    setLoadingReviewers(true);
    try {
      const res = await fetchStaffContacts({ page: 1, size: 200 });
      const idSet = new Set(configuredIds);
      const matched = (res.data ?? []).filter((r) => idSet.has(r.id));
      const order = new Map(configuredIds.map((id, i) => [id, i]));
      matched.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999));
      if (matched.length === 0) {
        // 通讯录未命中时仍按配置 ID 展示，便于提交
        setReviewers(
          configuredIds.map((id) => ({
            id,
            username: id,
            displayName: id,
            displayNickname: id,
            contactGroupId: "",
          }))
        );
      } else {
        setReviewers(matched);
      }
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "加载审核教职工失败");
      return false;
    } finally {
      setLoadingReviewers(false);
    }
  };

  const doSubmit = async (option: ScanDelayOptionSummary, reviewerUserId?: string) => {
    setSubmitting(true);
    try {
      const res = await submitScanDelayRequest({
        subjectUserId,
        roomId,
        optionId: option.id,
        reviewerUserId,
      });
      if (res.status === "PENDING") {
        toast.success(res.message || "已提交审核，等待确认");
      } else {
        toast.success(res.message || "已授权");
      }
      onSuccess();
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
    if (!pendingOption.requireApproval) {
      await doSubmit(pendingOption);
      return;
    }
    const configuredIds = pendingOption.reviewerUserIds ?? [];
    if (configuredIds.length === 0) {
      toast.error("该规则未配置审核教职工，请联系管理员");
      return;
    }
    // 仅一名配置审核人：确认后直接提交给该审核人
    if (configuredIds.length === 1) {
      await doSubmit(pendingOption, configuredIds[0]);
      return;
    }
    // 多名配置审核人：只展示规则内名单供选择
    const ok = await loadConfiguredReviewers(pendingOption);
    if (ok) setStep("reviewers");
  };

  const handlePickReviewer = async (reviewerId: string) => {
    if (!pendingOption) return;
    await doSubmit(pendingOption, reviewerId);
  };

  if (!open || typeof document === "undefined") return null;

  const hint = pendingOption ? formatDelayHint(pendingOption) : "";
  const configuredReviewerIds = pendingOption?.reviewerUserIds ?? [];

  return createPortal(
    <div
      ref={menuRef}
      className="fixed min-w-[220px] max-w-[min(92vw,300px)] rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] bg-[var(--app-color-surface-container)] p-2 shadow-[var(--app-elevation-popover)]"
      style={{ top: pos.top, left: pos.left, zIndex: Z_INDEX.scanDelayMenu }}
      role="menu"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {step === "confirm" && pendingOption ? (
        <div className="space-y-2 px-1 py-1">
          <button
            type="button"
            className="flex items-center gap-1 text-[10px] font-bold text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"
            onClick={() => setStep("options")}
          >
            <ChevronLeft className="h-3 w-3" />
            返回选项
          </button>
          <p className="text-[12px] font-bold text-[var(--app-color-text-primary)]">确认申请延迟免冻结</p>
          <p className="text-[11px] leading-relaxed text-[var(--app-color-text-secondary)]">
            已选「{pendingOption.optionLabel}」
            {hint ? `（${hint}）` : ""}。
            {pendingOption.requireApproval
              ? configuredReviewerIds.length === 1
                ? "确认后将提交给规则指定的审核教职工，通过后自动授予免冻结。"
                : "确认后请从规则指定的审核教职工中选择一位提交申请。"
              : "确认后将立即授予免冻结，无需再点进入。"}
          </p>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              disabled={submitting}
              className="flex-1 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] px-3 py-2 text-[11px] font-bold text-[var(--app-color-text-secondary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50"
              onClick={() => setStep("options")}
            >
              取消
            </button>
            <button
              type="button"
              disabled={submitting}
              className="flex-1 rounded-[var(--app-radius-element)] bg-[var(--app-color-accent)] px-3 py-2 text-[11px] font-bold text-[var(--app-color-text-inverse)] disabled:opacity-50"
              onClick={() => void handleConfirmApply()}
            >
              {pendingOption.requireApproval ? "提交审核" : "确认"}
            </button>
          </div>
        </div>
      ) : step === "reviewers" ? (
        <>
          <button
            type="button"
            className="mb-1 flex items-center gap-1 text-[10px] font-bold text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-primary)]"
            onClick={() => setStep("confirm")}
          >
            <ChevronLeft className="h-3 w-3" />
            返回确认
          </button>
          <p className="mb-2 px-1 text-[11px] text-[var(--app-color-text-tertiary)]">
            请选择规则指定的审核教职工（仅展示已配置人员）。
          </p>
          {loadingReviewers ? (
            <div className="flex items-center justify-center py-4 text-[var(--app-color-text-tertiary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : (
            <ul className="max-h-[220px] overflow-y-auto space-y-1">
              {reviewers.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    disabled={submitting}
                    className="w-full rounded-[var(--app-radius-element)] px-3 py-2 text-left text-[12px] font-medium text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50"
                    onClick={() => void handlePickReviewer(r.id)}
                  >
                    {r.displayName || r.displayNickname || r.username}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : options.length === 0 ? (
        <p className="px-2 py-3 text-[11px] text-[var(--app-color-text-tertiary)]">该房间暂无可用延迟选项</p>
      ) : (
        <ul className="space-y-1">
          {options.map((opt) => (
            <li key={opt.id}>
              <button
                type="button"
                disabled={submitting}
                className="w-full rounded-[var(--app-radius-element)] px-3 py-2 text-left text-[12px] font-bold text-[var(--app-color-text-primary)] hover:bg-[var(--app-color-surface-hover)] disabled:opacity-50"
                onClick={() => handlePickOption(opt)}
              >
                {opt.optionLabel}
                {opt.requireApproval ? (
                  <span className="ml-1 text-[10px] font-normal text-[var(--app-color-feedback-warning)]">
                    需审核
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}
      {submitting ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-[inherit] bg-[var(--app-color-surface-container)]/80">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--app-color-accent)]" />
        </div>
      ) : null}
    </div>,
    document.body
  );
}
