import { createElement, useEffect, useMemo, useState } from "react";
import { AdminFullWidthPage } from "@/components/ui/AdminFullWidthPage";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import { fetchPublicPagePermissions, WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED, type MinRole } from "@/api/domains/pagePermission.api";
import { canShowWebEntry } from "@/features/auth/pagePermissionAccess";
import { buildAdminNavModel, createAdminNavContext, normalizeAdminPath } from "@/features/admin/buildAdminNavModel";
import { ADMIN_NAV_PERSONALIZATION_EVENT, isAdminNavStarred, readAdminNavRecent, toggleAdminNavStar } from "@/features/admin/adminNavPersonalization";
import { ADMIN_NAV_REGISTRY, collectRegistryGroupItems } from "@/features/admin/adminNavRegistry";
import { cn } from "@/lib/utils";
import { Sparkles, Star, ChevronDown, ChevronRight } from "lucide-react";

const ROLE_LABEL: Record<MinRole, string> = {
  STUDENT: "学生", STAFF: "教职工", SENIOR: "高级职工", ADMIN: "管理员", SUPER_ADMIN: "超级管理员", PLATFORM_OWNER: "平台所有者",
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

/** If title has no Chinese characters, try registry label as fallback */
function chineseLabel(path: string, fallback: string): string {
  const key = cleanPath(path);
  const reg = LABEL_MAP[key];
  if (reg) return reg;
  if (/[一-鿿]/.test(fallback)) return fallback;
  const seg = path.replace(/[?#].*$/, "").split("/").filter(Boolean).pop() || "";
  return seg.replace(/-/g, " ");
}

export default function AdminHomePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = authStorage.getRole() || "STUDENT";
  const [navBump, setNavBump] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { data: permNodes = [] } = useQuery({
    queryKey: ["publicPagePermissions", "WEB"] as const,
    queryFn: () => fetchPublicPagePermissions("WEB"),
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    const fn = () => qc.invalidateQueries({ queryKey: ["publicPagePermissions"] });
    window.addEventListener(WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED, fn);
    return () => window.removeEventListener(WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED, fn);
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
    buildAdminNavModel(navCtx, null).then((model) => { if (!cancelled) setNavModel(model); });
    return () => { cancelled = true; };
  }, [navCtx]);

  const allCards = useMemo(() => {
    const homeSections = navModel?.homeSections ?? [];
    return homeSections.flatMap((g) =>
      g.entries.map((e) => {
        const roleOk = hasMinRole(role, e.minRole);
        const permOk = canShowWebEntry(permNodes, e.path, "sidebar", role, e.minRole);
        const pathKey = cleanPath(e.path);
        return {
          ...e,
          title: chineseLabel(e.path, e.title),
          enabled: roleOk && permOk,
          groupTitle: g.title,
          icon: createElement(e.icon, { className: "h-5 w-5" }),
          _bg: COLOR_MAP[pathKey] || "linear-gradient(135deg, #818cf8, #a78bfa)",
        };
      })
    );
  }, [navModel, permNodes, role]);

  const groups = useMemo(() => {
    const m = new Map<string, typeof allCards>();
    for (const c of allCards) {
      if (!m.has(c.groupTitle)) m.set(c.groupTitle, []);
      m.get(c.groupTitle)!.push(c);
    }
    return [...m.entries()];
  }, [allCards]);

  const starred = useMemo(() => allCards.filter(c => isAdminNavStarred(c.path) && c.enabled), [allCards, navBump]);
  const recent = useMemo(() => {
    const paths = readAdminNavRecent();
    const out: typeof allCards = [];
    for (const p of paths) { const hit = allCards.find(e => normalizeAdminPath(e.path) === p && e.enabled); if (hit) out.push(hit); }
    return out.slice(0, 8);
  }, [allCards, navBump]);

  const roleLabel = ROLE_LABEL[role as MinRole] ?? role;
  const enabledCount = allCards.filter((e) => e.enabled).length;
  const toggleGroup = (title: string) => setCollapsed(p => { const n = new Set(p); n.has(title) ? n.delete(title) : n.add(title); return n; });

  return (
    <AdminFullWidthPage>
      <div className="min-h-full bg-[var(--color-warm-50)] p-4 sm:p-6 space-y-6">
        <section className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-steel-500)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--color-peach-500)]" />工作台
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-[var(--color-slate-900)]">欢迎回来</h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--color-steel-500)]">
            <span>{roleLabel}</span><span>·</span><span>{enabledCount} 入口</span>
          </div>
        </section>

        {starred.length > 0 && (
          <section>
            <h2 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-steel-400)]">
              <Star className="h-3 w-3 fill-[var(--color-peach-500)] text-[var(--color-peach-500)]" />收藏
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {starred.map(e => <HomeCard key={e.path} entry={e} navigate={navigate} starred />)}
            </div>
          </section>
        )}

        {recent.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-steel-400)]">最近访问</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {recent.map(e => <HomeCard key={e.path} entry={e} navigate={navigate} />)}
            </div>
          </section>
        )}

        {groups.map(([title, entries]) => {
          const enabled = entries.filter(e => e.enabled);
          if (enabled.length === 0) return null;
          const isCollapsed = collapsed.has(title);
          return (
            <section key={title}>
              <button onClick={() => toggleGroup(title)} className="mb-2 flex w-full items-center gap-1 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-steel-400)] hover:text-[var(--color-slate-700)]">
                {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                {title}
                <span className="ml-1 text-[10px] opacity-50">({enabled.length})</span>
              </button>
              {!isCollapsed && (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                  {enabled.map(e => <HomeCard key={e.path} entry={e} navigate={navigate} />)}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </AdminFullWidthPage>
  );
}

function HomeCard({ entry, navigate, starred }: { entry: any; navigate: (p: string) => void; starred?: boolean }) {
  const [isStarred, setIsStarred] = useState(starred ?? isAdminNavStarred(entry.path));
  return (
    <button
      onClick={() => entry.enabled && navigate(entry.path)}
      disabled={!entry.enabled}
      className={cn(
        "group relative flex flex-col items-center justify-center gap-2 rounded-2xl p-3 text-center transition-all duration-200",
        "w-full min-h-[88px]",
        entry.enabled
          ? "bg-white border border-[var(--twin-hairline)] shadow-sm hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
          : "bg-[var(--color-warm-100)] border border-[var(--twin-hairline)] opacity-50 cursor-not-allowed"
      )}
    >
      <div
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
        style={{ background: entry._bg || "#818cf8" }}
      >
        {entry.icon}
      </div>
      <span className="text-[11px] font-medium text-[var(--color-slate-800)] leading-tight line-clamp-2">{entry.title}</span>
      <span
        role="button" tabIndex={0}
        onClick={(e) => { e.stopPropagation(); toggleAdminNavStar(entry.path); setIsStarred(!isStarred); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); toggleAdminNavStar(entry.path); setIsStarred(!isStarred); } }}
        className={cn("absolute top-1 right-1 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer",
          isStarred ? "opacity-100 text-amber-500" : "text-gray-400 hover:text-amber-500")}
      >
        <Star className={cn("h-3.5 w-3.5", isStarred && "fill-amber-400")} />
      </span>
    </button>
  );
}
