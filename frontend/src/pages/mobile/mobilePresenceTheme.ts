/** 首页进出状态 — 语义色（已进入 / 已离场 / 各计时器） */
import { Sparkles, Clock, AlarmClock, XCircle } from "lucide-react";
import type { ExemptDisplayPhase } from "@/api/domains/mobileStudent.api";
import type { MobilePresenceSnapshot } from "./useMobilePresenceStatus";

export type PresenceMainTheme = {
  label: string;
  /** 状态主色 */
  accent: string;
  accentSoft: string;
  border: string;
  cardBg: string;
  iconBg: string;
  badgeBg: string;
  badgeText: string;
  /** 已进入时房间名 — 与状态徽章区分 */
  roomNameColor: string;
};

export const PRESENCE_MAIN_THEME: Record<
  MobilePresenceSnapshot["currentState"],
  PresenceMainTheme
> = {
  INSIDE: {
    label: "已进入",
    accent: "#07c160",
    accentSoft: "rgba(7,193,96,0.14)",
    border: "rgba(7,193,96,0.35)",
    cardBg: "rgba(7,193,96,0.06)",
    iconBg: "rgba(7,193,96,0.16)",
    badgeBg: "#07c160",
    badgeText: "#ffffff",
    roomNameColor: "#ac1736",
  },
  OUTSIDE: {
    label: "已离场",
    accent: "#64748b",
    accentSoft: "rgba(100,116,139,0.12)",
    border: "rgba(100,116,139,0.28)",
    cardBg: "rgba(248,250,252,0.95)",
    iconBg: "rgba(148,163,184,0.2)",
    badgeBg: "#64748b",
    badgeText: "#ffffff",
    roomNameColor: "#64748b",
  },
  UNKNOWN: {
    label: "状态未知",
    accent: "#ed6a0c",
    accentSoft: "rgba(237,106,12,0.12)",
    border: "rgba(237,106,12,0.32)",
    cardBg: "rgba(237,106,12,0.06)",
    iconBg: "rgba(237,106,12,0.16)",
    badgeBg: "#ed6a0c",
    badgeText: "#ffffff",
    roomNameColor: "#c2410c",
  },
};

/** 在场时长 — 蓝色系，与「已进入」绿色区分 */
export const PRESENCE_DWELL_THEME = {
  accent: "#2563eb",
  soft: "rgba(37,99,235,0.1)",
  border: "rgba(37,99,235,0.22)",
  text: "#1d4ed8",
};

/** 待激活倒计时 — 橙色系 */
export const PRESENCE_PENDING_THEME = {
  accent: "#ea580c",
  soft: "rgba(234,88,12,0.1)",
  border: "rgba(234,88,12,0.28)",
  text: "#c2410c",
};

/** 延时签退 / 自动签退 — 品牌红 */
export const PRESENCE_AUTO_EXIT_THEME = {
  accent: "#ac1736",
  soft: "rgba(172,23,54,0.1)",
  border: "rgba(172,23,54,0.28)",
  text: "#9f1239",
};

export type PresenceDisplayPhase =
  | "pending_activation"
  | "inside"
  | "pending_leave"
  | "outside"
  | "unknown";

/** 按计时器 / 进出状态解析首页展示阶段（徽章文案与配色） */
export function resolvePresenceDisplay(snapshot: MobilePresenceSnapshot): {
  phase: PresenceDisplayPhase;
  theme: PresenceMainTheme;
} {
  const { currentState, inPendingActivation, inAutoExitScheduled } = snapshot;

  if (currentState === "INSIDE") {
    if (inPendingActivation) {
      return {
        phase: "pending_activation",
        theme: {
          label: "待激活",
          accent: PRESENCE_PENDING_THEME.accent,
          accentSoft: PRESENCE_PENDING_THEME.soft,
          border: PRESENCE_PENDING_THEME.border,
          cardBg: "rgba(234,88,12,0.06)",
          iconBg: "rgba(234,88,12,0.14)",
          badgeBg: PRESENCE_PENDING_THEME.accent,
          badgeText: "#ffffff",
          roomNameColor: "#c2410c",
        },
      };
    }
    if (inAutoExitScheduled) {
      return {
        phase: "pending_leave",
        theme: {
          label: "待离开",
          accent: PRESENCE_AUTO_EXIT_THEME.accent,
          accentSoft: PRESENCE_AUTO_EXIT_THEME.soft,
          border: PRESENCE_AUTO_EXIT_THEME.border,
          cardBg: "rgba(172,23,54,0.06)",
          iconBg: "rgba(172,23,54,0.14)",
          badgeBg: PRESENCE_AUTO_EXIT_THEME.accent,
          badgeText: "#ffffff",
          roomNameColor: "#9f1239",
        },
      };
    }
    return { phase: "inside", theme: PRESENCE_MAIN_THEME.INSIDE };
  }

  if (currentState === "OUTSIDE") {
    return {
      phase: "outside",
      theme: { ...PRESENCE_MAIN_THEME.OUTSIDE, label: "已离开" },
    };
  }

  return { phase: "unknown", theme: PRESENCE_MAIN_THEME.UNKNOWN };
}

export type ExemptTheme = {
  icon: typeof Sparkles;
  badge: string;
  accent: string;
  soft: string;
  border: string;
  text: string;
};

export const EXEMPT_THEME: Record<ExemptDisplayPhase, ExemptTheme> = {
  none: {
    icon: Sparkles,
    badge: "",
    accent: "transparent",
    soft: "transparent",
    border: "transparent",
    text: "transparent",
  },
  pending_review: {
    icon: Clock,
    badge: "待审核",
    accent: "#d97706",
    soft: "rgba(217,119,6,0.1)",
    border: "rgba(217,119,6,0.28)",
    text: "#b45309",
  },
  approved_active: {
    icon: Sparkles,
    badge: "已授权",
    accent: "#16a34a",
    soft: "rgba(22,163,74,0.1)",
    border: "rgba(22,163,74,0.28)",
    text: "#15803d",
  },
  approved_expired: {
    icon: AlarmClock,
    badge: "已过期",
    accent: "#dc2626",
    soft: "rgba(220,38,38,0.1)",
    border: "rgba(220,38,38,0.28)",
    text: "#b91c1c",
  },
  rejected: {
    icon: XCircle,
    badge: "已拒绝",
    accent: "#6b7280",
    soft: "rgba(107,114,128,0.1)",
    border: "rgba(107,114,128,0.28)",
    text: "#4b5563",
  },
};
