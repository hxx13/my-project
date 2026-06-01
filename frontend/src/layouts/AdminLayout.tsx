import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CircleHelp,
  History,
  Home,
  LogIn,
  LogOut,
  Menu,
  MessagesSquare,
  Search,
  Star,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
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
import { refreshAuthSession } from "@/api/domains/auth.api";
import {
  ADMIN_NOTIFICATION_SSE_PUSH_EVENT,
  ADMIN_PENDING_BADGES_REFRESH_EVENT,
  ADMIN_STAFF_CHAT_PUSH_DETAIL_EVENT,
  STAFF_CHAT_SSE_EVENT,
  type StaffChatSsePayload,
} from "@/features/admin/adminPendingBadgesEvents";
import { cn } from "@/lib/utils";
import { SHSMU_LOGO_URL } from "@/constants/shsmuBranding";
import {
  createAdminNavContext,
  buildAdminNavModel,
  type AdminSidebarNavGroup,
  type AdminSidebarNavItem,
} from "@/features/admin/buildAdminNavModel";
import { adminNavSubgroupOpenKey } from "@/features/admin/adminNavRegistry";
import {
  adminChromeTitle,
  collectSidebarEntryPathsFromPerm,
  resolveAdminShellBackTo,
  shouldShowAdminShellBack,
} from "@/features/admin/adminShellNavigation";
import {
  ADMIN_NAV_PERSONALIZATION_EVENT,
  appendAdminNavRecent,
  isFriendsSidebarGroupId,
  isPersonalSidebarGroupId,
  prependPersonalNavSidebarGroups,
  readAdminNavRecent,
  readAdminNavStars,
  RECENT_GROUP_ID,
  splitPersonalizedPaletteItems,
  STARS_GROUP_ID,
} from "@/features/admin/adminNavPersonalization";
import { canShowWebEntry } from "@/features/auth/pagePermissionAccess";
import { hasMinRole } from "@/features/auth/roleAccess";
import { adminInputClass } from "@/features/admin/adminFormUi";
import { AdminChromeContextMenu, type AdminChromeContextMenuPayload } from "@/features/admin/AdminChromeContextMenu";
import {
  parseAdminNavLinkFromEventTarget,
  parseFriendRowFromEventTarget,
  parseSensitiveFromEventTarget,
} from "@/features/admin/adminChromeContextMenuTarget";
import { AdminCommandPalette } from "@/features/admin/AdminCommandPalette";
import { AdminPageHelpDialog } from "@/features/admin/AdminPageHelpDialog";
import {
  ADMIN_SIDEBAR_OPEN_GROUPS_SESSION_KEY,
  ANIMAL_ROOM_TELEMETRY_RETURN_TO_KEY,
  readAdminSidebarOpenGroupsSession,
} from "@/features/admin/adminTelemetryNav";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const SIDEBAR_COLLAPSED_KEY = "aro-admin-sidebar-collapsed";

function routeMatches(pathname: string, to: string, end?: boolean) {
  if (end) return pathname === to || pathname === `${to}/`;
  return pathname === to || pathname.startsWith(`${to}/`);
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

/** 分组内各入口待办角标汇总（纯数字则相加，否则每条计 1） */
function sidebarGroupPendingTotal(items: { badgeText?: string }[]): number {
  let sum = 0;
  for (const it of items) {
    const raw = (it.badgeText || "").trim();
    if (!raw) continue;
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && String(n) === raw) sum += n;
    else sum += 1;
  }
  return sum;
}

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathname = location.pathname;
  const [pendingBadges, setPendingBadges] = useState<PendingBadges | null>(null);
  const role = authStorage.getRole() || "STUDENT";
  const [permNodes, setPermNodes] = useState<PublicPagePermissionNode[]>([]);
  const [commandOpen, setCommandOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [personalBump, setPersonalBump] = useState(0);
  /** 教职工及以上：整页自定义右键；菜单内改权等仍按角色收紧 */
  const [chromeCtx, setChromeCtx] = useState<AdminChromeContextMenuPayload | null>(null);
  const [sessionUser, setSessionUser] = useState(() => authStorage.getUserInfo());
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false);
  const [sidebarLogoBroken, setSidebarLogoBroken] = useState(false);
  const [pageHelpOpen, setPageHelpOpen] = useState(false);

  /** ARO account binding — SUPER_ADMIN only */
  const [aroBinding, setAroBinding] = useState<null | false | { aroUserId: string; name: string; departmentName: string; createdAt: string }>(null);
  const [aroBindDialogOpen, setAroBindDialogOpen] = useState(false);
  const [aroBindUserId, setAroBindUserId] = useState("");
  const [aroUnbindDialogOpen, setAroUnbindDialogOpen] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  /** 分组展开：从 session 恢复（全屏 Twin 子路由卸载本布局后返回时保留文件夹展开位置） */
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(readAdminSidebarOpenGroupsSession);

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

  /** Fetch ARO account binding status for SUPER_ADMIN */
  useEffect(() => {
    if (!hasMinRole(role, "SUPER_ADMIN")) return;
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
    const sync = () => {
      setSessionUser(authStorage.getUserInfo());
      if (authStorage.hasToken() && pathname.startsWith("/admin")) {
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

  /** 全后台常驻一条通知 SSE：新消息/站内通知到达即刷新角标；此前仅子页订阅时，不点进通知页侧栏不会更新 */
  const inAdminShell = pathname.startsWith("/admin");
  useEffect(() => {
    if (!inAdminShell || !authStorage.hasToken()) return;
    const token = authStorage.getToken();
    const url = `/api/notifications/stream?token=${encodeURIComponent(token)}`;
    const source = new EventSource(url);
    const onNotification = () => {
      void pullPendingBadges();
      window.dispatchEvent(new Event(ADMIN_NOTIFICATION_SSE_PUSH_EVENT));
      /** 消息页等子组件自行拉 /api/me/pending-badges，与侧栏同源 */
      window.dispatchEvent(new Event(ADMIN_PENDING_BADGES_REFRESH_EVENT));
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
    () => shouldShowAdminShellBack(pathname, permSidebarPaths),
    [pathname, permSidebarPaths]
  );
  const adminHeaderTitle = useMemo(() => adminChromeTitle(pathname), [pathname]);

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

  const { sidebarGroups: baseSidebarGroups, flatNavigableItems } = useMemo(
    () => buildAdminNavModel(navCtx, pendingBadges),
    [navCtx, pendingBadges]
  );

  const sidebarGroups = useMemo(
    () =>
      prependPersonalNavSidebarGroups(
        baseSidebarGroups,
        readAdminNavRecent(),
        readAdminNavStars(),
        showFriendsSidebarShortcut,
        friendsNavBadgeText
      ),
    [baseSidebarGroups, personalBump, showFriendsSidebarShortcut, friendsNavBadgeText]
  );

  const { starredItems, recentItems, registryItems } = useMemo(() => {
    void personalBump;
    return splitPersonalizedPaletteItems(flatNavigableItems, readAdminNavRecent(), readAdminNavStars());
  }, [flatNavigableItems, personalBump]);

  useEffect(() => {
    const onEvt = () => setPersonalBump((n) => n + 1);
    window.addEventListener(ADMIN_NAV_PERSONALIZATION_EVENT, onEvt);
    return () => window.removeEventListener(ADMIN_NAV_PERSONALIZATION_EVENT, onEvt);
  }, []);

  useEffect(() => {
    if (pathname.startsWith("/admin")) appendAdminNavRecent(pathname);
  }, [pathname]);

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
      if (!hasMinRole(role, "SUPER_ADMIN")) nav = null;
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
            onAfterNav?.();
          }}
          className={({ isActive }) => cn(navLinkClass(isActive, { inGroup, collapsed }), "relative")}
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
        <div key={it.key} className="flex w-full min-w-0">
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
        onClick={() => onAfterNav?.()}
        className={({ isActive }) =>
          cn(navLinkClass(isActive, { inGroup, collapsed }), justifyBetween && "justify-between")
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
      <div key={it.key} className="flex w-full min-w-0">
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
            const allItems = sidebarGroupAllItems(g);
            const pendingTotal = sidebarGroupPendingTotal(allItems);
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
                  <span className="flex shrink-0 items-center gap-1" aria-label={`${g.title}：${allItems.length} 个入口`}>
                    {pendingTotal > 0 ? (
                      <span className="min-w-[1.25rem] rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white shadow-sm tabular-nums">
                        {pendingTotal > 99 ? "99+" : pendingTotal}
                      </span>
                    ) : null}
                    <span
                      className="min-w-[1.25rem] rounded-full bg-white/[0.08] px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-neutral-400 ring-1 ring-white/10 tabular-nums"
                      title="分组内入口数量"
                    >
                      {allItems.length > 99 ? "99+" : allItems.length}
                    </span>
                  </span>
                </button>
                {open ? (
                  <div className="space-y-1 border-t border-white/[0.06] px-2 pb-2 pt-1">
                    {g.items.map((it) => renderNavItem(it, true, collapsed, onAfterNav))}
                    {(g.subgroups ?? []).map((sg) => {
                      const sgKey = adminNavSubgroupOpenKey(g.id, sg.id);
                      const sgOpen = openGroups[sgKey] === true;
                      const sgPending = sidebarGroupPendingTotal(sg.items);
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
                            {sgPending > 0 ? (
                              <span className="min-w-[1.1rem] rounded-full bg-rose-600/90 px-1 py-0.5 text-center text-[9px] font-bold text-white tabular-nums">
                                {sgPending > 99 ? "99+" : sgPending}
                              </span>
                            ) : null}
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
            to="/admin"
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

  return (
    <div className="flex min-h-screen min-w-0 items-start bg-[var(--twin-canvas-soft)] text-[var(--twin-ink)]">
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
          sidebarCollapsed ? "w-14 px-2 py-4" : "w-64 p-5"
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

      <section className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex min-h-16 shrink-0 flex-wrap items-center gap-x-2 gap-y-2 border-b border-[var(--twin-hairline)] bg-[var(--twin-canvas)]/95 px-4 py-2 shadow-twin-level-2 backdrop-blur-md sm:px-6 md:h-16 md:flex-nowrap md:py-0">
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
                  navigate(resolveAdminShellBackTo(pathname, location.state));
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
              <button
                type="button"
                onClick={() => setPageHelpOpen(true)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] text-[var(--twin-body)] hover:bg-[var(--twin-canvas-soft)]"
                title="本页帮助与留言"
                aria-label="本页帮助与留言"
              >
                <CircleHelp className="h-4 w-4" />
              </button>
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
                    <span className="truncate text-sm font-medium text-[var(--twin-ink)]">{headerPrimaryLabel}</span>
                    {headerUsername ? (
                      <span className="truncate text-[11px] text-[var(--twin-mute)]">@{headerUsername}</span>
                    ) : null}
                  </span>
                  <ChevronDown className="hidden h-4 w-4 shrink-0 text-[var(--twin-mute)] sm:block" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56" data-admin-chrome-ctx-surface>
                <div className="px-2 py-1.5 sm:hidden">
                  <div className="truncate text-sm font-medium text-[var(--twin-ink)]">{headerPrimaryLabel}</div>
                  {headerUsername ? <div className="truncate text-[11px] text-[var(--twin-mute)]">@{headerUsername}</div> : null}
                </div>
                <div className="px-2 py-1 text-[10px] text-[var(--twin-mute)] sm:block">当前角色 · {role}</div>
                <DropdownMenuSeparator />
                {hasMinRole(role, "SUPER_ADMIN") && aroBinding === false && (
                  <DropdownMenuItem onSelect={() => setAroBindDialogOpen(true)}>
                    <UserRound className="mr-2 h-4 w-4" />
                    绑定ARO账号
                  </DropdownMenuItem>
                )}
                {hasMinRole(role, "SUPER_ADMIN") && aroBinding && (
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
                          authStorage.setAuth(token, "STUDENT", null);
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
                {hasMinRole(role, "STAFF") ? (
                  <DropdownMenuItem
                    onSelect={() => {
                      setMobileNavOpen(false);
                      navigate("/admin/profile-security", {
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

        <main className="flex w-full min-w-0 flex-1 flex-col overflow-x-hidden bg-[var(--twin-canvas-soft)]">
          <BackfillAutoGlobalBanner />
          <div className="mx-auto w-full max-w-[1600px] flex-1 p-6 sm:p-8">
            <PageTransition key={location.pathname} variant="fadeUp" duration={0.3}>
              <Outlet />
            </PageTransition>
          </div>
        </main>
      </section>

      <AdminPageHelpDialog open={pageHelpOpen} onOpenChange={setPageHelpOpen} pagePath={pathname} />

      <AdminChromeContextMenu
        open={!!chromeCtx}
        payload={chromeCtx}
        permNodes={permNodes}
        role={role}
        onClose={() => setChromeCtx(null)}
        onOpenEntryInSettings={(p) => {
          setMobileNavOpen(false);
          navigate(`/admin/page-permissions?${new URLSearchParams({ focusPath: p }).toString()}`);
        }}
        onOpenSensitiveInSettings={() => {
          setMobileNavOpen(false);
          navigate("/admin/page-permissions");
        }}
        onSavedEntryPerm={() => {
          notifyWebPublicPagePermissionsUpdated();
        }}
        onOpenCommandPalette={() => setCommandOpen(true)}
      />

      <Dialog open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
        <DialogContent className="z-[320] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>退出登录</DialogTitle>
            <DialogDescription>确定要退出当前账号吗？</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              size="default"
              onClick={() => setLogoutDialogOpen(false)}
            >
              取消
            </Button>
            <Button
              variant="destructive"
              size="default"
              onClick={() => {
                authStorage.clear();
                toast.success("已退出登录");
                setLogoutDialogOpen(false);
                navigate("/login", { replace: true });
              }}
            >
              退出登录
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ARO 绑定弹窗 */}
      <Dialog open={aroBindDialogOpen} onOpenChange={setAroBindDialogOpen}>
        <DialogContent className="z-[320] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>绑定ARO账号</DialogTitle>
            <DialogDescription>输入要绑定的ARO用户ID</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <input
              className={adminInputClass}
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
        <DialogContent className="z-[320] sm:max-w-sm">
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
    </div>
  );
}
