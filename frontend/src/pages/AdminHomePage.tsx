import { createElement, useEffect, useMemo, useState, type ReactNode } from "react";
import { AdminFullWidthPage } from "@/components/ui/AdminFullWidthPage";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { fetchPublicPagePermissions, WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED, type MinRole } from "@/api/domains/pagePermission.api";
import { fetchPendingBadges } from "@/api/domains/me.api";
import { canShowWebEntry } from "@/features/auth/pagePermissionAccess";
import { buildAdminNavModel, createAdminNavContext, normalizeAdminPath, toAdminRoutePath, type AdminHomeEntry } from "@/features/admin/buildAdminNavModel";
import { ADMIN_NAV_PERSONALIZATION_EVENT, isAdminNavStarred, readAdminNavRecent, toggleAdminNavStar } from "@/features/admin/adminNavPersonalization";
import { ADMIN_PENDING_BADGES_REFRESH_EVENT } from "@/features/admin/adminPendingBadgesEvents";
import { ADMIN_NAV_REGISTRY, collectRegistryGroupItems, titleForUnknownAdminPath } from "@/features/admin/adminNavRegistry";
import { cn } from "@/lib/utils";
import { Sparkles, Star, ChevronDown, ChevronRight } from "lucide-react";

const ROLE_LABEL: Record<MinRole, string> = {
  MEMBER: "学生", STAFF: "教职工", SENIOR: "高级职工", ADMIN: "管理员", SUPER_ADMIN: "超级管理员", PLATFORM_OWNER: "平台所有者",
};

/** Hardcoded color map: path → CSS gradient. Built once at module load from registry. */
/** Registry label lookup: path → Chinese label */
const LABEL_MAP: Record<string, string> = {};
const COLOR_MAP: Record<string, string> = {};
const colors: Record<string, string> = {
  slate: "#64748b", zinc: "#71717a", gray: "#6b7280", neutral: "#737373", stone: "#78716c",
  red: "#f87171", rose: "#fb7185", pink: "#f472b6", fuchsia: "#e879f9", purple: "#c084fc",
  violet: "#a78bfa", indigo: "#818cf8", blue: "#60a5fa", sky: "#7dd3fc", cyan: "#67e8f9",
  teal: "#5eead4", emerald: "#6ee7b7", green: "#86efac", lime: "#bef264", yellow: "#fde047",
  amber: "#fbbf24", orange: "#fb923c",
};
for (const g of ADMIN_NAV_REGISTRY) {
  for (const it of collectRegistryGroupItems(g)) {
    const key = cleanPath(it.path);
    LABEL_MAP[key] = it.label;
    if (it.homeTone) {
      const m = it.homeTone.match(/from-(\w+)-(\d+)\s+to-(\w+)-(\d+)/);
      if (m) {
        COLOR_MAP[key] = `linear-gradient(135deg, ${colors[m[1]] || "#818cf8"}, ${colors[m[3]] || "#a78bfa"})`;
      }
    }
  }
}

/** Strip query/hash from path for registry lookup */
function cleanPath(path: string): string {
  return (path || "").replace(/[?#].*$/, "").replace(/\/+/g, "/");
}

/**
 * 工作台卡片标题：优先 nav-manager / 服务端 nav config 的 title，
 * 仅当标题为空或纯英文路径时才回退硬编码注册表（避免覆盖自定义名称）。
 */
function displayEntryLabel(path: string, title: string): string {
  const t = (title || "").trim();
  if (t && /[一-鿿]/.test(t)) return t;
  const key = cleanPath(path);
  if (LABEL_MAP[key]) return LABEL_MAP[key];
  if (t) return t;
  return titleForUnknownAdminPath(path);
}

type HomeCardModel = AdminHomeEntry & {
  groupTitle: string;
  icon: ReturnType<typeof createElement>;
  _bg: string;
};

/** 固定卡片宽度，按容器宽度自动填充列数并换行 */
const HOME_CARD_GRID_CLASS =
  "grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(5.75rem,5.75rem))]";

export default function AdminHomePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = authStorage.getRole() || "MEMBER";
  const [navBump, setNavBump] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { data: permNodes = [] } = useQuery({
    queryKey: ["publicPagePermissions", "WEB"] as const,
    queryFn: () => fetchPublicPagePermissions("WEB"),
    placeholderData: (prev) => prev,
  });

  const { data: pendingBadges } = useQuery({
    queryKey: ["pendingBadges"] as const,
    queryFn: fetchPendingBadges,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    const fn = () => qc.invalidateQueries({ queryKey: ["publicPagePermissions"] });
    window.addEventListener(WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED, fn);
    return () => window.removeEventListener(WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED, fn);
  }, [qc]);

  useEffect(() => {
    const fn = () => qc.invalidateQueries({ queryKey: ["pendingBadges"] });
    window.addEventListener(ADMIN_PENDING_BADGES_REFRESH_EVENT, fn);
    return () => window.removeEventListener(ADMIN_PENDING_BADGES_REFRESH_EVENT, fn);
  }, [qc]);

  useEffect(() => {
    const fn = () => setNavBump((n) => n + 1);
    window.addEventListener(ADMIN_NAV_PERSONALIZATION_EVENT, fn);
    return () => window.removeEventListener(ADMIN_NAV_PERSONALIZATION_EVENT, fn);
  }, []);

  const navCtx = useMemo(() => createAdminNavContext(role, permNodes), [role, permNodes]);
  const [navModel, setNavModel] = useState<Awaited<ReturnType<typeof buildAdminNavModel>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    buildAdminNavModel(navCtx, pendingBadges ?? null).then((model) => {
      if (!cancelled) setNavModel(model);
    });
    return () => { cancelled = true; };
  }, [navCtx, pendingBadges]);

  const allCards = useMemo(() => {
    const homeSections = navModel?.homeSections ?? [];
    return homeSections.flatMap((g) =>
      g.entries.map((e) => {
        const roleOk = hasMinRole(role, e.minRole);
        const permOk = canShowWebEntry(permNodes, e.path, "sidebar", role, e.minRole);
        const pathKey = cleanPath(e.path);
        return {
          ...e,
          title: displayEntryLabel(e.path, e.title),
          enabled: roleOk && permOk,
          groupTitle: g.title,
          icon: createElement(e.icon, { className: "h-5 w-5" }) as any,
          _bg: COLOR_MAP[pathKey] || "linear-gradient(135deg, #818cf8, #a78bfa)",
        } satisfies HomeCardModel;
      })
    );
  }, [navModel, permNodes, role]);

  const groups = useMemo(() => {
    const m = new Map<string, HomeCardModel[]>();
    for (const c of allCards) {
      if (!m.has(c.groupTitle)) m.set(c.groupTitle, []);
      m.get(c.groupTitle)!.push(c);
    }
    return [...m.entries()];
  }, [allCards]);

  const starred = useMemo(() => allCards.filter(c => isAdminNavStarred(c.path) && c.enabled), [allCards, navBump]);
  const recent = useMemo(() => {
    const paths = readAdminNavRecent();
    const out: HomeCardModel[] = [];
    for (const p of paths) {
      const hit = allCards.find(e => normalizeAdminPath(e.path) === p && e.enabled);
      if (hit) out.push(hit);
    }
    return out.slice(0, 8);
  }, [allCards, navBump]);

  const roleLabel = ROLE_LABEL[role as MinRole] ?? role;
  const enabledCount = allCards.filter((e) => e.enabled).length;
  const toggleGroup = (title: string) => setCollapsed(p => { const n = new Set(p); n.has(title) ? n.delete(title) : n.add(title); return n; });

  return (
    <AdminFullWidthPage>
      <div className="min-h-full space-y-6 bg-transparent p-4 sm:p-6">
        <section className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--app-color-accent-secondary)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--app-color-accent)]" />工作台
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--app-color-text-primary)]">欢迎回来</h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--app-color-text-secondary)]">
            <span>{roleLabel}</span><span>·</span><span>{enabledCount} 入口</span>
          </div>
        </section>

        {starred.length > 0 && (
          <section>
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--app-color-text-tertiary)]">
              <Star className="h-3 w-3 fill-[var(--app-color-accent)] text-[var(--app-color-accent)]" />收藏
            </h2>
            <HomeCardGrid>
              {starred.map(e => <HomeCard key={e.path} entry={e} navigate={navigate} starred />)}
            </HomeCardGrid>
          </section>
        )}

        {recent.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--app-color-text-tertiary)]">最近访问</h2>
            <HomeCardGrid>
              {recent.map(e => <HomeCard key={e.path} entry={e} navigate={navigate} />)}
            </HomeCardGrid>
          </section>
        )}

        {groups.map(([title, entries]) => {
          const enabled = entries.filter(e => e.enabled);
          if (enabled.length === 0) return null;
          const isCollapsed = collapsed.has(title);
          return (
            <section key={title}>
              <button
                type="button"
                onClick={() => toggleGroup(title)}
                className="mb-2 flex w-full items-center gap-1 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-text-secondary)]"
              >
                {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {title}
                <span className="ml-1 text-[10px] opacity-50">({enabled.length})</span>
              </button>
              {!isCollapsed && (
                <HomeCardGrid>
                  {enabled.map(e => <HomeCard key={e.path} entry={e} navigate={navigate} />)}
                </HomeCardGrid>
              )}
            </section>
          );
        })}
      </div>
    </AdminFullWidthPage>
  );
}

function HomeCardGrid({ children }: { children: ReactNode }) {
  return <div className={HOME_CARD_GRID_CLASS}>{children}</div>;
}

function HomePendingBadge({ text }: { text?: string }) {
  const t = (text || "").trim();
  if (!t) return null;
  return (
    <span
      className="absolute left-1 top-1 z-[1] min-w-[1.25rem] rounded-full bg-[var(--app-color-feedback-error)] px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-[var(--app-color-text-inverse)] shadow-sm tabular-nums"
      aria-label={`待处理 ${t}`}
    >
      {t}
    </span>
  );
}

function HomeCard({
  entry,
  navigate,
  starred,
}: {
  entry: HomeCardModel;
  navigate: (p: string) => void;
  starred?: boolean;
}) {
  const [isStarred, setIsStarred] = useState(starred ?? isAdminNavStarred(entry.path));
  return (
    <button
      type="button"
      onClick={() => entry.enabled && navigate(toAdminRoutePath(entry.path))}
      disabled={!entry.enabled}
      className={cn(
        "admin-home-entry-card group relative box-border flex h-[6.25rem] w-[5.75rem] shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl border p-2 text-center transition-all duration-200",
        entry.enabled
          ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-md"
          : "cursor-not-allowed border-[var(--app-color-border-default)] bg-[var(--app-color-surface-elevated)] opacity-50",
      )}
    >
      <HomePendingBadge text={entry.badgeText} />
      <div
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm [&_svg]:text-white"
        style={{ background: entry._bg || "#818cf8" }}
      >
        {entry.icon}
      </div>
      <span className="admin-home-entry-card__label line-clamp-2 w-full text-[11px] font-medium leading-tight">
        {entry.title}
      </span>
      <span
        role="button"
        tabIndex={0}
        onClick={(e) => { e.stopPropagation(); toggleAdminNavStar(entry.path); setIsStarred(!isStarred); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.stopPropagation();
            toggleAdminNavStar(entry.path);
            setIsStarred(!isStarred);
          }
        }}
        className={cn(
          "absolute right-1 top-1 z-[1] rounded-lg p-1 opacity-0 transition-opacity group-hover:opacity-100",
          isStarred ? "opacity-100 text-[var(--app-color-feedback-warning)]" : "text-[var(--app-color-text-tertiary)] hover:text-[var(--app-color-feedback-warning)]",
        )}
        aria-label={isStarred ? "取消收藏" : "收藏"}
      >
        <Star className={cn("h-3.5 w-3.5", isStarred && "fill-[var(--app-color-feedback-warning)]")} />
      </span>
    </button>
  );
}
