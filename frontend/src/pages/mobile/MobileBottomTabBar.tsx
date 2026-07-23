/** 手机版底栏 — 对齐小程序 custom-tab-bar / van-tabbar */
import type { ComponentType } from "react";
import {
  MOBILE_TAB_BAR_CONTENT_H,
  MOBILE_TAB_BAR_KEYS,
  MOBILE_TAB_BAR_LABELS,
  resolveTabBarHighlight,
  type MobileShellTabKey,
  type MobileTabBarKey,
} from "./mobileShellLayout";
import { MOBILE_STUDENT_ICON } from "./mobileStudentIcons";

type SvgIcon = ComponentType<{ active: boolean }>;

const stroke = (active: boolean) => ({
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: active ? "#1989fa" : "#646566",
  strokeWidth: active ? 2.2 : 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

/** 小程序 van-icon home-o */
const IconHome: SvgIcon = ({ active }) => (
  <svg {...stroke(active)}>
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
    <path d="M9 21V12h6v9" />
  </svg>
);

/** 小程序 van-icon manager-o */
const IconMine: SvgIcon = ({ active }) => (
  <svg {...stroke(active)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0112 0v1" />
  </svg>
);

const TAB_ICON_SRC: Partial<Record<MobileTabBarKey, string>> = {
  rooms: MOBILE_STUDENT_ICON.room,
  material: MOBILE_STUDENT_ICON.supplies,
  cage: MOBILE_STUDENT_ICON.cage,
};

const TAB_SVG_ICONS: Partial<Record<MobileTabBarKey, SvgIcon>> = {
  home: IconHome,
  mine: IconMine,
};

function TabIcon({ tabKey, active }: { tabKey: MobileTabBarKey; active: boolean }) {
  const iconSrc = TAB_ICON_SRC[tabKey];
  if (iconSrc) {
    return (
      <img
        src={iconSrc}
        alt=""
        draggable={false}
        className="block object-contain select-none pointer-events-none"
        style={{
          width: 22,
          height: 22,
          opacity: active ? 1 : 0.72,
        }}
      />
    );
  }

  const Svg = TAB_SVG_ICONS[tabKey];
  if (!Svg) return null;
  return <Svg active={active} />;
}

interface MobileBottomTabBarProps {
  active: MobileShellTabKey;
  onChange: (key: MobileTabBarKey) => void;
}

export default function MobileBottomTabBar({ active, onChange }: MobileBottomTabBarProps) {
  const highlight = resolveTabBarHighlight(active);

  return (
    <nav
      className="relative shrink-0 w-full z-[var(--z-sticky)]"
      style={{
        background: "#ffffff",
        borderTop: "1px solid #ebedf0",
        boxShadow:
          "0 -2px 10px rgba(15, 23, 42, 0.06), 0 -8px 24px rgba(15, 23, 42, 0.04)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      aria-label="主导航"
    >
      <div className="flex items-stretch" style={{ height: MOBILE_TAB_BAR_CONTENT_H }}>
        {MOBILE_TAB_BAR_KEYS.map((key) => {
          const isOn = highlight === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0 active:opacity-80 transition-transform duration-75"
              style={{ transform: isOn ? "translateY(-1px)" : undefined }}
              aria-current={isOn ? "page" : undefined}
            >
              <span
                className="flex items-center justify-center transition-transform duration-75"
                style={{ transform: isOn ? "scale(1.1)" : "scale(1)" }}
              >
                <TabIcon tabKey={key} active={isOn} />
              </span>
              <span
                className="text-[11px] leading-none font-medium truncate max-w-full px-1"
                style={{ color: isOn ? "#1989fa" : "#646566" }}
              >
                {MOBILE_TAB_BAR_LABELS[key]}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
