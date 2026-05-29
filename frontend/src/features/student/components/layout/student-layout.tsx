import { useState, useCallback, useEffect } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { StudentSidebar } from "./student-sidebar";
import { StudentHeader } from "./student-header";
import { authStorage } from "@/features/auth/authStorage";
import { Button } from "@/components/ui/button";

const SIDEBAR_COLLAPSED_KEY = "aro-student-sidebar-collapsed";

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export default function StudentLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [impersonatedUserId, setImpersonatedUserId] = useState<string>("");
  const navigate = useNavigate();

  useEffect(() => {
    try {
      const token = authStorage.getToken();
      if (!token) return;
      const payload = JSON.parse(atob(token.split(".")[1]));
      if (payload.impersonatedBy) {
        setIsImpersonating(true);
        setImpersonatedUserId(payload.sub || "");
      }
    } catch {
      // Not a valid JWT, ignore
    }
  }, []);

  const handleReturnToBackend = useCallback(() => {
    try {
      const raw = localStorage.getItem("admin_original_auth");
      if (raw) {
        const original = JSON.parse(raw);
        authStorage.setAuth(original.token, original.role, original.userInfo);
        localStorage.removeItem("admin_original_auth");
      }
    } catch {
      // ignore
    }
    navigate("/admin");
  }, [navigate]);

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

  const handleMobileMenuClose = useCallback(() => {
    setMobileMenuOpen(false);
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
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40"
            onClick={handleMobileMenuClose}
            aria-hidden
          />
          {/* Sidebar sheet */}
          <div className="absolute left-0 top-0 h-full z-50">
            <StudentSidebar
              collapsed={false}
              onToggle={() => {
                setMobileMenuOpen(false);
              }}
            />
          </div>
        </div>
      )}

      {/* Right content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <StudentHeader onMenuClick={() => setMobileMenuOpen(true)} />

        {/* Impersonation banner */}
        {isImpersonating && (
          <div className="flex items-center justify-between bg-amber-50 border-b border-amber-200 px-4 py-2 shrink-0">
            <span className="text-sm text-amber-800">
              当前以 ARO 人员身份查看：{impersonatedUserId}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="border-amber-300 text-amber-700 hover:bg-amber-100"
              onClick={handleReturnToBackend}
            >
              返回教职工后台
            </Button>
          </div>
        )}

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
