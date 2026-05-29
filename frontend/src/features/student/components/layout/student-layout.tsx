import { useState, useCallback } from "react";
import { Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { StudentSidebar } from "./student-sidebar";
import { StudentHeader } from "./student-header";

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

        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
