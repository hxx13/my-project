import { useNavigate } from "react-router-dom";
import { Bell, LogOut, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { authStorage } from "@/features/auth/authStorage";
import { Avatar } from "../ui/avatar";

interface StudentHeaderProps {
  onMenuClick: () => void;
}

export function StudentHeader({ onMenuClick }: StudentHeaderProps) {
  const navigate = useNavigate();
  const userInfo = authStorage.getUserInfo();

  const displayName = userInfo?.displayName || userInfo?.displayNickname || userInfo?.username || "";

  const handleLogout = () => {
    authStorage.clear();
    navigate("/student/login", { replace: true });
  };

  return (
    <header
      className={cn(
        "flex items-center justify-between h-14 shrink-0 border-b border-[var(--student-hairline)] bg-[var(--student-canvas)] px-4",
      )}
    >
      {/* Left side */}
      <div className="flex items-center gap-3">
        {/* Hamburger - visible only on mobile */}
        <button
          type="button"
          onClick={onMenuClick}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--student-hairline)] bg-[var(--student-canvas)] text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)] lg:hidden"
          aria-label="打开导航菜单"
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Title */}
        <h1 className="text-lg font-semibold text-[var(--student-ink)] tracking-tight">
          学生中心
        </h1>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Notification bell */}
        <button
          type="button"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--student-hairline)] bg-[var(--student-canvas)] text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)] transition-colors"
          aria-label="通知"
        >
          <Bell className="h-4 w-4" />
        </button>

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--student-hairline)] bg-[var(--student-canvas)] text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)] transition-colors"
          aria-label="退出登录"
        >
          <LogOut className="h-4 w-4" />
        </button>

        {/* Avatar */}
        <Avatar name={displayName} size="sm" />
      </div>
    </header>
  );
}
