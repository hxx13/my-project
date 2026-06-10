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

  // Path → Chinese label lookup from registry
  const pathLabelMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of ADMIN_NAV_REGISTRY) {
      for (const it of collectRegistryGroupItems(g)) {
        m.set(it.path.replace(/\/+/g, "/"), it.label);
      }
    }
    return m;
  }, []);

  const allCards = useMemo(() => {
    const homeSections = navModel?.homeSections ?? [];
    return homeSections.flatMap((g) =>
      g.entries.map((e) => {
        const roleOk = hasMinRole(role, e.minRole);
        const permOk = canShowWebEntry(permNodes, e.path, "sidebar", role, e.minRole);
        // Convert Tailwind gradient class to inline CSS gradient
        // (Tailwind JIT can't scan registry data files for dynamic classes)
        const toneGradient = toneToGradient((e as any).tone);
        // Override English titles with Chinese registry labels
        const pathKey = (e.path || "").replace(/\/+/g, "/");
        const chineseTitle = pathLabelMap.get(pathKey) || e.title;
        return { ...e, title: chineseTitle, enabled: roleOk && permOk, groupTitle: g.title, icon: createElement(e.icon, { className: "h-5 w-5" }), _toneGradient: toneGradient };
      })
    );
  }, [navModel, permNodes, role, pathLabelMap]);

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
        {/* Header — Bento warm surface */}
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

        {/* ── Starred ── */}
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

        {/* ── Recent ── */}
        {recent.length > 0 && (
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-steel-400)]">最近访问</h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {recent.map(e => <HomeCard key={e.path} entry={e} navigate={navigate} />)}
            </div>
          </section>
        )}

        {/* ── Groups ── */}
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

/** Convert Tailwind gradient class to CSS gradient using project color tokens */
function toneToGradient(tone?: string): string | undefined {
  if (!tone) return undefined;
  // Parse "from-X-N to-Y-M" → linear-gradient using CSS variables
  const m = tone.match(/from-(\w+)-(\d+)\s+to-(\w+)-(\d+)/);
  if (!m) return undefined;
  const [, c1, n1, c2, n2] = m;
  return `linear-gradient(135deg, var(--color-${c1}-${n1}), var(--color-${c2}-${n2}))`;
}

/** Bento-style compact card — white bg, rounded-2xl, subtle shadow, colored icon circle */
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
      {/* Icon circle — gradient via inline style (Tailwind JIT can't scan data files for dynamic classes) */}
      <div
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm"
        style={entry._toneGradient ? { background: entry._toneGradient } : undefined}
      >
        {entry.icon}
      </div>
      <span className="text-[11px] font-medium text-[var(--color-slate-800)] leading-tight line-clamp-2">{entry.title}</span>
      {/* Star toggle */}
      <button
        onClick={(e) => { e.stopPropagation(); toggleAdminNavStar(entry.path); setIsStarred(!isStarred); }}
        className={cn("absolute top-1 right-1 p-1 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity",
          isStarred ? "opacity-100 text-[var(--color-peach-600)]" : "text-[var(--color-steel-400)] hover:text-[var(--color-peach-500)]")}
      >
        <Star className={cn("h-3.5 w-3.5", isStarred && "fill-[var(--color-peach-500)]")} />
      </button>
    </button>
  );
}
