import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, ChevronDown, LogOut, Mail, Menu, MessageCircle, Search, Smartphone, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { authStorage } from "@/features/auth/authStorage";
import { getImpersonationState, returnToStaffView, fullLogout } from "@/features/auth/impersonation";
import { resolvePersonnelAvatarUrl } from "@/utils/personnelAvatarUrl";
import { useStudentProfile } from "../../hooks/use-student-profile";
import { toast } from "react-hot-toast";
import { sendVerificationCode, bindEmailWithCode } from "@/api/domains/auth.api";
import { WxPusherBindModal } from "@/components/shared/WxPusherBindModal";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeSwitcher } from "@/features/theme/ThemeSwitcher";
import { PageHelpHost } from "@/features/page-help/PageHelpHost";

import { appConfirm } from "@/lib/appDialog";
interface StudentHeaderProps {
  onMenuClick: () => void;
  onOpenCommand?: () => void;
}

export function StudentHeader({ onMenuClick, onOpenCommand }: StudentHeaderProps) {
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
  const personnelId = profile?.personnel?.userId || "";

  // Email binding
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeSending, setEmailCodeSending] = useState(false);
  const [emailCodeCooldown, setEmailCodeCooldown] = useState(0);
  const [emailSaving, setEmailSaving] = useState(false);
  const [currentEmail, setCurrentEmail] = useState("");
  // SendKey binding
  const [sendKeyOpen, setSendKeyOpen] = useState(false);
  const [sendKeyDraft, setSendKeyDraft] = useState("");
  const [sendKeySaving, setSendKeySaving] = useState(false);
  const [currentSendKey, setCurrentSendKey] = useState(false);
  // WxPusher binding
  const [wxPusherOpen, setWxPusherOpen] = useState(false);
  const [currentWxPusher, setCurrentWxPusher] = useState(false);

  // 读取 email + sendKey + wxPusher
  useEffect(() => {
    if (!personnelId) return;
    const token = authStorage.getToken();
    const headers = { Authorization: "Bearer " + token };
    fetch(`/api/admin/personnel/${encodeURIComponent(personnelId)}/contact-email`, { headers })
      .then((r) => r.json().catch(() => ({})))
      .then((body) => setCurrentEmail(body?.data?.email || ""))
      .catch(() => {});
    fetch(`/api/admin/personnel/${encodeURIComponent(personnelId)}/send-key`, { headers })
      .then((r) => r.json().catch(() => ({})))
      .then((body) => setCurrentSendKey(!!body?.data?.sendKey))
      .catch(() => {});
    fetch(`/api/admin/personnel/${encodeURIComponent(personnelId)}/wx-pusher-uid`, { headers })
      .then((r) => r.json().catch(() => ({})))
      .then((body) => setCurrentWxPusher(!!body?.data?.hasWxPusherUid))
      .catch(() => {});
    // URL 自动捕获 sendkey
    const params = new URLSearchParams(window.location.search);
    const sk = params.get("sendkey");
    if (sk && params.get("bindUserId") === personnelId) {
      setSendKeyDraft(sk);
      setSendKeyOpen(true);
    }
  }, [personnelId]);

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
    navigate("/", { replace: true });
  };

  const breadcrumbMap: Record<string, string> = {
    "/student/home": "首页",
    "/student/records": "出入记录",
    "/student/rooms": "我的房间",
    "/student/cage-shelf": "笼架信息",
    "/student/material": "申领物品",
    "/student/material/requests": "我的申领",
    "/student/material/stats": "物品统计",
    "/student/notifications": "通知",
    "/student/feedback": "帮助反馈",
    "/student/settings": "设置",
    "/student/animal-order": "实验动物订购",
  };

  const currentLabel = breadcrumbMap[pathname] || "";

  return (
    <header
      className={cn(
        "sticky top-0 z-20 flex min-h-16 shrink-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-[var(--student-hairline)] px-4 py-2 shadow-sm sm:px-6 md:h-16 md:flex-nowrap md:py-0",
        "bg-[var(--student-canvas)]/95 backdrop-blur-md",
      )}
    >
      {/* Left side */}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 md:flex-1 md:flex-nowrap">
        <button
          type="button"
          onClick={onMenuClick}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--student-hairline)] bg-[var(--student-canvas)] text-[var(--student-body)] hover:bg-[var(--student-canvas-soft)] md:hidden"
          aria-label="打开导航菜单"
        >
          <Menu className="h-4 w-4" />
        </button>

        {/* Search — matches admin header Ctrl+K search bar */}
        {onOpenCommand ? (
          <button
            type="button"
            onClick={onOpenCommand}
            className="flex min-w-0 max-w-full flex-1 items-center gap-2 rounded-lg border border-[var(--student-hairline)] bg-[var(--student-canvas-soft)] px-3 py-2 text-left text-sm text-[var(--student-mute)] hover:bg-[var(--student-canvas-soft-2)] sm:max-w-md"
          >
            <Search className="h-4 w-4 shrink-0 opacity-60" />
            <span className="min-w-0 flex-1 truncate">搜索页面…</span>
            <kbd className="hidden shrink-0 rounded border border-[var(--student-hairline)] bg-[var(--student-canvas)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--student-mute)] sm:inline">
              Ctrl K
            </kbd>
          </button>
        ) : null}

        {/* Page title — like admin's adminHeaderTitle h1 */}
        <h1 className="hidden min-w-0 truncate text-base font-semibold tracking-tight text-[var(--student-ink)] sm:block">
          {currentLabel || "学生中心"}
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

            {/* Email binding */}
            <DropdownMenuItem onSelect={() => {
              if (!personnelId) { toast.error("无法获取人员ID"); return; }
              setEmailDraft(currentEmail);
              setEmailOpen(true);
            }}>
              <Mail className="mr-2 h-4 w-4" />
              {currentEmail ? `邮箱: ${currentEmail}` : "绑定邮箱"}
            </DropdownMenuItem>

            {/* SendKey */}
            <DropdownMenuItem onSelect={async () => {
              if (!personnelId) { toast.error("无法获取人员ID"); return; }
              if (currentSendKey) {
                if (!await appConfirm("已绑定微信通知，是否取消绑定？")) return;
                const token = authStorage.getToken();
                fetch(`/api/admin/personnel/${encodeURIComponent(personnelId)}/send-key`, {
                  method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
                  body: JSON.stringify({ sendKey: "" }),
                }).then((r) => {
                  if (r.ok) { setCurrentSendKey(false); toast.success("已取消微信通知绑定"); }
                  else toast.error("取消失败");
                }).catch(() => toast.error("取消失败"));
                return;
              }
              setSendKeyDraft("");
              setSendKeyOpen(true);
            }}>
              <MessageCircle className="mr-2 h-4 w-4" />
              {currentSendKey ? "微信通知: 已绑定" : "绑定微信通知"}
            </DropdownMenuItem>

            {/* WxPusher */}
            <DropdownMenuItem onSelect={async () => {
              if (!personnelId) { toast.error("无法获取人员ID"); return; }
              if (currentWxPusher) {
                if (!await appConfirm("已绑定 WxPusher 推送，是否取消绑定？")) return;
                const token = authStorage.getToken();
                fetch(`/api/admin/personnel/${encodeURIComponent(personnelId)}/wx-pusher-uid`, {
                  method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
                  body: JSON.stringify({ wxPusherUid: "" }),
                }).then((r) => {
                  if (r.ok) { setCurrentWxPusher(false); toast.success("已取消 WxPusher 推送绑定"); }
                  else toast.error("取消失败");
                }).catch(() => toast.error("取消失败"));
                return;
              }
              setWxPusherOpen(true);
            }}>
              <Smartphone className="mr-2 h-4 w-4" />
              {currentWxPusher ? "WxPusher推送: 已绑定" : "绑定WxPusher推送"}
            </DropdownMenuItem>

            {showLogout ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-[var(--student-error)] focus:bg-[var(--student-error-soft)] focus:text-[var(--student-error)]"
                  onSelect={handleLogout}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  退出登录
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Email edit dialog */}
      {emailOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--student-canvas)] dark:bg-gray-900 p-5 shadow-xl">
            <h3 className="text-base font-semibold text-[var(--student-ink)] dark:text-gray-100">绑定邮箱</h3>
            <p className="mt-1 text-xs text-[var(--student-mute)] dark:text-gray-400">设置用于接收通知的联系邮箱</p>
            <input
              type="email"
              value={emailDraft}
              onChange={(e) => { setEmailDraft(e.target.value); setEmailCode(""); }}
              maxLength={128}
              className="mt-3 w-full rounded-xl border border-[var(--student-hairline)] dark:border-gray-700 px-3 py-2.5 text-sm text-[var(--student-ink)] dark:text-gray-100 bg-[var(--student-canvas-soft)] dark:bg-gray-800"
              placeholder="请输入邮箱地址"
            />
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                inputMode="numeric"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                maxLength={6}
                className="flex-1 rounded-xl border border-[var(--student-hairline)] dark:border-gray-700 px-3 py-2.5 text-sm text-[var(--student-ink)] dark:text-gray-100 bg-[var(--student-canvas-soft)] dark:bg-gray-800"
                placeholder="6位验证码"
              />
              <button
                type="button"
                disabled={!emailDraft.trim() || emailCodeSending || emailCodeCooldown > 0}
                className="shrink-0 rounded-xl bg-indigo-50 dark:bg-indigo-900/40 px-3 py-2.5 text-sm font-medium text-indigo-600 dark:text-indigo-400 disabled:opacity-40"
                onClick={async () => {
                  if (!emailDraft.trim()) return;
                  setEmailCodeSending(true);
                  try {
                    const r = await sendVerificationCode(emailDraft.trim(), "BIND_EMAIL");
                    toast.success(r.message || "验证码已发送");
                    setEmailCodeCooldown(r.cooldownSeconds || 60);
                  } catch (e: any) {
                    toast.error(e?.message || "发送失败");
                  } finally {
                    setEmailCodeSending(false);
                  }
                }}
              >
                {emailCodeCooldown > 0 ? `${emailCodeCooldown}s` : emailCodeSending ? "发送中" : "获取验证码"}
              </button>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-xl border border-[var(--student-hairline)] dark:border-gray-700 px-4 py-2 text-sm text-[var(--student-body)] dark:text-gray-300"
                onClick={() => { setEmailOpen(false); setEmailCode(""); setEmailCodeCooldown(0); }}>取消</button>
              <button type="button" disabled={!emailDraft.trim() || emailCode.length !== 6 || emailSaving}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                onClick={async () => {
                  setEmailSaving(true);
                  try {
                    await bindEmailWithCode(emailDraft.trim(), emailCode.trim());
                    toast.success("邮箱已绑定");
                    setCurrentEmail(emailDraft.trim());
                    setEmailOpen(false);
                    setEmailCode("");
                    setEmailCodeCooldown(0);
                  } catch (e: any) {
                    toast.error(e?.message || "保存失败");
                  } finally { setEmailSaving(false); }
                }}
              >{emailSaving ? "绑定中…" : "确认绑定"}</button>
            </div>
          </div>
        </div>
      )}

      {/* SendKey binding dialog */}
      {sendKeyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div className="w-full max-w-sm rounded-2xl bg-[var(--student-canvas)] dark:bg-gray-900 p-5 shadow-xl">
            <h3 className="text-base font-semibold text-[var(--student-ink)] dark:text-gray-100">绑定微信通知</h3>
            <p className="mt-1 text-xs text-[var(--student-mute)] dark:text-gray-400">通过 Server酱 SendKey 接收微信推送通知</p>
            <a
              href={`https://sct.ftqq.com/appkey/create/forward?name=ARO&url=${encodeURIComponent(`${window.location.origin}/#/student/home?sendkey={key}&bindUserId=${encodeURIComponent(personnelId)}`)}`}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 underline underline-offset-2 hover:text-indigo-800"
            >
              还没有 SendKey？点此前往 Server酱 创建 →
            </a>
            <input type="text" value={sendKeyDraft} onChange={(e) => setSendKeyDraft(e.target.value)} maxLength={256}
              className="mt-3 w-full rounded-xl border border-[var(--student-hairline)] dark:border-gray-700 px-3 py-2.5 text-sm text-[var(--student-ink)] dark:text-gray-100 bg-[var(--student-canvas-soft)] dark:bg-gray-800"
              placeholder="粘贴 SendKey" />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded-xl border border-[var(--student-hairline)] dark:border-gray-700 px-4 py-2 text-sm text-[var(--student-body)] dark:text-gray-300"
                onClick={() => setSendKeyOpen(false)}>取消</button>
              <button type="button" disabled={!sendKeyDraft.trim() || sendKeySaving}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm text-white disabled:opacity-50"
                onClick={async () => {
                  setSendKeySaving(true);
                  try {
                    const token = authStorage.getToken();
                    const res = await fetch(`/api/admin/personnel/${encodeURIComponent(personnelId)}/send-key`, {
                      method: "PUT", headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
                      body: JSON.stringify({ sendKey: sendKeyDraft.trim() }),
                    });
                    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "保存失败");
                    toast.success("微信通知已绑定");
                    setCurrentSendKey(true);
                    setSendKeyOpen(false);
                  } catch (e: any) { toast.error(e?.message || "保存失败"); }
                  finally { setSendKeySaving(false); }
                }}
              >{sendKeySaving ? "保存中…" : "保存"}</button>
            </div>
          </div>
        </div>
      )}

      {/* WxPusher binding dialog */}
      <WxPusherBindModal
        open={wxPusherOpen}
        onClose={() => setWxPusherOpen(false)}
        personnelId={personnelId}
        authToken={authStorage.getToken()}
        onSaved={() => setCurrentWxPusher(true)}
      />
    </header>
  );
}
