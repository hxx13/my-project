import { useState, useCallback, useEffect, useMemo } from "react";
import { NavLink } from "react-router-dom";
import {
  Home,
  ChevronsLeft, ChevronsRight, ChevronDown, ChevronRight,
  Search, Star, Lock, History,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SHSMU_LOGO_URL } from "@/constants/shsmuBranding";
import { authStorage } from "@/features/auth/authStorage";
import { getImpersonationState } from "@/features/auth/impersonation";
import {
  fetchPublicPagePermissions,
  WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED,
  type PublicPagePermissionNode,
} from "@/api/domains/pagePermission.api";
import { buildStudentNavModel } from "@/features/student/nav/buildStudentNavModel";
import {
  createStudentNavContext,
  STUDENT_NAV_REGISTRY,
} from "@/features/student/nav/studentNavRegistry";
import {
  hydrateStudentNavPersonalization,
  readStudentNavStars,
  readStudentNavRecent,
  readStudentNavLock,
  toggleStudentNavStar,
  toggleStudentNavLock,
  appendStudentNavRecent,
  isStudentNavStarred,
  isStudentNavLocked,
  STUDENT_NAV_PERSONALIZATION_EVENT,
} from "./student-nav-personalization";

/* Re-export for command palette and layout */
export { readStudentNavStars as readStars, readStudentNavRecent as readRecent, readStudentNavLock as readLock, appendStudentNavRecent as appendRecent } from "./student-nav-personalization";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

interface StudentSidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  onOpenCommand?: () => void;
}

interface NavItem {
  to: string;
  icon: React.FC<{ className?: string }>;
  label: string;
  badge?: number;
  end?: boolean;
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

/* ------------------------------------------------------------------ */
/*  Navigation data                                                     */
/* ------------------------------------------------------------------ */

/**
 * 扁平导航项（命令面板检索用）：由学生端注册表（单一数据源）派生 + 首页入口。
 * 侧栏分组由 `buildStudentNavModel` 依据角色 / 页面权限过滤后生成；
 * 命令面板保留全量注册项以便搜索跳转（与旧版全量硬编码行为一致）。
 */
const ALL_NAV_ITEMS: NavItem[] = [
  { to: "/student/home", icon: Home, label: "首页", end: true },
  ...STUDENT_NAV_REGISTRY.flatMap((g) =>
    g.items.map((it) => ({ to: it.path, icon: it.icon, label: it.label })),
  ),
];

export { ALL_NAV_ITEMS };
export type { NavItem };

/* ------------------------------------------------------------------ */
/*  Sub-components                                                      */
/* ------------------------------------------------------------------ */

function NavBadge({ text }: { text?: string | number }) {
  if (text == null || text === 0) return null;
  const t = typeof text === "number" ? (text > 99 ? "99+" : String(text)) : text;
  if (!t.trim()) return null;
  return (
    <span className="ml-1 min-w-[1.25rem] shrink-0 rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white shadow-sm tabular-nums">
      {t}
    </span>
  );
}

function SidebarNavItem({
  item,
  collapsed,
  onAfterNav,
  starred,
  onToggleStar,
  locked,
  onToggleLock,
  inGroup,
}: {
  item: NavItem;
  collapsed: boolean;
  onAfterNav?: () => void;
  starred: boolean;
  onToggleStar: (path: string) => void;
  locked: boolean;
  onToggleLock: (path: string) => void;
  inGroup?: boolean;
}) {
  const Icon = item.icon;

  const starBtn = !collapsed ? (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleStar(item.to); }}
      title={starred ? "取消收藏" : "收藏此页面"}
      className={cn(
        "shrink-0 rounded p-0.5 transition-all",
        starred ? "text-amber-400 opacity-100 hover:text-amber-300"
               : "text-neutral-500 opacity-0 group-hover:opacity-100 hover:text-neutral-200",
      )}
    >
      <Star className={cn("h-3.5 w-3.5", starred && "fill-amber-400")} />
    </button>
  ) : null;

  const lockBtn = !collapsed ? (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleLock(item.to); }}
      title={locked ? "取消锁定" : "锁定此页面（外部进入时直达）"}
      className={cn(
        "shrink-0 rounded p-0.5 transition-all",
        locked ? "text-amber-400 opacity-100 hover:text-amber-300"
               : "text-neutral-500 opacity-0 group-hover:opacity-100 hover:text-neutral-200",
      )}
    >
      <Lock className={cn("h-3 w-3", locked && "fill-amber-400")} />
    </button>
  ) : null;

  const collapsedDot =
    collapsed && item.badge != null && item.badge > 0 ? (
      <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-neutral-950" />
    ) : null;

  return (
    <div className={cn("group flex w-full min-w-0 items-center gap-0.5", locked && "border-l-2 border-amber-400")}>
      {starBtn}
      {lockBtn}
      <NavLink
        to={item.to}
        end={item.end}
        title={collapsed ? item.label : undefined}
        onClick={() => onAfterNav?.()}
        className={({ isActive }) =>
          cn(
            "w-full rounded-lg py-2 text-left text-sm inline-flex items-center gap-2 transition-colors",
            collapsed ? "justify-center px-2" : cn("px-3", inGroup && "ml-2 w-[calc(100%-0.5rem)]"),
            isActive
              ? "bg-white/[0.12] font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] ring-1 ring-white/15"
              : "text-neutral-300 hover:bg-white/[0.06] hover:text-white",
          )
        }
      >
        <span className="relative inline-flex shrink-0 rounded-md p-1 ring-1 ring-inset ring-white/10">
          <Icon className="h-3.5 w-3.5" />
          {collapsedDot}
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 truncate">{item.label}</span>
            <NavBadge text={item.badge} />
          </>
        )}
      </NavLink>
    </div>
  );
}

/**
 * Single-collapsible glass group (for navGroups, stars, recent).
 * `amber` variant → amber border like admin's personal groups.
 */
function SidebarGroup({
  id, label, items, open, onToggle, collapsed, starred, onToggleStar, lockedPath, onToggleLock, amber, inGroupItems,
}: {
  id: string; label: string; items: NavItem[]; open: boolean; onToggle: (id: string) => void;
  collapsed: boolean; starred: (p: string) => boolean; onToggleStar: (p: string) => void;
  lockedPath: string | null; onToggleLock: (p: string) => void;
  amber?: boolean; inGroupItems?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <div
      className={cn(
        "rounded-xl border bg-white/[0.03] shadow-sm shadow-black/20 backdrop-blur-[2px]",
        amber ? "border-amber-400/25 bg-amber-950/15" : "border-white/[0.06]",
      )}
    >
      <button
        type="button"
        onClick={() => onToggle(id)}
        className="flex w-full items-center gap-2 rounded-t-xl px-3 py-2.5 text-left text-xs font-semibold tracking-wide text-neutral-300 transition-colors hover:bg-white/[0.04]"
        aria-expanded={open}
      >
        {amber ? (
          id === "stars" ? (
            <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400/50 text-amber-200" />
          ) : (
            <History className="h-3.5 w-3.5 shrink-0 text-amber-300" />
          )
        ) : (
          <>
            {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          </>
        )}
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
      {open ? (
        <div className="space-y-1 border-t border-white/[0.06] px-2 pb-2 pt-1">
          {items.map((it) => (
            <SidebarNavItem
              key={`${id}:${it.to}`}
              item={it}
              collapsed={false}
              starred={starred(it.to)}
              onToggleStar={onToggleStar}
              locked={lockedPath === it.to}
              onToggleLock={onToggleLock}
              inGroup={inGroupItems}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                      */
/* ------------------------------------------------------------------ */

export function StudentSidebar({ collapsed, onToggle, onOpenCommand }: StudentSidebarProps) {
  /** 镜像模式 / 模拟模式（教职工预览学生页）下，隐藏返回门户（/）的“首页”按钮 */
  const isMirrorMode = useMemo(() => authStorage.isMirrorMode(), []);
  const isImpersonating = useMemo(() => Boolean(getImpersonationState()?.isImpersonating), []);
  const hidePortalHome = isMirrorMode || isImpersonating;
  const [logoBroken, setLogoBroken] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => ({
    stars: true, recent: true, space: true, material: true,
  }));

  /* ── 导航模型：读取 STUDENT 导航配置 + 页面权限，产出侧栏分组（空间/物品/订购/计划书/消息/账号） ── */
  const role = authStorage.getRole() ?? "MEMBER";
  const [navGroups, setNavGroups] = useState<NavGroup[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let permNodes: PublicPagePermissionNode[] = [];
      try {
        permNodes = (await fetchPublicPagePermissions("WEB")) || [];
      } catch {
        permNodes = [];
      }
      if (cancelled) return;
      try {
        const ctx = createStudentNavContext(role, permNodes);
        const model = await buildStudentNavModel(ctx);
        if (cancelled) return;
        setNavGroups(
          model.sidebarGroups.map((g) => ({
            id: g.id,
            label: g.title,
            items: g.items.map((it) => ({ to: it.to, icon: it.icon, label: it.label, end: it.end })),
          })),
        );
      } catch {
        if (!cancelled) setNavGroups([]);
      }
    };
    void load();
    const onPermUpdated = () => void load();
    window.addEventListener(WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED, onPermUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener(WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED, onPermUpdated);
    };
  }, [role]);

  /* ── Persistent state (backend → localStorage fallback) ── */
  const [starPaths, setStarPaths] = useState<string[]>(() => readStudentNavStars());
  const [lockedPath, setLockedPath] = useState<string | null>(() => readStudentNavLock());
  const [recentPaths, setRecentPaths] = useState<string[]>(() => readStudentNavRecent());

  /* ── 挂载时 hydrate + 后续个性化变更（收藏/常用/锁定）触发重新读取 ──
   *  与后台 AdminLayout 的 personalBump 一致：仅挂载时读一次会导致
   *  hydrate 回写或 appendStudentNavRecent 之后「常用/收藏」永远为空而消失。 */
  const [personalBump, setPersonalBump] = useState(0);
  useEffect(() => {
    hydrateStudentNavPersonalization().then(() => setPersonalBump((n) => n + 1));
  }, []);
  useEffect(() => {
    const onChanged = () => setPersonalBump((n) => n + 1);
    window.addEventListener(STUDENT_NAV_PERSONALIZATION_EVENT, onChanged);
    return () => window.removeEventListener(STUDENT_NAV_PERSONALIZATION_EVENT, onChanged);
  }, []);
  useEffect(() => {
    setStarPaths(readStudentNavStars());
    setLockedPath(readStudentNavLock());
    setRecentPaths(readStudentNavRecent());
  }, [personalBump]);

  /* 路径 → NavItem 查找表：基于模型分组（含权限过滤）构建，保证收藏/常用能解析到侧栏同源项 */
  const pathMap = useMemo(() => {
    const m = new Map<string, NavItem>();
    m.set("/student/home", { to: "/student/home", icon: Home, label: "首页", end: true });
    for (const g of navGroups) for (const it of g.items) m.set(it.to, it);
    return m;
  }, [navGroups]);

  /* Resolve starred / recent to actual NavItems */
  const starredItems = starPaths.map((p) => pathMap.get(p)).filter(Boolean) as NavItem[];
  // Recent excludes starred + home（与后台侧栏一致：保留当前页，点击常用入口后不消失）
  const recentItems = recentPaths
    .filter((p) => !starPaths.includes(p) && p !== "/student/home")
    .map((p) => pathMap.get(p))
    .filter(Boolean) as NavItem[];

  const toggleGroup = useCallback((id: string) => {
    setOpenGroups((p) => ({ ...p, [id]: !p[id] }));
  }, []);

  const handleToggleStar = useCallback((path: string) => {
    toggleStudentNavStar(path);
    setStarPaths(readStudentNavStars());
  }, []);

  const handleToggleLock = useCallback((path: string) => {
    toggleStudentNavLock(path);
    setLockedPath(readStudentNavLock());
  }, []);

  const isStarred = useCallback((p: string) => starPaths.includes(p), [starPaths]);

  const renderNavItem = (it: NavItem, inGroup?: boolean) => (
    <SidebarNavItem
      key={it.to} item={it} collapsed={collapsed}
      starred={isStarred(it.to)} onToggleStar={handleToggleStar}
      locked={lockedPath === it.to} onToggleLock={handleToggleLock}
      inGroup={inGroup}
    />
  );

  return (
    <aside
      className={cn(
        "sticky top-0 z-30 flex h-[100dvh] max-h-[100dvh] shrink-0 self-start overflow-hidden border-r border-white/[0.06] bg-gradient-to-b from-neutral-950 via-neutral-900 to-neutral-950 text-neutral-100 transition-[width,padding] duration-200 ease-out",
        "pb-[env(safe-area-inset-bottom,0px)]",
        collapsed ? "w-14 px-2 py-4" : "w-72 p-5",
      )}
      aria-label="学生端侧边栏导航"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {/* ── Top chrome ── */}
        <div className={cn("shrink-0", collapsed ? "space-y-1" : "space-y-2")}>
          <div className={cn("flex items-center gap-2 font-semibold text-neutral-50", collapsed ? "mb-1 flex-col justify-center gap-3" : "mb-2 text-lg")}>
            {!collapsed ? (
              logoBroken ? <span className="min-w-0 truncate text-base tracking-tight">学生中心</span>
              : <img src={SHSMU_LOGO_URL} alt="上海交通大学医学院" className="h-12 w-auto max-w-[min(100%,15rem)] object-contain object-left brightness-0 invert" onError={() => setLogoBroken(true)} />
            ) : (
              <span title="上海交通大学医学院" className="inline-flex max-w-full justify-center">
                {logoBroken ? <span className="text-[10px] font-semibold leading-tight text-neutral-200">学生</span>
                : <img src={SHSMU_LOGO_URL} alt="" className="h-11 w-11 object-contain brightness-0 invert" onError={() => setLogoBroken(true)} />}
              </span>
            )}
          </div>

          <nav className={cn("space-y-2", collapsed && "space-y-1")}>
            {/* 门户 + 工作台 合并一行 */}
            <div className="flex w-full min-w-0 flex-row gap-1.5">
              {!hidePortalHome && (
                <NavLink to="/" end title={collapsed ? "门户" : undefined}
                  className={({ isActive }) => cn("w-full rounded-lg py-2 text-left text-sm inline-flex items-center gap-2 transition-colors", collapsed ? "justify-center px-2" : "px-3", "!w-auto min-w-0 flex-1 basis-0 justify-center", !collapsed && "!px-2 text-center", isActive ? "bg-white/[0.12] font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] ring-1 ring-white/15" : "text-neutral-300 hover:bg-white/[0.06] hover:text-white")}>
                  <Home className="h-3.5 w-3.5 shrink-0" />{!collapsed && "首页"}
                </NavLink>
              )}
              <NavLink to="/student/home" end title={collapsed ? "工作台" : undefined}
                className={({ isActive }) => cn("w-full rounded-lg py-2 text-left text-sm inline-flex items-center gap-2 transition-colors", collapsed ? "justify-center px-2" : "px-3", "!w-auto min-w-0 flex-1 basis-0 justify-center", !collapsed && "!px-2 text-center", isActive ? "bg-white/[0.12] font-medium text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)] ring-1 ring-white/15" : "text-neutral-300 hover:bg-white/[0.06] hover:text-white")}>
                <Home className="h-3.5 w-3.5 shrink-0" />{!collapsed && "工作台"}
              </NavLink>
            </div>

            {/* Search + Collapse */}
            {onOpenCommand ? (
              <button type="button" onClick={onOpenCommand} title="搜索页面 Ctrl+K"
                className={cn("flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] py-2 text-left text-xs text-neutral-400 transition-colors hover:border-white/15 hover:bg-white/[0.08] hover:text-neutral-200", collapsed ? "justify-center px-2" : "px-3")}>
                <Search className="h-4 w-4 shrink-0 opacity-70" />
                {!collapsed && <><span className="flex-1 truncate">搜索页面…</span><kbd className="hidden shrink-0 rounded border border-white/20 bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-slate-400 sm:inline">Ctrl K</kbd></>}
              </button>
            ) : null}
            <button type="button" onClick={onToggle} title={collapsed ? "展开侧栏" : "收起侧栏"}
              className={cn("flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] py-2 text-left text-xs text-neutral-400 transition-colors hover:border-white/15 hover:bg-white/[0.08] hover:text-neutral-200", collapsed ? "justify-center px-2" : "px-3")}>
              {collapsed ? <ChevronsRight className="h-4 w-4 shrink-0" /> : <><ChevronsLeft className="h-4 w-4 shrink-0" /><span>收起侧栏</span></>}
            </button>
          </nav>
        </div>

        {/* ── Scrollable groups ── */}
        <div
          className={cn("student-sidebar-scrollbar-hidden min-h-0 flex-1 overflow-y-auto overscroll-y-contain border-t border-white/[0.08]", collapsed ? "pt-2" : "pt-3")}
          style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
        >
          <nav className={cn(collapsed && "space-y-1")}>
            {collapsed ? (
              <div className="space-y-3">
                {navGroups.map((g) => <div key={g.id} className="space-y-1">{g.items.map((it) => renderNavItem(it))}</div>)}
              </div>
            ) : (
              <div className="space-y-1">
                {/* ⭐ 收藏 — amber glass group */}
                <SidebarGroup id="stars" label="收藏" items={starredItems}
                  open={openGroups["stars"] === true} onToggle={toggleGroup}
                  collapsed={false} starred={isStarred} onToggleStar={handleToggleStar}
                  lockedPath={lockedPath} onToggleLock={handleToggleLock} amber inGroupItems />

                {/* 🕐 常用 — amber glass group */}
                <SidebarGroup id="recent" label="常用" items={recentItems}
                  open={openGroups["recent"] === true} onToggle={toggleGroup}
                  collapsed={false} starred={isStarred} onToggleStar={handleToggleStar}
                  lockedPath={lockedPath} onToggleLock={handleToggleLock} amber inGroupItems />

                {/* 导航分组（空间/物品/订购/计划书/消息/账号，由导航模型供给） */}
                {navGroups.map((g) => (
                  <SidebarGroup key={g.id} id={g.id} label={g.label} items={g.items}
                    open={openGroups[g.id] === true} onToggle={toggleGroup}
                    collapsed={false} starred={isStarred} onToggleStar={handleToggleStar}
                    lockedPath={lockedPath} onToggleLock={handleToggleLock} inGroupItems />
                ))}
              </div>
            )}
            <div className="min-h-[50vh] shrink-0 pointer-events-none" aria-hidden />
          </nav>
        </div>
      </div>
    </aside>
  );
}
