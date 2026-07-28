/** 手机版顶栏 — 对齐小程序 navigationBar / subpage-nav-bar */
import { ChevronLeft } from "lucide-react";
import { MOBILE_NAV_BAR_H } from "./mobileShellLayout";

export type MobileTopNavMode = "transparent" | "solid";

interface MobileTopNavBarProps {
  mode: MobileTopNavMode;
  title?: string;
  showBack?: boolean;
  onBack?: () => void;
  /** 右侧操作按钮（图标 + 回调），仅 home 透明模式传扫码等 */
  rightAction?: React.ReactNode;
}

export default function MobileTopNavBar({
  mode,
  title = "",
  showBack = false,
  onBack,
  rightAction,
}: MobileTopNavBarProps) {
  const isSolid = mode === "solid";

  return (
    <header
      className="fixed top-0 left-0 right-0"
      style={{
        zIndex: 45,
        paddingTop: "env(safe-area-inset-top, 0px)",
        background: isSolid ? "#ffffff" : "transparent",
        borderBottom: isSolid ? "1px solid #ebedf0" : "none",
        boxShadow: isSolid ? "0 1px 0 rgba(0,0,0,0.04)" : "none",
        pointerEvents: isSolid ? "auto" : "none",
      }}
    >
      <div
        className="flex items-center relative px-2"
        style={{ height: MOBILE_NAV_BAR_H }}
      >
        {/* 左侧返回 */}
        <div className="absolute left-1 top-0 bottom-0 flex items-center z-10">
          {showBack && onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="flex items-center justify-center min-w-[40px] h-9 rounded-lg active:opacity-70"
              aria-label="返回上一级"
            >
              <ChevronLeft
                className="size-6"
                strokeWidth={2}
                style={{ color: isSolid ? "#323233" : "rgba(255,255,255,0.95)" }}
              />
            </button>
          ) : (
            <div className="w-10" />
          )}
        </div>

        {/* 标题居中 */}
        {isSolid && title ? (
          <h1
            className="flex-1 text-center text-[16px] font-semibold truncate px-12"
            style={{ color: "#323233" }}
          >
            {title}
          </h1>
        ) : (
          <div className="flex-1" />
        )}

        {/* 右侧操作按钮（扫码等） */}
        <div className="absolute right-1 top-0 bottom-0 flex items-center z-10" style={{ pointerEvents: 'auto' }}>
          {rightAction ?? <div className="w-10" />}
        </div>
      </div>
    </header>
  );
}
