import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Bell, ChevronDown, LogOut, Menu, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { authStorage } from "@/features/auth/authStorage";
import { getImpersonationState, returnToStaffView, fullLogout } from "@/features/auth/impersonation";
import { resolvePersonnelAvatarUrl } from "@/utils/personnelAvatarUrl";
import { useStudentProfile } from "../../hooks/use-student-profile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeSwitcher } from "@/features/theme/ThemeSwitcher";
import { PageHelpHost } from "@/features/page-help/PageHelpHost";

interface StudentHeaderProps {
  onMenuClick: () => void;
}

export function StudentHeader({ onMenuClick }: StudentHeaderProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const impersonation = useMemo(() => getImpersonationState(), []);
  const isImpersonating = Boolean(impersonation?.isImpersonating);
  /** 扫码弹窗 PIN 进入：仅允许返回扫码页，禁止退出登录以免丢失终端操作员会话 */
  const fromScanPopup = authStorage.isStudentEntryFromScan() && !isImpersonating;
  const showReturnToScanner = fromScanPopup;
  const showLogout = !fromScanPopup;

  // 独立拉取学生档案获取真实姓名和头像（queryKey 含当前会话 userId）
  const { data: profile, isFetching } = useStudentProfile();

  const realName = profile?.personnel?.name || "";
  const headUrl = profile?.personnel?.head
    ? resolvePersonnelAvatarUrl(profile.personnel.head)
    : null;

  const displayName = realName || (isFetching ? "加载中…" : "学生");
  const avatarLetter = realName ? realName.charAt(0) : "学";

  const handleReturnToStaff = () => {
    returnToStaffView();
    navigate("/admin");
  };

  const handleLogout = () => {
    fullLogout();
    navigate("/student/login", { replace: true });
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-[var(--z-sticky)] flex h-14 shrink-0 items-center justify-between border-b border-[var(--student-hairline)] bg-[var(--student-canvas)] px-4",
      )}
    >
      {/* Left side */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--student-hairline)] bg-[var(--student-canvas)] text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)] lg:hidden"
          aria-label="打开导航菜单"
        >
          <Menu className="h-4 w-4" />
        </button>

        <h1 className="text-lg font-semibold text-[var(--student-ink)] tracking-tight">
          学生中心
        </h1>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {showReturnToScanner ? (
          <button
            type="button"
            onClick={() => {
              const restored = authStorage.restorePreviousSession();
              navigate(restored ? "/" : "/");
            }}
            className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-[var(--student-hairline)] bg-[var(--student-canvas)] text-xs text-[var(--student-mute)] hover:text-[var(--student-ink)] hover:bg-[var(--student-canvas-soft)] transition-colors"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3 h-3">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            返回扫码页
          </button>
        ) : null}

        <ThemeSwitcher
          className="h-8 shrink-0 rounded-md border border-[var(--student-hairline)] bg-[var(--student-canvas)] px-2.5 text-[11px] font-medium text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)]"
        />

        <PageHelpHost pagePath={pathname} variant="student" enableFullHelpDialog />

        {/* Notification bell */}
        <button
          type="button"
          onClick={() => navigate("/student/notifications")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--student-hairline)] bg-[var(--student-canvas)] text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)] transition-colors"
          aria-label="通知"
        >
          <Bell className="h-4 w-4" />
        </button>

        {/* Avatar dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex max-w-full min-w-0 items-center gap-2 rounded-lg py-1.5 pl-0.5 pr-1 text-left hover:bg-[var(--student-canvas-soft)] transition-colors"
            >
              {/* 真实头像或首字母 fallback */}
              {headUrl ? (
                <img
                  src={headUrl}
                  alt={displayName}
                  className="size-8 shrink-0 rounded-full object-cover ring-1 ring-[var(--student-border)]"
                />
              ) : (
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--student-primary)] text-sm font-semibold text-white">
                  {avatarLetter}
                </span>
              )}
              <span className="hidden min-w-0 flex-col text-left sm:flex">
                <span className="truncate text-sm font-medium text-[var(--student-ink)]">
                  {displayName}
                </span>
                {isImpersonating && (
                  <span className="truncate text-[10px] text-amber-600">模拟模式</span>
                )}
              </span>
              <ChevronDown className="hidden h-4 w-4 shrink-0 text-[var(--student-mute)] sm:block" aria-hidden />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="z-[var(--z-tooltip)] w-56 border-[var(--student-hairline)] bg-[var(--student-canvas)] text-[var(--student-ink)] shadow-[var(--student-shadow-modal)]"
          >
            {/* Mobile-only name display */}
            <div className="px-2 py-1.5 sm:hidden">
              <div className="truncate text-sm font-medium text-[var(--student-ink)]">
                {displayName}
              </div>
              {isImpersonating && (
                <div className="truncate text-[11px] text-amber-600">模拟模式</div>
              )}
            </div>

            {isImpersonating && (
              <>
                <div className="px-2 py-1 text-[10px] text-[var(--student-mute)]">
                  模拟查看 · {impersonation?.impersonatedUserId}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleReturnToStaff}>
                  <UserRound className="mr-2 h-4 w-4" />
                  返回教职工后台
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            {showLogout ? (
              <DropdownMenuItem
                className="text-[var(--student-error)] focus:bg-[var(--student-error-soft)] focus:text-[var(--student-error)]"
                onSelect={handleLogout}
              >
                <LogOut className="mr-2 h-4 w-4" />
                退出登录
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
