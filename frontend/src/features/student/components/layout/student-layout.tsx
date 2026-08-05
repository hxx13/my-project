import { useState, useCallback, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { StudentSidebar } from "./student-sidebar";
import { readStudentNavLock, appendStudentNavRecent } from "./student-nav-personalization";
import { StudentHeader } from "./student-header";
import { StudentCommandPalette } from "./student-command-palette";
import { authStorage } from "@/features/auth/authStorage";
import { getImpersonationState, returnToStaffView } from "@/features/auth/impersonation";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS } from "@/config/idleTimeout";
import { useTheme } from "@/features/theme/ThemeProvider";
import { NightSkyBackdropDecor } from "@/features/night-sky/NightSkyBackdropDecor";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

export default function StudentLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, effectiveMode } = useTheme();
  const isDark = effectiveMode === "dark";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  const { showWarning, remainingSeconds } = useIdleTimeout({
    timeoutMs: IDLE_TIMEOUT_MS,
    warningMs: IDLE_WARNING_MS,
    onTimeout: () => {
      if (authStorage.isMirrorMode()) { authStorage.exitMirrorMode(); navigate("/console/admin", { replace: true }); return; }
      if (getImpersonationState()?.isImpersonating) { returnToStaffView(); navigate("/console/admin", { replace: true }); return; }
      const restored = authStorage.restorePreviousSession();
      if (!restored) authStorage.clear();
      navigate("/");
    },
  });

  const handleToggleCollapse = useCallback(() => setSidebarCollapsed((p) => !p), []);

  /* Ctrl+K */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setCommandOpen((o) => !o); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* Recent tracking */
  useEffect(() => {
    if (location.pathname !== "/student/home") appendStudentNavRecent(location.pathname);
  }, [location.pathname]);

  /* Lock redirect */
  useEffect(() => {
    const lock = readStudentNavLock();
    if (lock && lock !== "/student/home" && location.pathname === "/student/home") {
      const state = (location.state as { skipLockRedirect?: boolean } | null);
      if (!state?.skipLockRedirect) navigate(lock, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={cn(
        "flex h-screen overflow-hidden",
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
      <StudentSidebar collapsed={sidebarCollapsed} onToggle={handleToggleCollapse} onOpenCommand={() => setCommandOpen(true)} />

      {/* Mobile nav */}
      <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <DialogContent variant="leftSheet" className="border-neutral-800 bg-gradient-to-b from-neutral-950 to-neutral-900 text-neutral-100">
          <DialogTitle className="sr-only">学生端导航菜单</DialogTitle>
          <DialogDescription className="sr-only">导航链接</DialogDescription>
          <div className="flex max-h-[100dvh] min-h-0 flex-col overflow-hidden px-5 pt-5 pb-[env(safe-area-inset-bottom,0px)]">
            <StudentSidebar collapsed={false} onToggle={() => setMobileMenuOpen(false)} />
          </div>
        </DialogContent>
      </Dialog>

      {/* Command palette */}
      <StudentCommandPalette open={commandOpen} onOpenChange={setCommandOpen} />

      {/* Right content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <StudentHeader onMenuClick={() => setMobileMenuOpen(true)} onOpenCommand={() => setCommandOpen(true)} />

        <main
          className={cn(
            "flex-1 overflow-y-auto overscroll-y-contain p-6",
            isDark ? "bg-transparent" : "bg-[var(--student-canvas-soft)]",
          )}
        >
          <Outlet />
        </main>
      </div>

      {/* Idle timeout */}
      {showWarning && (
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40">
          <div className="rounded-xl border border-[var(--student-hairline)] bg-[var(--student-canvas)] px-6 py-4 text-center shadow-[var(--student-shadow-modal)]">
            <p className="text-sm font-bold text-[var(--student-ink)]">长时间未操作</p>
            <p className="my-2 text-2xl font-black text-[var(--student-primary)]">{remainingSeconds}s</p>
            <p className="text-xs text-[var(--student-mute)]">秒后自动退出，点击任意位置继续使用</p>
          </div>
        </div>
      )}
    </div>
  );
}
