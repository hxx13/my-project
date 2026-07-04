import { useState, useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { StudentSidebar } from "./student-sidebar";
import { StudentHeader } from "./student-header";
import { authStorage } from "@/features/auth/authStorage";
import { getImpersonationState, returnToStaffView } from "@/features/auth/impersonation";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS } from "@/config/idleTimeout";
import { useTheme } from "@/features/theme/ThemeProvider";
import { NightSkyBackdropDecor } from "@/features/night-sky/NightSkyBackdropDecor";
import { cn } from "@/lib/utils";

const SIDEBAR_COLLAPSED_KEY = "aro-student-sidebar-collapsed";

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export default function StudentLayout() {
  const navigate = useNavigate();
  const { theme } = useTheme();
  const isDark = theme.mode === "dark";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { showWarning, remainingSeconds } = useIdleTimeout({
    timeoutMs: IDLE_TIMEOUT_MS,
    warningMs: IDLE_WARNING_MS,
    onTimeout: () => {
      // Mirror mode timeout: exit mirror mode, return to staff view
      if (authStorage.isMirrorMode()) {
        authStorage.exitMirrorMode();
        navigate("/admin", { replace: true });
        return;
      }
      if (getImpersonationState()?.isImpersonating) {
        returnToStaffView();
        navigate("/admin", { replace: true });
        return;
      }
      // 扫码特殊通道：恢复终端操作员会话；普通学生则清空
      const restored = authStorage.restorePreviousSession();
      if (!restored) authStorage.clear();
      navigate("/");
    },
  });

  const handleToggleCollapse = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return (
    <div
      className={cn(
        "relative flex h-screen",
        theme.className,
        isDark && "dark student-layout-root--night-sky",
        !isDark && "bg-[var(--student-canvas-soft)]",
      )}
      style={isDark ? { backgroundColor: "var(--app-color-scan-backdrop-from)" } : undefined}
    >
      {isDark ? (
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
          <NightSkyBackdropDecor ultraRich includeOrbs={false} />
        </div>
      ) : null}

      {/* Desktop sidebar */}
      <div className="relative z-10 hidden shrink-0 lg:block">
        <StudentSidebar collapsed={sidebarCollapsed} onToggle={handleToggleCollapse} />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[var(--z-dropdown)] lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-0 z-[var(--z-modal)] h-full">
            <StudentSidebar
              collapsed={false}
              onToggle={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Right content area */}
      <div className="relative z-10 flex min-h-0 min-w-0 flex-1 flex-col">
        <StudentHeader onMenuClick={() => setMobileMenuOpen(true)} />

        <main
          className={cn(
            "min-h-0 flex-1 overflow-y-auto overscroll-y-contain p-6",
            isDark && "bg-transparent",
          )}
        >
          <Outlet />
        </main>
      </div>

      {/* Idle timeout warning overlay */}
      {showWarning && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40">
          <div
            className="rounded-xl border border-[var(--student-hairline)] bg-[var(--student-canvas)] px-6 py-4 text-center shadow-[var(--student-shadow-modal)]"
          >
            <p className="text-sm font-bold text-[var(--student-ink)]">长时间未操作</p>
            <p className="my-2 text-2xl font-black text-[var(--student-primary)]">{remainingSeconds}s</p>
            <p className="text-xs text-[var(--student-mute)]">秒后自动退出，点击任意位置继续使用</p>
          </div>
        </div>
      )}
    </div>
  );
}
