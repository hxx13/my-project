/** 公告详情 —「下次不再弹出」标题栏右上角（与扫码弹窗逻辑一致） */
import type { MobileAlertItem } from "@/api/domains/mobileStudent.api";
import { useMobileNoticeAutoSuppress } from "./useMobileNoticeAutoSuppress";

export default function MobileNoticeSuppressActions({
  token,
  jwtMode = false,
  item,
  onSuppressed,
  compact = false,
}: {
  token?: string;
  jwtMode?: boolean;
  item: MobileAlertItem;
  onSuppressed?: () => void;
  /** 标题栏右上角：更紧凑 */
  compact?: boolean;
}) {
  const {
    canSuppress,
    suppressed,
    dismissInProgress,
    saving,
    secondaryDisabled,
    startSuppress,
    countdownSeconds,
  } = useMobileNoticeAutoSuppress({
    token,
    jwtMode,
    item,
    alreadySuppressed: item.autoOpenSuppressed === true,
    onSuppressed,
  });

  if (!canSuppress && !suppressed) return null;

  const fullLabel = suppressed
    ? "已设置不再弹出"
    : dismissInProgress && countdownSeconds != null
      ? `等待${countdownSeconds}秒`
      : saving
        ? "保存中"
        : "下次不再弹出";

  const label = compact
    ? suppressed
      ? "已不再弹出"
      : dismissInProgress && countdownSeconds != null
        ? `等待${countdownSeconds}秒`
        : saving
          ? "保存中"
          : "不再弹出"
    : fullLabel;

  return (
    <div className={compact ? "min-w-0 max-w-full" : "max-w-[38%] shrink-0"}>
      <button
        type="button"
        disabled={secondaryDisabled}
        onClick={startSuppress}
        title={suppressed ? "已设置不再自动弹出" : "下次不再弹出"}
        className={
          compact
            ? "max-w-full truncate rounded-full px-1.5 py-0.5 text-[10px] font-semibold active:scale-[0.97] transition-transform disabled:opacity-60"
            : "rounded-full px-2.5 py-1 text-[10px] font-semibold whitespace-nowrap active:scale-[0.97] transition-transform disabled:opacity-60"
        }
        style={{
          background: suppressed ? "#f2f3f5" : dismissInProgress ? "#fff7ed" : "#eef6ff",
          color: suppressed ? "#969799" : dismissInProgress ? "#c2410c" : "#1989fa",
          border: suppressed
            ? "1px solid #ebedf0"
            : dismissInProgress
              ? "1px solid rgba(234,88,12,0.35)"
              : "1px solid rgba(25,137,250,0.3)",
        }}
      >
        {label}
      </button>
    </div>
  );
}
