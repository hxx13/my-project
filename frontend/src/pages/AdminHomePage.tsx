import { createElement, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authStorage } from "@/features/auth/authStorage";
import { hasMinRole } from "@/features/auth/roleAccess";
import {
  fetchPublicPagePermissions,
  WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED,
  type PublicPagePermissionNode,
  type MinRole,
} from "@/api/domains/pagePermission.api";
import { canShowWebEntry } from "@/features/auth/pagePermissionAccess";
import {
  buildAdminNavModel,
  createAdminNavContext,
  normalizeAdminPath,
} from "@/features/admin/buildAdminNavModel";
import {
  ADMIN_NAV_PERSONALIZATION_EVENT,
  isAdminNavStarred,
  readAdminNavRecent,
  toggleAdminNavStar,
} from "@/features/admin/adminNavPersonalization";
import { cn } from "@/lib/utils";
import { Lock, Sparkles, Star } from "lucide-react";

const ROLE_LABEL: Record<MinRole, string> = {
  STUDENT: "学生",
  STAFF: "教职工",
  SENIOR: "高级职工",
  ADMIN: "管理员",
  SUPER_ADMIN: "超级管理员",
  PLATFORM_OWNER: "平台所有者",
};

export default function AdminHomePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const role = authStorage.getRole() || "STUDENT";
  const [navBump, setNavBump] = useState(0);

  const { data: permNodes = [] } = useQuery({
    queryKey: ["publicPagePermissions", "WEB"] as const,
    queryFn: () => fetchPublicPagePermissions("WEB"),
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    const onWebPermUpdated = () => {
      qc.invalidateQueries({ queryKey: ["publicPagePermissions"] });
    };
    window.addEventListener(WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED, onWebPermUpdated);
    return () => window.removeEventListener(WEB_PUBLIC_PAGE_PERMISSIONS_UPDATED, onWebPermUpdated);
  }, [qc]);

  useEffect(() => {
    const fn = () => setNavBump((n) => n + 1);
    window.addEventListener(ADMIN_NAV_PERSONALIZATION_EVENT, fn);
    return () => window.removeEventListener(ADMIN_NAV_PERSONALIZATION_EVENT, fn);
  }, []);

  const navCtx = useMemo(() => createAdminNavContext(role, permNodes), [role, permNodes]);

  const cards = useMemo(() => {
    const { homeSections } = buildAdminNavModel(navCtx, null);
    return homeSections.map((g) => ({
      ...g,
      entries: g.entries.map((e) => {
        const roleOk = hasMinRole(role, e.minRole);
        const permOk = canShowWebEntry(permNodes, e.path, "sidebar", role, e.minRole);
        return {
          ...e,
          enabled: roleOk && permOk,
          icon: createElement(e.icon, { className: "h-5 w-5" }),
        };
      }),
    }));
  }, [navCtx, permNodes, role]);

  const flatEntries = useMemo(() => cards.flatMap((g) => g.entries), [cards]);

  const recentQuick = useMemo(() => {
    void navBump;
    const paths = readAdminNavRecent();
    const out: (typeof flatEntries)[number][] = [];
    for (const p of paths) {
      const hit = flatEntries.find((e) => normalizeAdminPath(e.path) === p && e.enabled);
      if (hit) out.push(hit);
    }
    return out;
  }, [flatEntries, navBump]);

  const roleLabel = ROLE_LABEL[role as MinRole] ?? role;
  const enabledCount = flatEntries.filter((e) => e.enabled).length;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-6 shadow-twin-level-1 sm:p-8">
        <div
          className="pointer-events-none absolute -right-24 -top-24 h-56 w-56 rounded-full bg-[conic-gradient(from_180deg_at_50%_50%,rgba(0,112,243,0.12),transparent_55%,rgba(121,40,202,0.08),transparent)] opacity-90 blur-2xl"
          aria-hidden
        />
        <div className="pointer-events-none absolute -bottom-16 left-1/2 h-32 w-[min(100%,28rem)] -translate-x-1/2 rounded-full bg-gradient-to-t from-[var(--twin-canvas-soft)] to-transparent blur-xl" aria-hidden />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-2">
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--twin-mute)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--twin-link-deep)]" aria-hidden />
              工作台
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--twin-ink)] sm:text-3xl">欢迎回来</h1>
            <p className="max-w-xl text-sm leading-relaxed text-[var(--twin-body)]">
              从下方分区进入各管理模块。收藏会同步到命令面板{" "}
              <kbd className="rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--twin-body)]">
                Ctrl
              </kbd>
              <kbd className="ml-0.5 rounded-twin-sm border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-1.5 py-0.5 font-mono text-[10px] font-medium text-[var(--twin-body)]">
                K
              </kbd>{" "}
              快速跳转。
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3 py-1 text-xs font-medium text-[var(--twin-body)]">
              当前身份 · {roleLabel}
            </span>
            <span className="inline-flex items-center rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1 text-xs font-medium text-emerald-800">
              已开放入口 · {enabledCount}
            </span>
          </div>
        </div>
      </section>

      {recentQuick.length ? (
        <section className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-5 shadow-twin-level-1 sm:p-6">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--twin-mute)]">最近访问</h2>
          <div className="flex flex-wrap gap-2">
            {recentQuick.map((e) => (
              <button
                key={e.path}
                type="button"
                onClick={() => navigate(e.path)}
                className="max-w-full truncate rounded-full border border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] px-3.5 py-1.5 text-left text-xs font-medium text-[var(--twin-ink)] shadow-twin-level-1 transition hover:border-[var(--twin-link-deep)]/35 hover:bg-[var(--twin-canvas)]"
                title={e.path}
              >
                {e.title}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {cards.map((group) => (
        <section
          key={group.title}
          className="rounded-twin-xl border border-[var(--twin-hairline)] bg-[var(--twin-canvas)] p-5 shadow-twin-level-1 sm:p-6"
        >
          <h2 className="mb-4 border-b border-[var(--twin-hairline)] pb-3 text-base font-semibold tracking-tight text-[var(--twin-ink)]">
            {group.title}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {group.entries.map((entry, idx) => {
              const starred = isAdminNavStarred(entry.path);
              const openEntry = () => {
                if (entry.enabled) void navigate(entry.path);
              };
              const onCardKey = (e: KeyboardEvent) => {
                if (!entry.enabled) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openEntry();
                }
              };
              return (
                <div
                  key={`${entry.path}-${idx}`}
                  role="button"
                  tabIndex={entry.enabled ? 0 : -1}
                  aria-disabled={!entry.enabled}
                  onClick={openEntry}
                  onKeyDown={onCardKey}
                  className={cn(
                    "group rounded-twin-xl border p-4 text-left outline-none transition duration-200",
                    "focus-visible:ring-2 focus-visible:ring-[var(--twin-link-deep)]/30 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--twin-canvas)]",
                    entry.enabled
                      ? "cursor-pointer border-[var(--twin-hairline)] bg-[var(--twin-canvas)] shadow-twin-level-1 hover:-translate-y-0.5 hover:border-[var(--twin-hairline-strong)] hover:shadow-twin-level-2"
                      : "cursor-not-allowed border-[var(--twin-hairline)] bg-[var(--twin-canvas-soft)] opacity-[0.72]"
                  )}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <div
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-twin-xl bg-gradient-to-br text-white shadow-md ring-1 ring-black/5 ${entry.tone}`}
                    >
                      {entry.icon}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        title={starred ? "取消收藏" : "加入收藏（同步到命令面板）"}
                        aria-pressed={starred}
                        disabled={!entry.enabled}
                        onClick={(ev) => {
                          ev.preventDefault();
                          ev.stopPropagation();
                          if (!entry.enabled) return;
                          toggleAdminNavStar(entry.path);
                        }}
                        className={cn(
                          "rounded-twin-lg p-2 text-[var(--twin-mute)] transition hover:bg-[var(--twin-canvas-soft)] hover:text-amber-600",
                          starred && "text-amber-500"
                        )}
                      >
                        <Star className={cn("h-4 w-4", starred && "fill-amber-400 text-amber-600")} />
                      </button>
                      {!entry.enabled ? <Lock className="h-4 w-4 text-[var(--twin-mute)]" aria-hidden /> : null}
                    </div>
                  </div>
                  <div className="text-sm font-semibold tracking-tight text-[var(--twin-ink)]">{entry.title}</div>
                  <div className="mt-1.5 text-[11px] text-[var(--twin-mute)]">权限要求：{ROLE_LABEL[entry.minRole]}</div>
                  <div
                    className={cn(
                      "mt-2 inline-flex rounded-twin-md px-2 py-0.5 text-[11px] font-medium",
                      entry.enabled
                        ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/80"
                        : "bg-rose-50 text-rose-800 ring-1 ring-rose-200/80"
                    )}
                  >
                    {entry.enabled ? "可访问" : "无权限（仅禁用跳转）"}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
