import { useState, useCallback } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { StudentSidebar } from "./student-sidebar";
import { StudentHeader } from "./student-header";
import { authStorage } from "@/features/auth/authStorage";
import { useIdleTimeout } from "@/hooks/useIdleTimeout";
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS } from "@/config/idleTimeout";

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const { showWarning, remainingSeconds } = useIdleTimeout({
    timeoutMs: IDLE_TIMEOUT_MS,
    warningMs: IDLE_WARNING_MS,
    onTimeout: () => {
      authStorage.clear();
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
    <div className="h-screen flex bg-[var(--student-canvas-soft)]">
      {/* Desktop sidebar */}
      <div className="hidden lg:block shrink-0">
        <StudentSidebar collapsed={sidebarCollapsed} onToggle={handleToggleCollapse} />
      </div>

      {/* Mobile sidebar overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden
          />
          <div className="absolute left-0 top-0 h-full z-50">
            <StudentSidebar
              collapsed={false}
              onToggle={() => setMobileMenuOpen(false)}
            />
          </div>
        </div>
      )}

      {/* Right content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <StudentHeader onMenuClick={() => setMobileMenuOpen(true)} />

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>

      {/* Idle timeout warning overlay */}
      {showWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-slate-800 border border-white/10 rounded-xl px-6 py-4 text-center text-white shadow-2xl">
            <p className="text-sm font-bold">长时间未操作</p>
            <p className="text-2xl font-black text-purple-400 my-2">{remainingSeconds}s</p>
            <p className="text-xs text-slate-400">秒后自动退出，点击任意位置继续使用</p>
          </div>
        </div>
      )}
    </div>
  );
}
