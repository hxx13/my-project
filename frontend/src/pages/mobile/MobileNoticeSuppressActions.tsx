/** 公告详情 —「下次不再弹出」标题行右侧（与扫码弹窗逻辑一致） */
import type { MobileAlertItem } from "@/api/domains/mobileStudent.api";
import { useMobileNoticeAutoSuppress } from "./useMobileNoticeAutoSuppress";

export default function MobileNoticeSuppressActions({
  token,
  item,
  onSuppressed,
}: {
  token?: string;
  item: MobileAlertItem;
  onSuppressed?: () => void;
}) {
  const {
    canSuppress,
    suppressed,
    dismissInProgress,
    saving,
    secondaryDisabled,
    startSuppress,
    waitSeconds,
    countdownSeconds,
  } = useMobileNoticeAutoSuppress({
    token,
    item,
    alreadySuppressed: item.autoOpenSuppressed === true,
    onSuppressed,
  });

  if (!canSuppress && !suppressed) return null;

  const label = suppressed
    ? "已关闭"
    : dismissInProgress && countdownSeconds != null
      ? `等待${countdownSeconds}秒`
      : saving
        ? "保存中"
        : "下次不再弹出";

  return (
    <div className="shrink-0 flex flex-col items-end gap-0.5 max-w-[38%]">
      {!suppressed && !dismissInProgress && (
        <span className="text-[9px] leading-none text-right" style={{ color: "#c8c9cc" }}>
          停留{waitSeconds}秒生效
        </span>
      )}
      {dismissInProgress && (
        <span className="text-[9px] leading-none text-right" style={{ color: "#d97706" }}>
          请保持在本页
        </span>
      )}
      <button
        type="button"
        disabled={secondaryDisabled}
        onClick={startSuppress}
        title={suppressed ? "已设置不再自动弹出" : "下次不再弹出"}
        className="rounded-full px-2.5 py-1 text-[10px] font-semibold whitespace-nowrap active:scale-[0.97] transition-transform disabled:opacity-60"
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
