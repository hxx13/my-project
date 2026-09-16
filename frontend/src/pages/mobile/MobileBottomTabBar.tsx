/** 手机版底栏 — 对齐小程序 custom-tab-bar / van-tabbar */
import {
  MOBILE_TAB_BAR_CONTENT_H,
  MOBILE_TAB_BAR_KEYS,
  MOBILE_TAB_BAR_LABELS,
  resolveTabBarHighlight,
  type MobileShellTabKey,
  type MobileTabBarKey,
} from "./mobileShellLayout";
import { MOBILE_STUDENT_ICON } from "./mobileStudentIcons";

const TAB_ICON_SRC: Partial<Record<MobileTabBarKey, string>> = {
  home: MOBILE_STUDENT_ICON.home,
  rooms: MOBILE_STUDENT_ICON.room,
  material: MOBILE_STUDENT_ICON.supplies,
  cage: MOBILE_STUDENT_ICON.cage,
  mine: MOBILE_STUDENT_ICON.mine,
};

function TabIcon({ tabKey, active }: { tabKey: MobileTabBarKey; active: boolean }) {
  const iconSrc = TAB_ICON_SRC[tabKey];
  if (!iconSrc) return null;
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
