import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  History,
  Home,
  KeyRound,
  Loader2,
  LogIn,
  LogOut,
  Mail,
  Menu,
  MessageCircle,
  Smartphone,
  MessagesSquare,
  Search,
  Settings,
  Star,
  Unlink,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CasBindingContext } from "@/features/auth/CasBindingContext";
import { useQuery } from "@tanstack/react-query";
import { Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { PageTransition } from "@/components/animation/PageTransition";
import { BackfillAutoGlobalBanner } from "@/features/dahua-swing-stats/BackfillAutoGlobalBanner";
import { toast } from "react-hot-toast";
import { authStorage, AUTH_USERINFO_UPDATED_EVENT } from "@/features/auth/authStorage";
import {
  fetchPublicPagePermissions,
  notifyWebPublicPagePermissionsUpdated,
  WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED,
  type PublicPagePermissionNode,
} from "@/api/domains/pagePermission.api";
import { fetchPendingBadges, type PendingBadges } from "@/api/domains/me.api";
import { fetchPendingMaterialRequests } from "@/api/domains/material.api";
import { fetchPendingScanDelayRequests } from "@/api/domains/scanDelay.api";
import { materialQueryKeys } from "@/api/hooks/queryKeys";
import { studentReviewPendingQueryOptions } from "@/features/student-review/studentReviewPoll";
import { refreshAuthSession, sendVerificationCode, bindEmailWithCode } from "@/api/domains/auth.api";
import {
  ADMIN_NOTIFICATION_SSE_PUSH_EVENT,
  ADMIN_PENDING_BADGES_REFRESH_EVENT,
  ADMIN_STAFF_CHAT_PUSH_DETAIL_EVENT,
  STAFF_CHAT_SSE_EVENT,
  type StaffChatSsePayload,
} from "@/features/admin/adminPendingBadgesEvents";
import { handleScanDelayNotificationSse } from "@/store/useScanDelayReviewAlertStore";
import { cn } from "@/lib/utils";
import { SHSMU_LOGO_URL } from "@/constants/shsmuBranding";
import {
  createAdminNavContext,
  buildAdminNavModel,
  formatStudentReviewBadgeCount,
  isAdminAreaPath,
  normalizeAdminPath,
  patchStudentReviewNavBadges,
  injectGroupBadges,
  toAdminRoutePath,
  type AdminSidebarNavGroup,
  type AdminSidebarNavItem,
} from "@/features/admin/buildAdminNavModel";
import { ADMIN_NAV_REGISTRY, adminNavSubgroupOpenKey } from "@/features/admin/adminNavRegistry";
import {
  adminChromeTitle,
  collectSidebarEntryPathsFromPerm,
  resolveAdminShellBackTo,
  shouldShowAdminShellBack,
} from "@/features/admin/adminShellNavigation";
import {
  ADMIN_NAV_PERSONALIZATION_EVENT,
  appendAdminNavRecent,
  clearAdminNavLock,
  collectAdminSidebarVisiblePaths,
  hydrateAdminNavPersonalization,
  isAdminNavLocked,
  isAdminNavStarred,
  isFriendsSidebarGroupId,
  isPersonalSidebarGroupId,
  prependPersonalNavSidebarGroups,
  readAdminNavLock,
  readAdminNavRecent,
  readAdminNavStars,
  resolveAdminNavUserId,
  FRIENDS_GROUP_ID,
  RECENT_GROUP_ID,
  splitPersonalizedPaletteItems,
  STARS_GROUP_ID,
  toggleAdminNavStar,
} from "@/features/admin/adminNavPersonalization";
import { canShowWebEntry } from "@/features/auth/pagePermissionAccess";
import { hasMinRole } from "@/features/auth/roleAccess";
import { adminInputClass } from "@/features/admin/adminFormUi";
import { decodeQrFromFile } from "@/utils/decodeQrFromFile";
import { AdminChromeContextMenu, type AdminChromeContextMenuPayload } from "@/features/admin/AdminChromeContextMenu";
import {
  parseAdminNavLinkFromEventTarget,
  parseFriendRowFromEventTarget,
  parseSensitiveFromEventTarget,
} from "@/features/admin/adminChromeContextMenuTarget";
import { AdminCommandPalette } from "@/features/admin/AdminCommandPalette";
import { PageHelpHost } from "@/features/page-help/PageHelpHost";
import {
  ADMIN_SIDEBAR_OPEN_GROUPS_SESSION_KEY,
  ANIMAL_ROOM_TELEMETRY_RETURN_TO_KEY,
  hasPendingAdminHomeScrollRestore,
  isAdminHomeLocation,
  markAdminHomeHighlightPending,
  navigateAdminReturnTo,
  readAdminHomeScrollPosition,
  readAdminSidebarOpenGroupsSession,
  scrollAdminContentTo,
} from "@/features/admin/adminTelemetryNav";
import { Button } from "@/components/ui/button";
import { AdminButton } from "@/components/admin/AdminButton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  fetchCasBindingStatus,
  bindCasAccount,
  unbindCasAccount,
  type CasBindingStatus,
} from "@/api/domains/admin.api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeSwitcher } from "@/features/theme/ThemeSwitcher";
import { useTheme } from "@/features/theme/ThemeProvider";
import { NightSkyBackdropDecor } from "@/features/night-sky/NightSkyBackdropDecor";

const SIDEBAR_COLLAPSED_KEY = "aro-admin-sidebar-collapsed";

function routeMatches(pathname: string, to: string, end?: boolean) {
  const p = normalizeAdminPath(pathname);
  const t = normalizeAdminPath(to);
  if (end) return p === t || p === `${t}/`;
  return p === t || p.startsWith(`${t}/`);
}

function sidebarGroupAllItems(g: AdminSidebarNavGroup): AdminSidebarNavItem[] {
  return [...g.items, ...(g.subgroups?.flatMap((sg) => sg.items) ?? [])];
}

function NavPendingBadge({ text }: { text?: string }) {
  const t = (text || "").trim();
  if (!t) return null;
  return (
    <span className="ml-1 min-w-[1.25rem] shrink-0 rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white shadow-sm tabular-nums">
      {t}
    </span>
  );
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const { theme, effectiveMode } = useTheme();
  const isDark = effectiveMode === "dark";
  const [pendingBadges, setPendingBadges] = useState<PendingBadges | null>(null);
  const role = authStorage.getRole() || "MEMBER";
  const [permNodes, setPermNodes] = useState<PublicPagePermissionNode[]>([]);
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [personalBump, setPersonalBump] = useState(0);
  /** 教职工及以上：整页自定义右键；菜单内改权等仍按角色收紧 */
  const [chromeCtx, setChromeCtx] = useState<AdminChromeContextMenuPayload | null>(null);
  const [sessionUser, setSessionUser] = useState(() => authStorage.getUserInfo());
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [sidebarLogoBroken, setSidebarLogoBroken] = useState(false);

  /** ARO account binding — STAFF and above */
  const [aroBinding, setAroBinding] = useState<null | false | { aroUserId: string; name: string; departmentName: string; createdAt: string }>(null);
  const [aroBindDialogOpen, setAroBindDialogOpen] = useState(false);
  const [aroBindUserId, setAroBindUserId] = useState("");
  // CAS token binding
  const [casStatus, setCasStatus] = useState<CasBindingStatus | null>(null);
  const [casDialogOpen, setCasDialogOpen] = useState(false);
  const [casBinding, setCasBinding] = useState(false);
  const [casPopupReady, setCasPopupReady] = useState(false);
  const [casRenewing, setCasRenewing] = useState(false);
  const casPasteRef = useRef<HTMLTextAreaElement>(null);
  const [aroUnbindDialogOpen, setAroUnbindDialogOpen] = useState(false);

  /** Email / SendKey binding */
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailDraft, setEmailDraft] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [currentEmail, setCurrentEmail] = useState<string | null>(null);
  const [sendKeyDialogOpen, setSendKeyDialogOpen] = useState(false);
  const [sendKeyDraft, setSendKeyDraft] = useState("");
  const [sendKeySaving, setSendKeySaving] = useState(false);
  const [currentSendKey, setCurrentSendKey] = useState<string | null>(null);
  /** WxPusher binding */
  const [wxPusherDialogOpen, setWxPusherDialogOpen] = useState(false);
  const [wxPusherDraft, setWxPusherDraft] = useState("");
  const [wxPusherSaving, setWxPusherSaving] = useState(false);
  const [currentWxPusher, setCurrentWxPusher] = useState<string | null>(null);

  /** Verification-code states for email binding */
  const [emailCode, setEmailCode] = useState("");
  const [emailCodeSending, setEmailCodeSending] = useState(false);
  const [emailCodeCooldown, setEmailCodeCooldown] = useState(0);
  const emailCooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    return () => { if (emailCooldownRef.current) clearInterval(emailCooldownRef.current); };
  }, []);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  /** 分组展开：从 session 恢复（全屏 Twin 子路由卸载本布局后返回时保留文件夹展开位置）。
   *  个性化分组（常用/收藏/消息）始终默认展开，防止 session 遗留的折叠状态导致空分组。 */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const fromSession = readAdminSidebarOpenGroupsSession();
    // 强制个性化分组默认展开
    if (fromSession[RECENT_GROUP_ID] === false) delete fromSession[RECENT_GROUP_ID];
    if (fromSession[STARS_GROUP_ID] === false) delete fromSession[STARS_GROUP_ID];
    if (fromSession[FRIENDS_GROUP_ID] === false) delete fromSession[FRIENDS_GROUP_ID];
    return fromSession;
  });


  /** 全屏 Twin 子路由会卸载本布局；持久化分组展开态以便「返回」后仍定位到原文件夹 */
  useEffect(() => {
    try {
      sessionStorage.setItem(ADMIN_SIDEBAR_OPEN_GROUPS_SESSION_KEY, JSON.stringify(openGroups));
    } catch {
      /* ignore */
    }
  }, [openGroups]);

  const setCollapsedPersist = useCallback((next: boolean) => {
    setSidebarCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadPerm = async () => {
      try {
        const list = await fetchPublicPagePermissions("WEB");
        if (mounted) setPermNodes(list || []);
      } catch {
        if (mounted) setPermNodes([]);
      }
    };
    void loadPerm();
    const onWebPermUpdated = () => void loadPerm();
    window.addEventListener(WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED, onWebPermUpdated);
    return () => {
      mounted = false;
      window.removeEventListener(WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED, onWebPermUpdated);
    };
  }, []);

  /** 进入后台时从库同步 userInfo（含工单同源 displayName），避免仅本地缓存过期 */
  useEffect(() => {
    if (!authStorage.hasToken() || !hasMinRole(role, "STAFF")) return;
    let cancelled = false;
    void refreshAuthSession()
      .then((data) => {
        if (cancelled) return;
        authStorage.setAuth(data.token, data.role, data.userInfo);
      })
      .catch(() => {
        /* 静默：Token 失效等由后续请求处理 */
      });
    return () => {
      cancelled = true;
    };
  }, [role]);

  /** Fetch ARO account binding status for STAFF and above */
  useEffect(() => {
    if (!hasMinRole(role, "STAFF")) return;
    const token = authStorage.getToken();
    if (!token) return;
    fetch("/api/admin/account/binding", {
      headers: { Authorization: "Bearer " + token },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch binding");
        return res.json();
      })
      .then((wrapper) => setAroBinding(wrapper?.data || false))
      .catch(() => setAroBinding(false));
  }, [role]);

  /** Fetch CAS token binding status */
  useEffect(() => {
    if (!hasMinRole(role, "STAFF")) return;
    fetchCasBindingStatus().then(setCasStatus).catch(() => {});
  }, [role]);

  /** Fetch current email and SendKey */
  useEffect(() => {
    if (!hasMinRole(role, "STAFF") || !sessionUser?.id) return;
    const token = authStorage.getToken();
    if (!token) return;
    const headers = { Authorization: "Bearer " + token };
    fetch(`/api/admin/personnel/${encodeURIComponent(sessionUser.id)}/contact-email`, { headers })
      .then((res) => res.json())
      .then((wrapper) => setCurrentEmail(wrapper?.data?.email ?? null))
      .catch(() => setCurrentEmail(null));
    fetch(`/api/admin/personnel/${encodeURIComponent(sessionUser.id)}/send-key`, { headers })
      .then((res) => res.json())
      .then((wrapper) => setCurrentSendKey(wrapper?.data?.sendKey ?? null))
      .catch(() => setCurrentSendKey(null));
    fetch(`/api/admin/personnel/${encodeURIComponent(sessionUser.id)}/wx-pusher-uid`, { headers })
      .then((res) => res.json())
      .then((wrapper) => setCurrentWxPusher(wrapper?.data?.wxPusherUid ?? null))
      .catch(() => setCurrentWxPusher(null));
  }, [role, sessionUser?.id]);

  const pullPendingBadges = useCallback(() => {
    fetchPendingBadges()
      .then((b) => {
        setPendingBadges(b);
      })
      .catch(() => {
        setPendingBadges(null);
      });
  }, []);

  useEffect(() => {
    if (!resolveAdminNavUserId() || !authStorage.hasToken()) return;
    void hydrateAdminNavPersonalization().then(() => setPersonalBump((n) => n + 1));
  }, [sessionUser?.id]);

  useEffect(() => {
    const sync = () => {
      setSessionUser(authStorage.getUserInfo());
      if (authStorage.hasToken() && isAdminAreaPath(pathname)) {
        void pullPendingBadges();
      }
    };
    window.addEventListener(AUTH_USERINFO_UPDATED_EVENT, sync);
    return () => window.removeEventListener(AUTH_USERINFO_UPDATED_EVENT, sync);
  }, [pathname, pullPendingBadges]);

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchPendingBadges()
        .then((b) => {
          if (alive) setPendingBadges(b);
        })
        .catch(() => {
          if (alive) setPendingBadges(null);
        });
    };
    load();
    const timer = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [pathname]);

  useEffect(() => {
    const onRefreshBadges = () => {
      void pullPendingBadges();
    };
    window.addEventListener(ADMIN_PENDING_BADGES_REFRESH_EVENT, onRefreshBadges);
    return () => window.removeEventListener(ADMIN_PENDING_BADGES_REFRESH_EVENT, onRefreshBadges);
  }, [pullPendingBadges]);

  /** 与 MaterialReviewPage 共用 React Query 缓存，避免 /api/me/pending-badges 与待审列表不同步 */
  const studentReviewBadgeQueriesEnabled = hasMinRole(role, "STAFF") && authStorage.hasToken();
  const { data: liveMaterialPending = [] } = useQuery({
    queryKey: materialQueryKeys.pendingRequests(),
    queryFn: fetchPendingMaterialRequests,
    enabled: studentReviewBadgeQueriesEnabled,
    ...studentReviewPendingQueryOptions,
  });
  const { data: liveScanDelayPending = [] } = useQuery({
    queryKey: ["scan-delay", "pending"],
    queryFn: fetchPendingScanDelayRequests,
    enabled: studentReviewBadgeQueriesEnabled,
    ...studentReviewPendingQueryOptions,
  });
  const liveStudentReviewBadgeText = useMemo(
    () => formatStudentReviewBadgeCount(liveMaterialPending.length, liveScanDelayPending.length),
    [liveMaterialPending.length, liveScanDelayPending.length],
  );

  /** 全后台常驻一条通知 SSE：新消息/站内通知到达即刷新角标；此前仅子页订阅时，不点进通知页侧栏不会更新 */
  const inAdminShell = isAdminAreaPath(pathname);
  useEffect(() => {
    if (!inAdminShell || !authStorage.hasToken()) return;
    const token = authStorage.getToken();
    const url = `/api/notifications/stream?token=${encodeURIComponent(token)}`;
    const source = new EventSource(url);
    const onNotification = (ev: Event) => {
      void pullPendingBadges();
      window.dispatchEvent(new Event(ADMIN_NOTIFICATION_SSE_PUSH_EVENT));
      window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
      try {
        const me = ev as MessageEvent;
        const raw = me.data;
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        handleScanDelayNotificationSse(parsed);
      } catch {
        /* ignore malformed SSE payload */
      }
    };
    const onStaffChat = (ev: Event) => {
      void pullPendingBadges();
      window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
      const me = ev as MessageEvent;
      let detail: StaffChatSsePayload = {};
      try {
        detail = JSON.parse(String(me.data ?? "{}")) as StaffChatSsePayload;
      } catch {
        detail = {};
      }
      window.dispatchEvent(new CustomEvent<StaffChatSsePayload>(ADMIN_STAFF_CHAT_PUSH_DETAIL_EVENT, { detail }));
    };
    source.addEventListener("notification", onNotification);
    source.addEventListener(STAFF_CHAT_SSE_EVENT, onStaffChat);
    source.onerror = () => {};
    return () => {
      source.removeEventListener("notification", onNotification);
      source.removeEventListener(STAFF_CHAT_SSE_EVENT, onStaffChat);
      source.close();
    };
  }, [inAdminShell, pullPendingBadges]);

  const navCtx = useMemo(() => createAdminNavContext(role, permNodes), [role, permNodes]);

  /** 与侧栏一级入口一致的路径集合（注册表 ∪ 权限 sidebar ENTRY），供顶栏「返回」判定；视觉规范见 `frontend/docs/ADMIN_UI_STYLE.md` */
  const permSidebarPaths = useMemo(() => collectSidebarEntryPathsFromPerm(permNodes), [permNodes]);
  const showAdminShellBack = useMemo(
    () => normalizeAdminPath(pathname) !== "/admin" || shouldShowAdminShellBack(pathname, permSidebarPaths),
    [pathname, permSidebarPaths]
  );
  const adminHeaderTitle = useMemo(() => adminChromeTitle(pathname), [pathname]);

  const skipAdminHomeEnterAnimation = useMemo(() => {
    if (!isAdminHomeLocation(pathname)) return false;
    const state = location.state as { skipAdminHomeEnterAnimation?: boolean } | null;
    return state?.skipAdminHomeEnterAnimation === true || hasPendingAdminHomeScrollRestore();
  }, [pathname, location.state, location.key]);

  /** 返回工作台：paint 前禁用浏览器 scroll restoration 并同步设 Y，减轻顶栏闪一下 */
  useLayoutEffect(() => {
    if (!isAdminHomeLocation(pathname) || !hasPendingAdminHomeScrollRestore()) return;
    try {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
    } catch {
      /* ignore */
    }
    const savedY = readAdminHomeScrollPosition();
    if (savedY != null) {
      scrollAdminContentTo(savedY, "instant");
    }
  }, [pathname, location.key]);

  const showFriendsSidebarShortcut = useMemo(
    () =>
      hasMinRole(role, "STAFF") &&
      (canShowWebEntry(permNodes, "/admin/staff-messages", "sidebar", role, "STAFF") ||
        canShowWebEntry(permNodes, "/admin/notifications", "sidebar", role, "STAFF")),
    [role, permNodes]
  );

  /** 侧栏「消息」角标：仅读 /api/me/pending-badges 汇总字段（与 SSE → pullPendingBadges 单一路径一致） */
  const friendsNavBadgeText = useMemo(() => {
    const fmtCount = (n?: number) => (n != null && n > 0 ? (n > 99 ? "99+" : String(n)) : "");
    const primary =
      (pendingBadges?.staffMessagesSidebarTotalText ?? "").trim() ||
      fmtCount(pendingBadges?.staffMessagesSidebarTotal);
    if (primary) return primary;
    const chat = (pendingBadges?.chatUnreadText ?? "").trim() || fmtCount(pendingBadges?.chatUnread);
    const notify = (pendingBadges?.notifyText ?? "").trim() || fmtCount(pendingBadges?.notify);
    const merged = [chat, notify].filter(Boolean).join(" ").trim();
    return merged || undefined;
  }, [pendingBadges]);

  /** 与工单 applicantName 同源：后端 UserDisplayNameService.resolveDisplayName → AuthUserInfo.displayName */
  const headerPrimaryLabel = useMemo(() => {
    const dn = (sessionUser?.displayName || "").trim();
    if (dn) return dn;
    const nick = (sessionUser?.displayNickname || "").trim();
    if (nick) return nick;
    const un = (sessionUser?.username || "").trim();
    if (un) return un;
    return "—";
  }, [sessionUser]);

  const headerUsername = (sessionUser?.username || "").trim();
  const avatarLetter = (headerPrimaryLabel !== "—" ? headerPrimaryLabel : sessionUser?.username || "?").slice(0, 1).toUpperCase();

  const [navModel, setNavModel] = useState<Awaited<ReturnType<typeof buildAdminNavModel>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    buildAdminNavModel(navCtx, pendingBadges).then((model) => {
      if (!cancelled) setNavModel(model);
    });
    return () => { cancelled = true; };
  }, [navCtx, pendingBadges]);

  const baseSidebarGroups = navModel?.sidebarGroups ?? [];
  const flatNavigableItems = navModel?.flatNavigableItems ?? [];

  // 确保 nav model 加载完成后强制刷新个性化分组
  // （baseSidebarGroups 首次从 [] 变为有内容时，需保证 recent/stars 重新查找 pathToItem）
  useEffect(() => {
    if (baseSidebarGroups.length > 0) {
      setPersonalBump((n) => n + 1);
    }
    // 仅首次加载时触发
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!navModel]);

  const sidebarGroups = useMemo(() => {
    const groups = prependPersonalNavSidebarGroups(
      baseSidebarGroups,
      readAdminNavRecent(),
      readAdminNavStars(),
      showFriendsSidebarShortcut,
      friendsNavBadgeText,
    );
    const patched = patchStudentReviewNavBadges(groups, liveStudentReviewBadgeText);
    return injectGroupBadges(patched);
  }, [baseSidebarGroups, personalBump, showFriendsSidebarShortcut, friendsNavBadgeText, liveStudentReviewBadgeText]);

  const { starredItems, recentItems, registryItems } = useMemo(() => {
    void personalBump;
    return splitPersonalizedPaletteItems(flatNavigableItems, readAdminNavRecent(), readAdminNavStars());
  }, [flatNavigableItems, personalBump]);

  useEffect(() => {
    const onEvt = () => setPersonalBump((n) => n + 1);
    window.addEventListener(ADMIN_NAV_PERSONALIZATION_EVENT, onEvt);
    return () => window.removeEventListener(ADMIN_NAV_PERSONALIZATION_EVENT, onEvt);
  }, []);

  const adminNavLockPath = useMemo(() => readAdminNavLock(), [personalBump]);

  /** 本次进入 AdminLayout 是否已完成锁定引导（仅首次进后台跳一次，之后允许自由切换） */
  const [lockBootstrapDone, setLockBootstrapDone] = useState(() => !readAdminNavLock());

  useEffect(() => {
    if (!adminNavLockPath) {
      setLockBootstrapDone(true);
      return;
    }
    if (normalizeAdminPath(pathname) === adminNavLockPath) {
      setLockBootstrapDone(true);
    }
  }, [adminNavLockPath, pathname]);

  /** 锁定入口：仅引导阶段 replace 至锁定页（含 nav 未就绪时的乐观跳转） */
  const lockRedirectTarget = useMemo(() => {
    if (lockBootstrapDone) return null;
    if (!adminNavLockPath || !isAdminAreaPath(pathname)) return null;
    if (normalizeAdminPath(pathname) === adminNavLockPath) return null;
    if (!navModel) return toAdminRoutePath(adminNavLockPath);
    if (!collectAdminSidebarVisiblePaths(sidebarGroups).has(adminNavLockPath)) return null;
    return toAdminRoutePath(adminNavLockPath);
  }, [lockBootstrapDone, adminNavLockPath, pathname, navModel, sidebarGroups]);

  const pendingLockRedirect = lockRedirectTarget !== null;

  useEffect(() => {
    if (!navModel || !adminNavLockPath) return;
    if (!collectAdminSidebarVisiblePaths(sidebarGroups).has(adminNavLockPath)) {
      clearAdminNavLock();
      setLockBootstrapDone(true);
    }
  }, [navModel, adminNavLockPath, sidebarGroups]);

  useEffect(() => {
    // 必须等用户 ID 加载完毕，否则 scopedKey 返回不带 UID 的 key，
    // 导致写入与读取的 localStorage key 不一致，常用/最近完全失效。
    if (pendingLockRedirect || !isAdminAreaPath(pathname)) return;
    if (!resolveAdminNavUserId()) return;
    appendAdminNavRecent(pathname);
  }, [pathname, pendingLockRedirect, sessionUser?.id]);

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev };
      for (const g of sidebarGroups) {
        const all = sidebarGroupAllItems(g);
        const hit = all.some((it) => routeMatches(pathname, it.to, it.end));
        if (hit) next[g.id] = true;
        for (const sg of g.subgroups ?? []) {
          const sgKey = adminNavSubgroupOpenKey(g.id, sg.id);
          if (sg.items.some((it) => routeMatches(pathname, it.to, it.end))) {
            next[g.id] = true;
            next[sgKey] = true;
          }
        }
        if (isFriendsSidebarGroupId(g.id) && all.length > 0 && prev[g.id] === undefined) {
          next[g.id] = true;
        }
        if (isPersonalSidebarGroupId(g.id) && all.length > 0 && prev[g.id] === undefined) {
          next[g.id] = true;
        }
      }
      return next;
    });
  }, [pathname, sidebarGroups]);

  useEffect(() => {
    if (!chromeCtx) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setChromeCtx(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chromeCtx]);

  useEffect(() => {
    if (!hasMinRole(role, "STAFF")) return;
    const onCtx = (e: MouseEvent) => {
      if (!(e.target instanceof Element)) return;
      if (e.target.closest("[data-admin-chrome-ctx-surface]")) return;
      e.preventDefault();
      const friendOk =
        hasMinRole(role, "STAFF") && canShowWebEntry(permNodes, "/admin/staff-messages", "sidebar", role, "STAFF");
      let nav = parseAdminNavLinkFromEventTarget(e.target);
      let sensitive = parseSensitiveFromEventTarget(e.target);
      let friend = parseFriendRowFromEventTarget(e.target);
      if (sensitive && !hasMinRole(role, sensitive.configureMinRole)) sensitive = null;
      if (!friendOk) friend = null;
      setChromeCtx({ x: e.clientX, y: e.clientY, nav, sensitive, friend });
    };
    document.addEventListener("contextmenu", onCtx, true);
    return () => document.removeEventListener("contextmenu", onCtx, true);
  }, [role, permNodes]);

  const toggleGroup = useCallback((id: string) => {
    setOpenGroups((p) => ({ ...p, [id]: p[id] !== true }));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const navLinkClass = (isActive: boolean, opts?: { inGroup?: boolean; collapsed?: boolean }) =>
    cn(
      "w-full rounded-lg py-2 text-left text-sm inline-flex items-center gap-2 transition-colors",
      opts?.collapsed ? "justify-center px-2" : cn("px-4", opts?.inGroup && "ml-2 w-[calc(100%-0.5rem)]"),
      isActive
        ? "bg-white/[0.12] font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] ring-1 ring-white/15"
        : "text-neutral-300 hover:bg-white/[0.06] hover:text-white"
    );

  const renderNavItem = (it: AdminSidebarNavItem, inGroup: boolean, collapsed: boolean, onAfterNav?: () => void) => {
    const badge = (it.badgeText || "").trim();
    const itemLocked = !collapsed && isAdminNavLocked(it.to);
    const itemStarred = !collapsed && isAdminNavStarred(it.to);

    const starButton = !collapsed ? (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleAdminNavStar(it.to);
        }}
        title={itemStarred ? "取消收藏" : "收藏此页面"}
        className={cn(
          "shrink-0 rounded p-0.5 transition-all",
          itemStarred
            ? "text-amber-400 opacity-100 hover:text-amber-300"
            : "text-neutral-500 opacity-0 group-hover:opacity-100 hover:text-neutral-200"
        )}
        aria-label={itemStarred ? "取消收藏" : "收藏此页面"}
      >
        <Star className={cn("h-3.5 w-3.5", itemStarred && "fill-amber-400")} />
      </button>
    ) : null;

    const itemShellProps = {
      "data-admin-sidebar-nav-item": true,
      "data-admin-nav-path": it.to,
      "data-admin-nav-label": it.label,
    } as const;

    if (it.telemetry) {
      const TIcon = it.icon;
      const returnKey = it.telemetryReturnStorageKey ?? ANIMAL_ROOM_TELEMETRY_RETURN_TO_KEY;
      const link = (
        <NavLink
          to={it.to}
          data-admin-nav-label={it.label}
          title={collapsed ? it.label : undefined}
          state={{ returnTo: `${pathname}${location.search}` }}
          onClick={() => {
            try {
              sessionStorage.setItem(returnKey, `${pathname}${location.search}`);
            } catch {
              /* ignore */
            }
            if (isAdminHomeLocation(pathname)) {
              markAdminHomeHighlightPending(it.to, { source: "sidebar" });
            }
            onAfterNav?.();
          }}
          className={({ isActive }) => cn(navLinkClass(isActive, { inGroup, collapsed }), "relative", !collapsed && "flex-1 min-w-0")}
        >
          <span className={cn("relative inline-flex shrink-0 rounded-md p-1 ring-1 ring-inset ring-white/10", it.iconWrapClass)}>
            <TIcon className="h-3.5 w-3.5" />
            {collapsed && badge ? (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-neutral-950" />
            ) : null}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 truncate">{it.label}</span>
              <NavPendingBadge text={it.badgeText} />
            </>
          )}
        </NavLink>
      );
      return (
        <div
          key={it.key}
          {...itemShellProps}
          className={cn("group flex w-full min-w-0 items-center gap-0.5", itemLocked && "border-l-2 border-amber-400")}
        >
          {starButton}
          {link}
        </div>
      );
    }

    const justifyBetween = !!badge && !collapsed;
    const Icon = it.icon;

    const link = (
      <NavLink
        to={it.to}
        data-admin-nav-label={it.label}
        end={it.end}
        title={collapsed ? it.label : undefined}
        state={isAdminHomeLocation(pathname) ? { returnTo: `${pathname}${location.search}` } : undefined}
        onClick={() => {
          if (isAdminHomeLocation(pathname)) {
            markAdminHomeHighlightPending(it.to, { source: "sidebar" });
          }
          onAfterNav?.();
        }}
        className={({ isActive }) =>
          cn(navLinkClass(isActive, { inGroup, collapsed }), !collapsed && "flex-1 min-w-0", justifyBetween && "justify-between")
        }
      >
        <span className={cn("inline-flex min-w-0 items-center gap-2", justifyBetween && "flex-1")}>
          <span className={cn("relative inline-flex shrink-0 rounded-md p-1 ring-1 ring-inset ring-white/10", it.iconWrapClass)}>
            <Icon className="h-3.5 w-3.5" />
            {collapsed && badge ? (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-neutral-950" />
            ) : null}
          </span>
          {!collapsed && <span className="truncate">{it.label}</span>}
        </span>
        {!collapsed && <NavPendingBadge text={it.badgeText} />}
      </NavLink>
    );
    return (
      <div
        key={it.key}
        {...itemShellProps}
        className={cn("group flex w-full min-w-0 items-center gap-0.5", itemLocked && "border-l-2 border-amber-400")}
      >
        {starButton}
        {link}
      </div>
    );
  };

  const renderSidebarChrome = (mode: "desktop" | "mobile") => {
    const collapsed = mode === "desktop" && sidebarCollapsed;
    const onAfterNav = mode === "mobile" ? () => setMobileNavOpen(false) : undefined;
    const showDesktopCollapse = mode === "desktop";

    const renderSidebarGroups = () =>
      collapsed ? (
        <div className="space-y-3">
          {sidebarGroups.map((g) => (
            <div key={g.id} className="space-y-1">
              {sidebarGroupAllItems(g).map((it) => renderNavItem(it, false, collapsed, onAfterNav))}
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {sidebarGroups.map((g) => {
            const open = openGroups[g.id] === true;
            const personal = isPersonalSidebarGroupId(g.id);
            const friends = isFriendsSidebarGroupId(g.id);
            return (
              <div
                key={g.id}
                className={cn(
                  "rounded-xl border bg-white/[0.03] shadow-sm shadow-black/20 backdrop-blur-[2px]",
                  personal ? "border-amber-400/25 bg-amber-950/15" : friends ? "border-violet-400/30 bg-violet-950/20" : "border-white/[0.06]"
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(g.id)}
                  className="flex w-full items-center gap-2 rounded-t-xl px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-neutral-300 transition-colors hover:bg-white/[0.04]"
                  aria-expanded={open}
                >
                  {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                  {friends ? (
                    <MessagesSquare className="h-3.5 w-3.5 shrink-0 text-violet-300" aria-hidden />
                  ) : personal ? (
                    g.id === RECENT_GROUP_ID ? (
                      <History className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden />
                    ) : g.id === STARS_GROUP_ID ? (
                      <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400/50 text-amber-200" aria-hidden />
                    ) : null
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{g.title}</span>
                  {g.badgeText && !collapsed ? <NavPendingBadge text={g.badgeText} /> : null}
                </button>
                {open ? (
                  <div className="space-y-1 border-t border-white/[0.06] px-2 pb-2 pt-1">
                    {g.items.map((it) => renderNavItem(it, true, collapsed, onAfterNav))}
                    {(g.subgroups ?? []).map((sg) => {
                      const sgKey = adminNavSubgroupOpenKey(g.id, sg.id);
                      const sgOpen = openGroups[sgKey] === true;
                      return (
                        <div key={sgKey} className="rounded-lg border border-white/[0.05] bg-black/10">
                          <button
                            type="button"
                            onClick={() => toggleGroup(sgKey)}
                            className="flex w-full items-center gap-2 px-2 py-2 text-left text-[11px] font-semibold text-neutral-400 hover:bg-white/[0.04]"
                            aria-expanded={sgOpen}
                          >
                            {sgOpen ? (
                              <ChevronDown className="h-3 w-3 shrink-0" />
                            ) : (
                              <ChevronRight className="h-3 w-3 shrink-0" />
                            )}
                            <span className="min-w-0 flex-1 truncate">{sg.title}</span>
                            {sg.badgeText ? <NavPendingBadge text={sg.badgeText} /> : null}
                          </button>
                          {sgOpen ? (
                            <div className="space-y-0.5 px-1 pb-1.5">
                              {sg.items.map((it) => renderNavItem(it, true, collapsed, onAfterNav))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      );

    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Logo、快捷入口、搜索、收起：固定在「消息」及各文件夹之上 */}
        <div className={cn("shrink-0", collapsed ? "space-y-1" : "space-y-2")}>
          <div
            className={cn(
              "flex items-center gap-2 font-semibold text-neutral-50",
              collapsed ? "mb-1 flex-col justify-center gap-3" : "mb-2 text-lg"
            )}
          >
            {!collapsed ? (
              sidebarLogoBroken ? (
                <span className="min-w-0 truncate text-base tracking-tight">管理后台</span>
              ) : (
                <img
                  src={SHSMU_LOGO_URL}
                  alt="上海医学院"
                  className="h-12 w-auto max-w-[min(100%,15rem)] object-contain object-left brightness-0 invert"
                  onError={() => setSidebarLogoBroken(true)}
                />
              )
            ) : (
              <span title="上海医学院" className="inline-flex max-w-full justify-center">
                {sidebarLogoBroken ? (
                  <span className="text-[10px] font-semibold leading-tight text-neutral-200">后台</span>
                ) : (
                  <img
                    src={SHSMU_LOGO_URL}
                    alt=""
                    className="h-11 w-11 object-contain brightness-0 invert"
                    onError={() => setSidebarLogoBroken(true)}
                  />
                )}
              </span>
            )}
          </div>

          <nav data-admin-sidebar-nav-top className={cn("space-y-2", collapsed && "space-y-1")}>
          <div className="flex w-full min-w-0 flex-row gap-1.5">
            <NavLink
              to="/login"
              title={collapsed ? "登录页" : undefined}
              onClick={() => onAfterNav?.()}
              className={({ isActive }) =>
                cn(
                  navLinkClass(isActive, { collapsed }),
                  "!w-auto min-w-0 flex-1 basis-0 justify-center",
                  !collapsed && "!px-2 text-center",
                  !isActive && "text-neutral-300 hover:bg-white/[0.06] hover:text-white"
                )
              }
            >
              <LogIn className="h-4 w-4 shrink-0" />
              {!collapsed && "登录页"}
            </NavLink>
            <NavLink
              to="/"
              end
              title={collapsed ? "首页" : undefined}
              onClick={() => onAfterNav?.()}
              className={({ isActive }) =>
                cn(
                  navLinkClass(isActive, { collapsed }),
                  "!w-auto min-w-0 flex-1 basis-0 justify-center",
                  !collapsed && "!px-2 text-center",
                  !isActive && "text-neutral-300 hover:bg-white/[0.06] hover:text-white"
                )
              }
            >
              <Home className="h-4 w-4 shrink-0" />
              {!collapsed && "首页"}
            </NavLink>
          </div>
          <NavLink
            to={toAdminRoutePath("/admin")}
            end
            title={collapsed ? "后台工作台" : undefined}
            onClick={() => onAfterNav?.()}
            className={({ isActive }) => navLinkClass(isActive, { collapsed })}
          >
            <Home className="h-4 w-4 shrink-0" />
            {!collapsed && "后台工作台"}
          </NavLink>

          <button
            type="button"
            onClick={() => {
              setMobileNavOpen(false);
              setCommandOpen(true);
            }}
            title="搜索跳转 Ctrl+K"
            className={cn(
              "flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] py-2 text-left text-xs text-neutral-400 transition-colors hover:border-white/15 hover:bg-white/[0.08] hover:text-neutral-200",
              collapsed ? "justify-center px-2" : "px-4"
            )}
          >
            <Search className="h-4 w-4 shrink-0 opacity-70" />
            {!collapsed && (
              <>
                <span className="flex-1 truncate">搜索页面…</span>
                <kbd className="hidden shrink-0 rounded border border-white/20 bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 sm:inline">
                  Ctrl K
                </kbd>
              </>
            )}
          </button>

          {showDesktopCollapse ? (
            <button
              type="button"
              onClick={() => setCollapsedPersist(!sidebarCollapsed)}
              title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
              className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-left text-xs text-neutral-400 transition-colors hover:border-white/15 hover:bg-white/[0.08] hover:text-neutral-200"
            >
              {sidebarCollapsed ? (
                <ChevronsRight className="mx-auto h-4 w-4 shrink-0" />
              ) : (
                <>
                  <ChevronsLeft className="h-4 w-4 shrink-0" />
                  <span>收起侧栏</span>
                </>
              )}
            </button>
          ) : null}

          </nav>
        </div>

        {/* 「消息」起各文件夹：独立滚动区 */}
        <div
          data-admin-sidebar-scroll
          className={cn(
            "admin-sidebar-scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-y-contain border-t border-white/[0.08]",
            collapsed ? "pt-2" : "pt-3"
          )}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <nav data-admin-sidebar-nav-groups className={cn(collapsed && "space-y-1")}>
            {renderSidebarGroups()}
            <div className="min-h-[50vh] shrink-0 pointer-events-none" aria-hidden />
          </nav>
        </div>
      </div>
    );
  };

  // ── CAS binding context for child pages ──
  const casContextValue = useMemo(
    () => ({ casStatus, openCasDialog: () => setCasDialogOpen(true) }),
    [casStatus],
  );

  // ── CAS token bind handlers ──
  const handleCasFetch = () => {
    setCasPopupReady(false);
    window.open("https://aro.shsmu.edu.cn/jtu/api/loginAuth?loginAuthType=CAS", "aro-cas-fetch", "width=500,height=400");
    setTimeout(() => setCasPopupReady(true), 1500);
  };
  const handleCasPaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData?.getData("text") || "";
    let token = "";
    try { const json = JSON.parse(text); token = json?.data?.token || json?.token || ""; } catch { if (text.startsWith("eyJ")) token = text.trim(); }
    if (token) { e.preventDefault(); doCasBind(token); }
  };
  const doCasBind = async (aroToken: string) => {
    setCasBinding(true);
    try { await bindCasAccount(aroToken); toast.success("ARO认证绑定成功"); setCasPopupReady(false); setCasDialogOpen(false); fetchCasBindingStatus().then(setCasStatus); }
    catch (e: any) { toast.error(e?.message || "绑定失败"); }
    finally { setCasBinding(false); }
  };
  const handleCasRenew = async () => {
    setCasRenewing(true);
    try {
      const res = await fetch("/api/admin/account/binding/cas-renew", { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + authStorage.getToken() }, body: "{}" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.message || "续期失败");
      toast.success("Token已续期"); fetchCasBindingStatus().then(setCasStatus);
    } catch (e: any) { toast.error(e?.message || "续期失败"); }
    finally { setCasRenewing(false); }
  };
  const handleCasUnbind = async () => {
    if (!confirm("确定解绑ARO个人认证吗？")) return;
    try { await unbindCasAccount(); toast.success("已解绑"); setCasStatus(null); }
    catch (e: any) { toast.error(e?.message || "解绑失败"); }
  };
  const casRemaining = casStatus?.remainingSeconds;
  const casExpiring = casRemaining != null && casRemaining < 3 * 86400;

  const handleSendBindCode = async () => {
    if (!emailDraft.trim()) { toast.error("请输入邮箱地址"); return; }
    setEmailCodeSending(true);
    try {
      const result = await sendVerificationCode(emailDraft.trim(), "BIND_EMAIL");
      toast.success(result.message || "验证码已发送");
      setEmailCodeCooldown(result.cooldownSeconds || 60);
      if (emailCooldownRef.current) clearInterval(emailCooldownRef.current);
      emailCooldownRef.current = setInterval(() => {
        setEmailCodeCooldown((prev) => {
          if (prev <= 1) {
            if (emailCooldownRef.current) { clearInterval(emailCooldownRef.current); emailCooldownRef.current = null; }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      toast.error(err?.message || "发送失败");
    } finally {
      setEmailCodeSending(false);
    }
  };

  return (
    <div
      className={cn(
        "flex min-h-screen min-w-0 items-start text-[var(--twin-ink)]",
        theme.className,
        isDark && "dark admin-layout-root--night-sky",
        !isDark && "bg-[var(--twin-canvas-soft)]"
      )}
      style={isDark ? { backgroundColor: "var(--app-color-scan-backdrop-from)" } : undefined}
    >
      <AdminCommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        items={registryItems}
        starredItems={starredItems}
        recentItems={recentItems}
        pathname={pathname}
        search={location.search}
      />

      <aside
        className={cn(
          "sticky top-0 z-30 hidden h-[100dvh] max-h-[100dvh] shrink-0 self-start overflow-hidden border-r border-white/[0.06] bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-100 transition-[width,padding] duration-200 ease-out md:flex md:flex-col",
          "pb-[env(safe-area-inset-bottom,0px)]",
          sidebarCollapsed ? "w-14 px-2 py-4" : "w-72 p-5"
        )}
        aria-label="后台主导航"
      >
        {renderSidebarChrome("desktop")}
      </aside>

      <Dialog open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <DialogContent
          id="admin-mobile-nav-sheet"
          variant="leftSheet"
          className="border-neutral-800 bg-gradient-to-b from-neutral-950 to-neutral-900 text-neutral-100"
        >
          <DialogTitle className="sr-only">后台导航菜单</DialogTitle>
          <DialogDescription className="sr-only">与宽屏侧栏相同的分组与链接，小屏下以抽屉展示。</DialogDescription>
          <div className="flex max-h-[100dvh] min-h-0 flex-col overflow-hidden px-5 pt-5 pb-[env(safe-area-inset-bottom,0px)]">
            {renderSidebarChrome("mobile")}
          </div>
        </DialogContent>
      </Dialog>

{/* ⚠️ self-stretch + minHeight:100dvh 是必须的：父容器 items-start 导致子元素不拉伸，
    不加这两个属性会导致所有子页面的 h-full 失效（高度塌为 0）。
    见 docs/UI设计规范与主题标准.md § 高度链完整性 */}
      <section className="relative flex min-w-0 flex-1 flex-col self-stretch" style={{ minHeight: "100dvh" }}>
        {isDark ? (
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
            <NightSkyBackdropDecor ultraRich includeOrbs={false} />
          </div>
        ) : null}
        <header
          className={cn(
            "sticky top-0 z-20 flex min-h-16 shrink-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-[var(--twin-hairline)] px-4 py-2 shadow-twin-level-2 sm:px-6 md:h-16 md:flex-nowrap md:py-0",
            isDark ? "bg-[var(--twin-canvas)]" : "bg-[var(--twin-canvas)]/95 backdrop-blur-md"
          )}
        >
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 md:flex-1 md:flex-nowrap">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] md:hidden"
              aria-label="打开导航菜单"
              aria-expanded={mobileNavOpen}
              aria-controls="admin-mobile-nav-sheet"
            >
              <Menu className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setCollapsedPersist(!sidebarCollapsed)}
              className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] md:inline-flex"
              title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
              aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
            >
              {sidebarCollapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            </button>
            {showAdminShellBack ? (
              <button
                type="button"
                title="返回上一页"
                aria-label="返回上一页"
                onClick={() => {
                  const stateReturn = (location.state as { returnTo?: unknown } | null)?.returnTo;
                  if (typeof stateReturn === "string" && stateReturn.startsWith("/") && !stateReturn.startsWith("//")) {
                    navigateAdminReturnTo(navigate, stateReturn);
                    return;
                  }
                  if (window.history.length > 1) navigate(-1);
                  else navigateAdminReturnTo(navigate, resolveAdminShellBackTo(pathname, location.state));
                }}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-ink)] hover:bg-[var(--twin-canvas-soft)]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="flex min-w-0 max-w-full flex-1 items-center gap-2 rounded-lg border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-2 text-left text-sm text-[var(--twin-mute)] hover:bg-[var(--twin-canvas-soft-2)] sm:max-w-md"
            >
              <Search className="h-4 w-4 shrink-0 opacity-60" />
              <span className="min-w-0 flex-1 truncate">搜索后台页面…</span>
              <kbd className="hidden shrink-0 rounded border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--twin-mute)] sm:inline">Ctrl K</kbd>
            </button>
            <div className="flex w-full min-w-0 items-center gap-1 sm:w-auto sm:max-w-none">
              <h1 className="min-w-0 truncate text-base font-semibold tracking-tight text-[var(--twin-ink)] sm:max-w-[12rem] md:max-w-none">
                {adminHeaderTitle}
              </h1>
              <ThemeSwitcher className="h-8 shrink-0 rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] px-2.5 text-[11px] font-medium text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]" />
              <PageHelpHost pagePath={pathname} variant="admin" suppressAutoIntro={pendingLockRedirect} />
              {hasMinRole(role, "SUPER_ADMIN") ? (
                <button
                  type="button"
                  onClick={() => navigate(toAdminRoutePath("/admin/nav-manager"))}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                  title="管理侧边栏文件夹"
                  aria-label="管理侧边栏文件夹"
                >
                  <Settings className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
          <div className="flex w-full shrink-0 flex-wrap items-center justify-end gap-2 sm:w-auto sm:flex-nowrap sm:gap-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  data-admin-chrome-ctx-surface
                  className="flex max-w-full min-w-0 items-center gap-2 rounded-lg py-1.5 pl-0.5 pr-1 text-left hover:bg-[var(--twin-canvas-soft)] sm:pr-2"
                >
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--twin-primary)] text-sm font-semibold text-[var(--twin-on-primary)]"
                    aria-hidden
                  >
                    {avatarLetter}
                  </span>
                  <span className="hidden min-w-0 flex-col text-left sm:flex">
                    <span className="inline-flex items-center gap-1.5 truncate text-sm font-medium text-[var(--twin-ink)]">
                      {headerPrimaryLabel}
                      {hasMinRole(role, "STAFF") && (
                        <span
                          className={cn(
                            "inline-block h-2 w-2 rounded-full shrink-0",
                            casStatus?.bound ? "bg-emerald-400" : "bg-neutral-300",
                          )}
                          title={casStatus?.bound ? `ARO已绑定: ${casStatus.casAccount}` : "ARO未绑定"}
                        />
                      )}
                    </span>
                    {headerUsername ? (
                      <span className="truncate text-[11px] text-[var(--twin-mute)]">@{headerUsername}</span>
                    ) : null}
                  </span>
                  <ChevronDown className="hidden h-4 w-4 shrink-0 text-[var(--twin-mute)] sm:block" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56" data-admin-chrome-ctx-surface>
                <div className="px-2 py-1.5 sm:hidden">
                  <div className="inline-flex items-center gap-1.5 truncate text-sm font-medium text-[var(--twin-ink)]">
                    {headerPrimaryLabel}
                    {hasMinRole(role, "STAFF") && (
                      <span className={cn("inline-block h-2 w-2 rounded-full shrink-0", casStatus?.bound ? "bg-emerald-400" : "bg-neutral-300")} />
                    )}
                  </div>
                  {headerUsername ? <div className="truncate text-[11px] text-[var(--twin-mute)]">@{headerUsername}</div> : null}
                </div>
                <div className="px-2 py-1 text-[10px] text-[var(--twin-mute)] sm:block">当前角色 · {role}</div>
                <DropdownMenuSeparator />
                {hasMinRole(role, "STAFF") && aroBinding === false && (
                  <DropdownMenuItem onSelect={() => setAroBindDialogOpen(true)}>
                    <UserRound className="mr-2 h-4 w-4" />
                    绑定ARO账号
                  </DropdownMenuItem>
                )}
                {hasMinRole(role, "STAFF") && aroBinding && (
                  <>
                    <DropdownMenuItem disabled className="text-[var(--twin-mute)] opacity-70">
                      <UserRound className="mr-2 h-4 w-4" />
                      ARO绑定: {aroBinding.name} ({aroBinding.aroUserId})
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={async () => {
                        const currentToken = authStorage.getToken();
                        const currentRole = authStorage.getRole();
                        const currentUserInfo = authStorage.getUserInfo();
                        try {
                          localStorage.setItem("admin_original_auth", JSON.stringify({
                            token: currentToken,
                            role: currentRole,
                            userInfo: currentUserInfo,
                          }));
                        } catch {
                          /* ignore */
                        }
                        try {
                          const res = await fetch("/api/auth/impersonate", {
                            method: "POST",
                            headers: { Authorization: "Bearer " + currentToken },
                          });
                          if (!res.ok) throw new Error("Impersonation failed");
                          const wrapper = await res.json() as { code: number; data: { token: string; aroUserId: string } };
                          const { token, aroUserId } = wrapper.data;
                          // 保存 ARO 姓名用于学生端头像显示
                          const aroName = aroBinding?.name || aroUserId;
                          authStorage.setAuth(token, "MEMBER", { displayName: aroName, username: aroUserId } as any);
                          toast.success("已切换至学生视图");
                          navigate("/student/home");
                        } catch {
                          toast.error("切换学生视图失败");
                        }
                      }}
                    >
                      <UserRound className="mr-2 h-4 w-4" />
                      切换学生视图
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => setAroUnbindDialogOpen(true)}>
                      <UserRound className="mr-2 h-4 w-4" />
                      解除ARO绑定
                    </DropdownMenuItem>
                  </>
                )}
                {hasMinRole(role, "STAFF") && (
                  <>
                    <DropdownMenuSeparator />
                    {casStatus?.bound ? (
                      <>
                        <DropdownMenuItem disabled className="text-[var(--twin-mute)] opacity-70">
                          <CheckCircle2 className="mr-2 h-4 w-4 text-green-500" />
                          ARO认证: {casStatus.casAccount}
                          {casRemaining != null && casRemaining > 0 && (
                            <span className={cn("ml-1 text-[10px]", casExpiring && "text-amber-500")}>
                              ({Math.floor(casRemaining / 86400)}天)
                            </span>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={handleCasRenew}>
                          <Clock className="mr-2 h-4 w-4" />
                          {casRenewing ? "续期中..." : "续期Token"}
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={handleCasUnbind}>
                          <Unlink className="mr-2 h-4 w-4" />
                          解绑认证
                        </DropdownMenuItem>
                      </>
                    ) : (
                      <DropdownMenuItem onSelect={() => setCasDialogOpen(true)}>
                        <KeyRound className="mr-2 h-4 w-4" />
                        绑定ARO认证
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                {hasMinRole(role, "STAFF") ? (
                  <>
                    <DropdownMenuSeparator />
                    {currentEmail ? (
                      <DropdownMenuItem onSelect={() => {
                        if (window.confirm(`已绑定邮箱 ${currentEmail}，是否取消绑定？`)) {
                          const token = authStorage.getToken();
                          const userId = sessionUser?.id;
                          if (!userId) return;
                          fetch(`/api/admin/personnel/${encodeURIComponent(userId)}/contact-email`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
                            body: JSON.stringify({ email: "" }),
                          }).then((r) => {
                            if (r.ok) { setCurrentEmail(null); toast.success("已取消邮箱绑定"); }
                            else toast.error("取消失败");
                          }).catch(() => toast.error("取消失败"));
                        }
                      }}>
                        <Mail className="mr-2 h-4 w-4 text-emerald-500" />
                        邮箱: 已绑定
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onSelect={() => {
                        setEmailDraft("");
                        setEmailCode(""); setEmailCodeCooldown(0);
                        if (emailCooldownRef.current) { clearInterval(emailCooldownRef.current); emailCooldownRef.current = null; }
                        setEmailDialogOpen(true);
                      }}>
                        <Mail className="mr-2 h-4 w-4" />
                        绑定邮箱
                      </DropdownMenuItem>
                    )}
                    {currentSendKey ? (
                      <DropdownMenuItem onSelect={() => {
                        if (window.confirm("已绑定微信通知，是否取消绑定？")) {
                          const token = authStorage.getToken();
                          const userId = sessionUser?.id;
                          if (!userId) return;
                          fetch(`/api/admin/personnel/${encodeURIComponent(userId)}/send-key`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
                            body: JSON.stringify({ sendKey: "" }),
                          }).then((r) => {
                            if (r.ok) { setCurrentSendKey(null); toast.success("已取消微信通知绑定"); }
                            else toast.error("取消失败");
                          }).catch(() => toast.error("取消失败"));
                        }
                      }}>
                        <MessageCircle className="mr-2 h-4 w-4 text-emerald-500" />
                        微信通知: 已绑定
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onSelect={() => {
                        setSendKeyDraft("");
                        setSendKeyDialogOpen(true);
                      }}>
                        <MessageCircle className="mr-2 h-4 w-4" />
                        绑定微信通知
                      </DropdownMenuItem>
                    )}

                    {currentWxPusher ? (
                      <DropdownMenuItem onSelect={() => {
                        if (window.confirm("已绑定 WxPusher 推送，是否取消绑定？")) {
                          const token = authStorage.getToken();
                          const userId = sessionUser?.id;
                          if (!userId) return;
                          fetch(`/api/admin/personnel/${encodeURIComponent(userId)}/wx-pusher-uid`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
                            body: JSON.stringify({ wxPusherUid: "" }),
                          }).then((r) => {
                            if (r.ok) { setCurrentWxPusher(null); toast.success("已取消 WxPusher 推送绑定"); }
                            else toast.error("取消失败");
                          }).catch(() => toast.error("取消失败"));
                        }
                      }}>
                        <Smartphone className="mr-2 h-4 w-4 text-emerald-500" />
                        WxPusher推送: 已绑定
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onSelect={() => {
                        setWxPusherDraft("");
                        setWxPusherDialogOpen(true);
                      }}>
                        <Smartphone className="mr-2 h-4 w-4" />
                        绑定WxPusher推送
                      </DropdownMenuItem>
                    )}
                  </>
                ) : null}
                {hasMinRole(role, "STAFF") ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      setMobileNavOpen(false);
                      navigate(toAdminRoutePath("/admin/profile-security"), {
                        state: { returnTo: `${pathname}${location.search}` },
                      });
                    }}
                  >
                    <UserRound className="mr-2 h-4 w-4" />
                    个人中心
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  className="text-red-700 focus:bg-red-50 focus:text-red-800"
                  onSelect={() => {
                    setLogoutDialogOpen(true);
                  }}
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  退出登录
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main
          data-admin-main-scroll
          className={cn(
            "relative z-[1] flex min-h-0 w-full min-w-0 flex-1 flex-col overflow-x-hidden",
            isDark ? "bg-transparent" : "bg-[var(--twin-canvas-soft)]"
          )}
        >
          {lockRedirectTarget ? <Navigate to={lockRedirectTarget} replace /> : null}
          <BackfillAutoGlobalBanner />
          <div className="admin-page-content flex min-h-0 w-full flex-1 flex-col">
            {!pendingLockRedirect ? (
              <PageTransition
                animateKey={location.pathname}
                variant={skipAdminHomeEnterAnimation ? "none" : "fadeUp"}
                duration={0.3}
                className="flex h-full min-h-0 flex-col"
              >
              <CasBindingContext.Provider value={casContextValue}>
                <Outlet />
              </CasBindingContext.Provider>
              </PageTransition>
            ) : null}
          </div>
        </main>
      </section>

      <AdminChromeContextMenu
        open={!!chromeCtx}
        payload={chromeCtx}
        permNodes={permNodes}
        role={role}
        onClose={() => setChromeCtx(null)}
        onOpenEntryInSettings={(p) => {
          setMobileNavOpen(false);
          navigate(`${toAdminRoutePath("/admin/page-permissions")}?${new URLSearchParams({ focusPath: p }).toString()}`);
        }}
        onOpenSensitiveInSettings={() => {
          setMobileNavOpen(false);
          navigate(toAdminRoutePath("/admin/page-permissions"));
        }}
        onSavedEntryPerm={() => {
          notifyWebPublicPagePermissionsUpdated();
        }}
        onOpenCommandPalette={() => setCommandOpen(true)}
      />

      <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <DialogContent className="z-[var(--z-modal)] border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-[var(--app-color-text-primary)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>退出登录</DialogTitle>
            <DialogDescription>确定要退出当前账号吗？</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              className="rounded-[var(--app-radius-element)] bg-[var(--app-color-surface-hover)] px-4 py-2 text-sm font-medium text-[var(--app-color-text-primary)] transition-colors hover:bg-[var(--app-color-surface-active)]"
              onClick={() => setLogoutDialogOpen(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded-[var(--app-radius-element)] bg-[var(--app-color-feedback-danger)] px-4 py-2 text-sm font-medium text-[var(--app-color-text-inverse)] transition-colors hover:bg-[var(--app-color-feedback-danger)]/85"
              onClick={() => {
                authStorage.clear();
                setLogoutDialogOpen(false);
                // Redirect browser: CAS clears CASTGC → redirects back to login
                window.location.href = 'https://auth2.shsmu.edu.cn/cas/logout?service='
                    + encodeURIComponent(window.location.origin + '/#/login');
              }}
            >
              退出登录
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ARO 绑定弹窗 */}
      <Dialog open={aroBindDialogOpen} onOpenChange={setAroBindDialogOpen}>
        <DialogContent className="z-[var(--z-modal)] border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-[var(--app-color-text-primary)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>绑定ARO账号</DialogTitle>
            <DialogDescription>输入要绑定的ARO用户ID</DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                title="扫描二维码识别ARO ID"
                className="shrink-0 flex h-10 w-10 items-center justify-center rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)] transition-colors"
                onClick={() => {
                  const inp = document.createElement("input");
                  inp.type = "file";
                  inp.accept = "image/*";
                  inp.onchange = async () => {
                    const file = inp.files?.[0];
                    if (!file) return;
                    toast.loading("识别二维码中…", { id: "qr-decode" });
                    const qrText = await decodeQrFromFile(file);
                    toast.dismiss("qr-decode");
                    if (qrText) {
                      setAroBindUserId(qrText);
                      toast.success("已识别");
                    } else {
                      toast.error("未识别到二维码，请重试");
                    }
                  };
                  inp.click();
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
              </button>
              <input
                className={`${adminInputClass} flex-1`}
                placeholder="ARO用户ID"
                value={aroBindUserId}
                onChange={(e) => setAroBindUserId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && aroBindUserId.trim()) {
                    e.preventDefault();
                    const btn = document.getElementById("aro-bind-submit-btn") as HTMLButtonElement | null;
                    btn?.click();
                  }
                }}
              />
            </div>
            <p className="text-[10px] text-[var(--twin-mute)]">可手动输入或点击左侧扫码图标上传二维码图片自动识别</p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="default"
              onClick={() => {
                setAroBindDialogOpen(false);
                setAroBindUserId("");
              }}
            >
              取消
            </Button>
            <Button
              id="aro-bind-submit-btn"
              size="default"
              disabled={!aroBindUserId.trim()}
              onClick={async () => {
                const token = authStorage.getToken();
                try {
                  const res = await fetch("/api/admin/account/bind-aro", {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: "Bearer " + token,
                    },
                    body: JSON.stringify({ aroUserId: aroBindUserId.trim() }),
                  });
                  if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error((errData as any).message || "绑定失败");
                  }
                  toast.success("绑定成功");
                  setAroBindDialogOpen(false);
                  setAroBindUserId("");
                  // Refresh binding status
                  try {
                    const bindRes = await fetch("/api/admin/account/binding", {
                      headers: { Authorization: "Bearer " + token },
                    });
                    if (bindRes.ok) {
                      const wrapper = await bindRes.json();
                      setAroBinding(wrapper?.data || false);
                    }
                  } catch {
                    /* ignore */
                  }
                } catch (e: any) {
                  toast.error(e?.message || "绑定失败，请检查ARO用户ID是否正确");
                }
              }}
            >
              确认绑定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ARO 解绑确认弹窗 */}
      <Dialog open={aroUnbindDialogOpen} onOpenChange={setAroUnbindDialogOpen}>
        <DialogContent className="z-[var(--z-modal)] border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-[var(--app-color-text-primary)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>解除ARO绑定</DialogTitle>
            <DialogDescription>
              确定要解除当前账号的ARO绑定吗？
              {aroBinding && (
                <span className="mt-1 block">当前绑定: {aroBinding.name} ({aroBinding.aroUserId})</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="default"
              onClick={() => setAroUnbindDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              size="default"
              onClick={async () => {
                const token = authStorage.getToken();
                try {
                  const res = await fetch("/api/admin/account/bind-aro", {
                    method: "DELETE",
                    headers: { Authorization: "Bearer " + token },
                  });
                  if (!res.ok) throw new Error("解除绑定失败");
                  toast.success("已解除ARO绑定");
                  setAroUnbindDialogOpen(false);
                  setAroBinding(false);
                } catch {
                  toast.error("解除绑定失败");
                }
              }}
            >
              解除绑定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CAS Token 绑定弹窗 */}
      <Dialog open={casDialogOpen} onOpenChange={setCasDialogOpen}>
        <DialogContent className="z-[var(--z-modal)] border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-[var(--app-color-text-primary)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>绑定 ARO 个人认证</DialogTitle>
            <DialogDescription>
              获取你的 ARO Token 以使用需要个人权限的功能。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <AdminButton type="button" tone="secondary" size="default" className="w-full" onClick={() => {
              const w = window.open("https://auth2.shsmu.edu.cn/cas/logout", "aro-cas-logout", "width=1,height=1");
              setTimeout(() => {
                if (w) w.close();
                window.open("https://auth2.shsmu.edu.cn/cas/login?service=https://aro.shsmu.edu.cn", "aro-cas", "width=800,height=600");
              }, 800);
            }}>
              统一认证登录
            </AdminButton>
            <AdminButton type="button" tone="primary" size="default" className="w-full" onClick={handleCasFetch}>
              <KeyRound className="mr-2 h-4 w-4" />一键获取 Token
            </AdminButton>
            {casPopupReady && (
              <div className="space-y-2">
                <div className="rounded bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-700 leading-relaxed">
                  在弹窗中 <strong>Ctrl+A</strong> 全选 → <strong>Ctrl+C</strong> 复制 →
                  回到此处 <strong>Ctrl+V</strong> 粘贴
                </div>
                <textarea
                  ref={casPasteRef}
                  onPaste={handleCasPaste}
                  placeholder="在此 Ctrl+V 粘贴..."
                  className="w-full h-16 rounded border px-3 py-2 text-xs font-mono resize-none"
                  autoFocus
                />
                {casBinding && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> 绑定中...
                  </div>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 邮箱绑定弹窗 */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="z-[var(--z-modal)] border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-[var(--app-color-text-primary)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>绑定邮箱</DialogTitle>
            <DialogDescription>
              设置用于接收通知的联系邮箱地址。
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <input
              className={`${adminInputClass} w-full`}
              type="email"
              placeholder="请输入邮箱地址"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && emailDraft.trim()) {
                  e.preventDefault();
                  const btn = document.getElementById("email-bind-submit-btn") as HTMLButtonElement | null;
                  btn?.click();
                }
              }}
            />
            <div className="flex items-center gap-2">
              <input
                className={`${adminInputClass} flex-1`}
                type="text" inputMode="numeric" maxLength={6}
                placeholder="6位验证码"
                value={emailCode}
                onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
              <Button variant="outline" size="default"
                disabled={!emailDraft.trim() || emailCodeSending || emailCodeCooldown > 0}
                onClick={() => void handleSendBindCode()}
                className="whitespace-nowrap"
              >
                {emailCodeSending ? "发送中..." : emailCodeCooldown > 0 ? `${emailCodeCooldown}s` : "发送验证码"}
              </Button>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="default"
              onClick={() => setEmailDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              id="email-bind-submit-btn"
              size="default"
              disabled={!emailDraft.trim() || emailCode.trim().length !== 6 || emailSaving}
              onClick={async () => {
                setEmailSaving(true);
                try {
                  await bindEmailWithCode(emailDraft.trim(), emailCode.trim());
                  toast.success("邮箱绑定成功");
                  setCurrentEmail(emailDraft.trim());
                  setEmailDialogOpen(false);
                  setEmailCode(""); setEmailCodeCooldown(0);
                  if (emailCooldownRef.current) { clearInterval(emailCooldownRef.current); emailCooldownRef.current = null; }
                } catch (e: any) {
                  toast.error(e?.message || "保存失败");
                } finally {
                  setEmailSaving(false);
                }
              }}
            >
              {emailSaving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 微信通知绑定弹窗 */}
      <Dialog open={sendKeyDialogOpen} onOpenChange={setSendKeyDialogOpen}>
        <DialogContent className="z-[var(--z-modal)] border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-[var(--app-color-text-primary)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>绑定微信通知</DialogTitle>
            <DialogDescription>
              设置 SendKey 以启用微信消息通知推送。
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <a
              href={`https://sct.ftqq.com/appkey/create/forward?name=ARO&url=${encodeURIComponent(`${window.location.origin}/#/console/admin/personnel?sendkey={key}&bindUserId=${encodeURIComponent(sessionUser?.id || "")}`)}`}
              className="inline-flex items-center gap-1 text-[11px] text-[var(--twin-link)] underline underline-offset-2 hover:text-[var(--twin-link-deep)]"
            >
              还没有 SendKey？点此前往 Server酱 创建 →
            </a>
            <input
              className={`${adminInputClass} w-full`}
              type="text"
              placeholder="请输入 SendKey"
              value={sendKeyDraft}
              onChange={(e) => setSendKeyDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && sendKeyDraft.trim()) {
                  e.preventDefault();
                  const btn = document.getElementById("sendkey-bind-submit-btn") as HTMLButtonElement | null;
                  btn?.click();
                }
              }}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="default"
              onClick={() => setSendKeyDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              id="sendkey-bind-submit-btn"
              size="default"
              disabled={!sendKeyDraft.trim() || sendKeySaving}
              onClick={async () => {
                const token = authStorage.getToken();
                const userId = sessionUser?.id;
                if (!userId) return;
                setSendKeySaving(true);
                try {
                  const res = await fetch(`/api/admin/personnel/${encodeURIComponent(userId)}/send-key`, {
                    method: "PUT",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: "Bearer " + token,
                    },
                    body: JSON.stringify({ sendKey: sendKeyDraft.trim() }),
                  });
                  if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error((errData as any).message || "保存失败");
                  }
                  toast.success("SendKey 绑定成功");
                  setCurrentSendKey(sendKeyDraft.trim());
                  setSendKeyDialogOpen(false);
                } catch (e: any) {
                  toast.error(e?.message || "保存失败");
                } finally {
                  setSendKeySaving(false);
                }
              }}
            >
              {sendKeySaving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WxPusher 绑定弹窗 */}
      <Dialog open={wxPusherDialogOpen} onOpenChange={setWxPusherDialogOpen}>
        <DialogContent className="z-[var(--z-modal)] border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] text-[var(--app-color-text-primary)] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>绑定 WxPusher 推送</DialogTitle>
            <DialogDescription>
              关注公众号「WxPusher」→ 菜单「我的UID」→ 复制后填入下方。
            </DialogDescription>
          </DialogHeader>
          <div className="py-2 space-y-2">
            <p className="text-[11px] text-[var(--twin-link)]">
              关注公众号 <b>WxPusher</b>（新消息服务）→ 我的 → 我的UID
            </p>
            <input
              className={`${adminInputClass} w-full`}
              type="text"
              placeholder="粘贴 WxPusher UID（如 UID_xxxx）"
              value={wxPusherDraft}
              onChange={(e) => setWxPusherDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && wxPusherDraft.trim()) {
                  e.preventDefault();
                  const btn = document.getElementById("wxpusher-bind-submit-btn") as HTMLButtonElement | null;
                  btn?.click();
                }
              }}
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="default"
              onClick={() => setWxPusherDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              id="wxpusher-bind-submit-btn"
              size="default"
              disabled={!wxPusherDraft.trim() || wxPusherSaving}
              onClick={async () => {
                const token = authStorage.getToken();
                const userId = sessionUser?.id;
                if (!userId) return;
                setWxPusherSaving(true);
                try {
                  const res = await fetch(`/api/admin/personnel/${encodeURIComponent(userId)}/wx-pusher-uid`, {
                    method: "PUT",
                    headers: {
                      "Content-Type": "application/json",
                      Authorization: "Bearer " + token,
                    },
                    body: JSON.stringify({ wxPusherUid: wxPusherDraft.trim() }),
                  });
                  if (!res.ok) {
                    const errData = await res.json().catch(() => ({}));
                    throw new Error((errData as any).message || "保存失败");
                  }
                  toast.success("WxPusher 推送已绑定");
                  setCurrentWxPusher(wxPusherDraft.trim());
                  setWxPusherDialogOpen(false);
                } catch (e: any) {
                  toast.error(e?.message || "保存失败");
                } finally {
                  setWxPusherSaving(false);
                }
              }}
            >
              {wxPusherSaving ? "保存中..." : "保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
