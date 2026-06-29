/** 首页 — 进出状态与签退计时（分色提醒） */
import type { ReactNode } from "react";
import { Loader2, LogIn, LogOut, HelpCircle, Clock } from "lucide-react";
import { formatCountdown } from "@/utils/formatCountdown";
import { formatElapsedDuration, type MobilePresenceSnapshot } from "./useMobilePresenceStatus";
import {
  EXEMPT_THEME,
  PRESENCE_AUTO_EXIT_THEME,
  PRESENCE_DWELL_THEME,
  PRESENCE_PENDING_THEME,
  resolvePresenceDisplay,
} from "./mobilePresenceTheme";

type PillTheme = {
  accent: string;
  soft: string;
  border: string;
  text?: string;
};

function PresencePill({
  children,
  theme,
  urgent,
}: {
  children: ReactNode;
  theme: PillTheme;
  urgent?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums whitespace-nowrap shrink-0"
      style={{
        background: theme.soft,
        border: `1px solid ${theme.border}`,
        color: theme.text ?? theme.accent,
        boxShadow: urgent ? `0 0 0 1px ${theme.accent}33` : undefined,
      }}
    >
      {children}
    </span>
  );
}

export default function MobilePresenceStatusBar({
  snapshot,
}: {
  snapshot: MobilePresenceSnapshot;
}) {
  if (snapshot.loading) {
    return (
      <div
        className="mx-4 mt-2.5 rounded-2xl px-4 py-2.5 flex items-center justify-center gap-2 relative z-10"
        style={{
          background: "rgba(255,255,255,0.92)",
          border: "1px solid rgba(30,55,90,0.06)",
          boxShadow: "0 4px 14px rgba(15,23,42,0.06)",
        }}
      >
        <Loader2 className="size-4 animate-spin" style={{ color: "#94a3b8" }} />
        <span className="text-xs" style={{ color: "#969799" }}>
          同步进出状态…
        </span>
      </div>
    );
  }

  const { phase, theme } = resolvePresenceDisplay(snapshot);
  const StateIcon =
    phase === "pending_activation"
      ? Clock
      : phase === "pending_leave" || phase === "outside"
        ? LogOut
        : phase === "inside"
          ? LogIn
          : HelpCircle;

  const countdownUrgent =
    (snapshot.countdownSeconds ?? 0) > 0 && (snapshot.countdownSeconds ?? 0) <= 60;

  const countdownText =
    snapshot.countdownSeconds != null
      ? formatCountdown(snapshot.countdownSeconds)
      : null;

  const showRoomName =
    phase === "inside" || phase === "pending_activation" || phase === "pending_leave";

  const showDwell = phase === "inside" && snapshot.dwellSeconds != null;
  const showActivationPill = phase === "pending_activation" && countdownText;
  const showLeavePill = phase === "pending_leave" && countdownText;

  return (
    <div
      className="mx-4 mt-2.5 rounded-2xl px-3 py-2.5 relative z-10 transition-colors duration-300"
      style={{
        background: theme.cardBg,
        border: `1.5px solid ${theme.border}`,
        boxShadow: `0 4px 14px ${theme.accentSoft}`,
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className="size-9 shrink-0 rounded-full flex items-center justify-center"
          style={{ background: theme.iconBg }}
        >
          <StateIcon className="size-[17px]" style={{ color: theme.accent }} strokeWidth={2.4} />
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-2">
          <div className="flex-1 min-w-0 flex items-center gap-1.5">
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[12px] font-bold shrink-0"
              style={{ background: theme.badgeBg, color: theme.badgeText }}
            >
              {theme.label}
            </span>

            {showRoomName && (
              <span
                className="text-[21px] font-bold truncate min-w-0 leading-tight tracking-tight"
                style={{ color: theme.roomNameColor }}
                title={snapshot.roomName || undefined}
              >
                {snapshot.roomName || "同步中…"}
              </span>
            )}

            {phase === "outside" && (
              <span className="text-[11px] truncate min-w-0" style={{ color: "#94a3b8" }}>
                当前不在实验区域内
              </span>
            )}

            {phase === "unknown" && (
              <span className="text-[11px] shrink-0" style={{ color: "#b45309" }}>
                等待系统同步
              </span>
            )}
          </div>

          {showDwell || showActivationPill || showLeavePill ? (
            <div className="flex items-center justify-end gap-1.5 shrink-0 ml-auto">
              {showDwell && (
                <PresencePill theme={PRESENCE_DWELL_THEME}>
                  在场 {formatElapsedDuration(snapshot.dwellSeconds!)}
                </PresencePill>
              )}

              {showActivationPill && (
                <PresencePill theme={PRESENCE_PENDING_THEME} urgent={countdownUrgent}>
                  激活 {countdownText}
                </PresencePill>
              )}

              {showLeavePill && (
                <PresencePill theme={PRESENCE_AUTO_EXIT_THEME} urgent={countdownUrgent}>
                  签退 {countdownText}
                </PresencePill>
              )}
            </div>
          ) : null}
        </div>
      </div>

      {/* 豁免状态行 */}
      {snapshot.exemptStatus && snapshot.exemptStatus.phase !== "none" && (() => {
        const exempt = snapshot.exemptStatus;
        const theme = EXEMPT_THEME[exempt.phase];
        const ExemptIcon = theme.icon;

        const roomText = exempt.roomNames && exempt.roomNames.length > 0
          ? exempt.roomNames.join(" · ")
          : "—";

        let rightPill: string | null = null;
        if (exempt.phase === "pending_review") {
          rightPill = exempt.extendUntilTime
            ? `延长至 ${exempt.extendUntilTime}`
            : null;
        } else if (exempt.phase === "approved_active") {
          if (exempt.mode === "COUNT") {
            const count = exempt.maxCount != null
              ? `剩余 ${Math.max(0, exempt.maxCount - exempt.usedCount)}/${exempt.maxCount} 次`
              : null;
            rightPill = count;
          } else if (exempt.mode === "BOTH") {
            const time = exempt.remainingText || "";
            const count = exempt.maxCount != null
              ? `剩余 ${Math.max(0, exempt.maxCount - exempt.usedCount)}/${exempt.maxCount} 次`
              : "";
            rightPill = [time, count].filter(Boolean).join(" · ");
          } else {
            // TIME mode (default)
            rightPill = exempt.remainingText && exempt.expireAt
              ? `${exempt.remainingText} · 至 ${exempt.expireAt.slice(11, 16)}`
              : exempt.remainingText || null;
          }
        } else if (exempt.phase === "approved_expired") {
          rightPill = exempt.expireAt
            ? `已到期（至 ${exempt.expireAt.slice(11, 16)}）`
            : "已到期";
        }
        // rejected: no right pill

        return (
          <>
            <div
              className="mt-2 pt-2 flex items-center gap-1.5 flex-wrap"
              style={{ borderTop: `1px dashed ${theme.border}` }}
            >
              <ExemptIcon className="size-[15px] shrink-0" style={{ color: theme.accent }} strokeWidth={2.2} />
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold shrink-0"
                style={{ background: theme.soft, color: theme.text }}
              >
                {theme.badge}
              </span>
              <span className="text-[11px] truncate min-w-0" style={{ color: "#64748b" }}>
                {exempt.phase === "rejected" ? `已申请 · ${roomText} · 已拒绝` : roomText}
              </span>
              {rightPill && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold tabular-nums whitespace-nowrap shrink-0 ml-auto"
                  style={{
                    background: theme.soft,
                    border: `1px solid ${theme.border}`,
                    color: theme.text,
                  }}
                >
                  {rightPill}
                </span>
              )}
            </div>
          </>
        );
      })()}
    </div>
  );
}
