import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, ChevronDown, LogOut, Menu, UserRound } from "lucide-react";
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
  /** 镜像模式：教职工查看学生页面（不替换登录态） */
  const isMirrorMode = useMemo(() => authStorage.isMirrorMode(), []);
  const mirrorSource = useMemo(() => authStorage.getMirrorSource(), []);
  const mirrorUserInfo = useMemo(() => authStorage.getMirrorUserInfo(), []);
  /** 扫码弹窗 PIN 进入：仅允许返回扫码页，禁止退出登录以免丢失终端操作员会话 */
  const fromScanPopup = authStorage.isStudentEntryFromScan() && !isImpersonating;
  const showReturnToScanner = fromScanPopup && !isMirrorMode;
  // Mirror mode & impersonation: hide logout (staff auth is not the student's)
  const showLogout = !fromScanPopup && !isImpersonating && !isMirrorMode;

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
    navigate("/console/admin");
  };

  const handleExitMirrorMode = () => {
    authStorage.exitMirrorMode();
    navigate("/console/admin", { replace: true });
  };

  const handleLogout = () => {
    fullLogout();
    navigate("/login", { replace: true });
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

        {/* Mirror mode: return to staff backend */}
        {isMirrorMode && !isImpersonating && (
          <button
            type="button"
            onClick={handleExitMirrorMode}
            className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-blue-300 bg-blue-50 text-xs text-blue-700 hover:bg-blue-100 transition-colors dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300"
          >
            <ArrowLeft className="w-3 h-3" />
            返回首页
          </button>
        )}

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
                {isMirrorMode && !isImpersonating && (
                  <span className="truncate text-[10px] text-blue-600">镜像查看模式</span>
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
                  返回首页
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            {isMirrorMode && !isImpersonating && (
              <>
                <div className="px-2 py-1 text-[10px] text-[var(--student-mute)]">
                  镜像查看 · {mirrorUserInfo?.displayName || mirrorUserInfo?.username || "学生"}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={handleExitMirrorMode}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  返回首页
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
