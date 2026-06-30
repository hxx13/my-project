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

const IconHome: SvgIcon = ({ active }) => (
  <svg {...stroke(active)}>
    <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z" />
    <path d="M9 21V12h6v9" />
  </svg>
);

const IconRooms: SvgIcon = ({ active }) => (
  <svg {...stroke(active)}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </svg>
);

const IconMaterial: SvgIcon = ({ active }) => (
  <svg {...stroke(active)}>
    <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
    <line x1="3" y1="6" x2="21" y2="6" />
    <path d="M16 10a4 4 0 01-8 0" />
  </svg>
);

const IconCage: SvgIcon = ({ active }) => (
  <svg {...stroke(active)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
    <line x1="9" y1="3" x2="9" y2="21" />
    <line x1="15" y1="3" x2="15" y2="21" />
  </svg>
);

const IconMine: SvgIcon = ({ active }) => (
  <svg {...stroke(active)}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21v-1a6 6 0 0112 0v1" />
  </svg>
);

const TAB_ICONS: Record<MobileTabBarKey, SvgIcon> = {
  home: IconHome,
  rooms: IconRooms,
  material: IconMaterial,
  cage: IconCage,
  mine: IconMine,
};

interface MobileBottomTabBarProps {
  active: MobileShellTabKey;
  onChange: (key: MobileTabBarKey) => void;
}

export default function MobileBottomTabBar({ active, onChange }: MobileBottomTabBarProps) {
  const highlight = resolveTabBarHighlight(active);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[var(--z-sticky,50)]"
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
          const Icon = TAB_ICONS[key];
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
                <Icon active={isOn} />
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
