import { useCallback, useMemo } from "react";
import type { Location, NavigateFunction } from "react-router-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { ADMIN_NAV_REGISTRY, collectRegistryGroupItems } from "@/features/admin/adminNavRegistry";
import { resolveAdminNavUserId } from "@/features/admin/adminNavPersonalization";
import { normalizeAdminPath, toAdminRoutePath } from "@/features/admin/buildAdminNavModel";

/** 与动物房页一致：侧栏/命令面板进入全屏前写入，刷新后仍可「返回」 */
export const ANIMAL_ROOM_TELEMETRY_RETURN_TO_KEY = "animalRoomTelemetryReturnTo";

/** 数字孪生大屏：独立 key，避免与动物房页互相覆盖 returnTo */
export const DIGITAL_TWIN_SCREEN_RETURN_TO_KEY = "digitalTwinScreenReturnTo";

/** 动物房驾驶舱全屏页：独立 returnTo key */
export const ANIMAL_ROOM_COCKPIT_RETURN_TO_KEY = "animalRoomCockpitReturnTo";

/**
 * 管理后台侧栏「分组文件夹」展开态（sessionStorage）。
 * 动物房/数字孪生等挂在 TwinLayout 下的全屏路由会卸载 AdminLayout；返回时需恢复展开位置。
 */
export const ADMIN_SIDEBAR_OPEN_GROUPS_SESSION_KEY = "aroAdminSidebarOpenGroupsV1";

/** 工作台：离开前最后点击的入口（canonical /admin/... 路径） */
export const ADMIN_HOME_LAST_ENTRY_SESSION_KEY = "aroAdminHomeLastEntryV1";

/** 工作台：离开前点击入口所在分区（收藏/最近/分组/侧栏），用于精确高亮 */
export const ADMIN_HOME_HIGHLIGHT_TARGET_SESSION_KEY = "aroAdminHomeHighlightTargetV1";

/** 工作台：返回时需高亮最后点击入口 */
export const ADMIN_HOME_HIGHLIGHT_PENDING_SESSION_KEY = "aroAdminHomeHighlightPendingV1";

/** 工作台：离开前纵向滚动位置（window / document.scrollingElement） */
export const ADMIN_HOME_SCROLL_SESSION_KEY = "aroAdminHomeScrollYV1";

export type AdminHomeEntrySource = "group" | "starred" | "recent" | "sidebar" | "palette";

export type AdminHomeHighlightTarget = {
  path: string;
  source: AdminHomeEntrySource;
  groupTitle?: string;
  /** 唯一键：`group:分组名:/admin/...` 或 `recent:/admin/...` 等 */
  entryKey?: string;
};

export type AdminHomeReturnState = {
  /** @deprecated 仅路径；优先使用 highlightTarget */
  highlightEntry?: string;
  highlightTarget?: AdminHomeHighlightTarget;
  /** 返回工作台时跳过 PageTransition 入场动画，避免布局偏移干扰滚动恢复 */
  skipAdminHomeEnterAnimation?: boolean;
};

/** 工作台入口唯一键，用于精确高亮匹配 */
export function buildAdminHomeEntryKey(
  source: AdminHomeEntrySource,
  path: string,
  groupTitle?: string,
): string {
  const norm = normalizeAdminPath(path);
  if (source === "group") {
    return groupTitle ? `group:${groupTitle}:${norm}` : `group::${norm}`;
  }
  return `${source}:${norm}`;
}

export function matchesAdminHomeHighlightTarget(
  path: string,
  source: AdminHomeEntrySource,
  groupTitle: string | undefined,
  target: AdminHomeHighlightTarget | null,
): boolean {
  if (!target) return false;
  if (target.entryKey) {
    return target.entryKey === buildAdminHomeEntryKey(source, path, groupTitle);
  }
  const norm = normalizeAdminPath(path);
  if (norm !== target.path) return false;
  if (target.source !== source) return false;
  if (source === "group") {
    if (!target.groupTitle || !groupTitle) return false;
    return target.groupTitle === groupTitle;
  }
  return true;
}

/** 写入时双写 base + uid 键，避免 uid 晚于首次写入才就绪导致读写 key 不一致 */
function writeAdminHomeSessionItem(base: string, value: string): void {
  try {
    sessionStorage.setItem(base, value);
    const uid = resolveAdminNavUserId();
    if (uid) sessionStorage.setItem(`${base}_${uid}`, value);
  } catch {
    /* ignore */
  }
}

/** 读取时优先 uid 键，回退 base 键（兼容 uid 尚未就绪时的写入） */
function readAdminHomeSessionItem(base: string): string | null {
  try {
    const uid = resolveAdminNavUserId();
    if (uid) {
      const scoped = sessionStorage.getItem(`${base}_${uid}`);
      if (scoped != null) return scoped;
    }
    return sessionStorage.getItem(base);
  } catch {
    return null;
  }
}

function removeAdminHomeSessionItem(base: string): void {
  try {
    sessionStorage.removeItem(base);
    const uid = resolveAdminNavUserId();
    if (uid) sessionStorage.removeItem(`${base}_${uid}`);
  } catch {
    /* ignore */
  }
}

/** Admin 主内容区滚动载体：layout 未设 overflow 时为 document.scrollingElement */
export function getAdminContentScrollElement(): Element {
  const marked = document.querySelector("[data-admin-main-scroll]");
  if (marked instanceof HTMLElement && marked.scrollHeight > marked.clientHeight + 1) {
    return marked;
  }
  return document.scrollingElement ?? document.documentElement;
}

export function readAdminContentScrollY(): number {
  const el = getAdminContentScrollElement();
  if (el === document.scrollingElement || el === document.documentElement) {
    return window.scrollY || document.documentElement.scrollTop || 0;
  }
  return (el as HTMLElement).scrollTop;
}

export function scrollAdminContentTo(y: number, behavior: ScrollBehavior = "instant"): void {
  const el = getAdminContentScrollElement();
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const effectiveBehavior = reducedMotion ? "instant" : behavior;
  const top = Math.max(0, Math.round(y));
  if (effectiveBehavior === "smooth") {
    if (el === document.scrollingElement || el === document.documentElement) {
      window.scrollTo({ top, left: 0, behavior: "smooth" });
      return;
    }
    (el as HTMLElement).scrollTo({ top, left: 0, behavior: "smooth" });
    return;
  }
  // Direct assignment — always instant, avoids browsers that animate scrollTo options.
  if (el === document.scrollingElement || el === document.documentElement) {
    window.scrollTo(0, top);
    return;
  }
  (el as HTMLElement).scrollTop = top;
}

export function saveAdminHomeScrollPosition(): void {
  try {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }
  } catch {
    /* ignore */
  }
  writeAdminHomeSessionItem(ADMIN_HOME_SCROLL_SESSION_KEY, String(Math.round(readAdminContentScrollY())));
}

export function resetAdminHomeScrollRestoration(): void {
  try {
    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "auto";
    }
  } catch {
    /* ignore */
  }
}

export function readAdminHomeScrollPosition(): number | null {
  const raw = readAdminHomeSessionItem(ADMIN_HOME_SCROLL_SESSION_KEY);
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function clearAdminHomeScrollPosition(): void {
  removeAdminHomeSessionItem(ADMIN_HOME_SCROLL_SESSION_KEY);
}

export type AdminHomeScrollRestoreHandle = { cancel: () => void };

/**
 * 多帧重试恢复工作台滚动 Y，直到与 savedY 相差 ≤2px 且连续稳定，或达到 maxAttempts。
 * layout 异步增长（navModel / 最近访问）时可多次调用；仅在最终稳定后清除 session。
 */
export function restoreAdminHomeScrollPosition(opts?: {
  /** 显式目标 Y；省略时从 session 读取 */
  savedY?: number;
  maxAttempts?: number;
  stableFramesRequired?: number;
  /** 稳定后是否清除 session，默认 true */
  clearOnStable?: boolean;
  onStable?: () => void;
}): AdminHomeScrollRestoreHandle {
  const savedY = opts?.savedY ?? readAdminHomeScrollPosition();
  if (savedY == null) {
    return { cancel: () => {} };
  }

  const maxAttempts = opts?.maxAttempts ?? 20;
  const stableFramesRequired = opts?.stableFramesRequired ?? 3;
  const clearOnStable = opts?.clearOnStable !== false;
  let cancelled = false;
  let rafId = 0;
  let attempts = 0;
  let stableFrames = 0;

  // Sync before paint (caller should use useLayoutEffect); rAF loop only corrects layout drift.
  scrollAdminContentTo(savedY, "instant");

  const tick = () => {
    if (cancelled) return;
    const delta = Math.abs(readAdminContentScrollY() - savedY);
    if (delta <= 2) {
      stableFrames += 1;
      if (stableFrames >= stableFramesRequired) {
        if (clearOnStable) clearAdminHomeScrollPosition();
        resetAdminHomeScrollRestoration();
        opts?.onStable?.();
        return;
      }
    } else {
      stableFrames = 0;
      scrollAdminContentTo(savedY, "instant");
    }
    attempts += 1;
    if (attempts >= maxAttempts) {
      if (clearOnStable) clearAdminHomeScrollPosition();
      resetAdminHomeScrollRestoration();
      opts?.onStable?.();
      return;
    }
    rafId = window.requestAnimationFrame(tick);
  };

  rafId = window.requestAnimationFrame(tick);

  return {
    cancel: () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    },
  };
}

export function hasPendingAdminHomeScrollRestore(): boolean {
  return readAdminHomeScrollPosition() != null;
}

export function isAdminHomeLocation(pathname: string): boolean {
  return normalizeAdminPath(pathname) === "/admin";
}

export function writeAdminHomeLastEntry(path: string): void {
  const norm = normalizeAdminPath(path);
  if (!norm || norm === "/admin") return;
  writeAdminHomeSessionItem(ADMIN_HOME_LAST_ENTRY_SESSION_KEY, norm);
}

export function readAdminHomeLastEntry(): string | null {
  const raw = readAdminHomeSessionItem(ADMIN_HOME_LAST_ENTRY_SESSION_KEY);
  if (!raw) return null;
  const norm = normalizeAdminPath(raw);
  return norm && norm !== "/admin" ? norm : null;
}

function writeAdminHomeHighlightTarget(target: AdminHomeHighlightTarget): void {
  writeAdminHomeSessionItem(ADMIN_HOME_HIGHLIGHT_TARGET_SESSION_KEY, JSON.stringify(target));
}

function normalizeStoredHighlightTarget(
  parsed: Partial<AdminHomeHighlightTarget>,
): AdminHomeHighlightTarget | null {
  const path = normalizeAdminPath(parsed.path ?? "");
  if (!path || path === "/admin" || !parsed.source) return null;
  const source = parsed.source;
  const groupTitle = parsed.groupTitle?.trim() || undefined;
  if (source === "group" && !groupTitle) return null;
  const entryKey =
    parsed.entryKey?.trim()
    || buildAdminHomeEntryKey(source, path, groupTitle);
  return { path, source, ...(groupTitle ? { groupTitle } : {}), entryKey };
}

function readAdminHomeHighlightTarget(): AdminHomeHighlightTarget | null {
  const raw = readAdminHomeSessionItem(ADMIN_HOME_HIGHLIGHT_TARGET_SESSION_KEY);
  if (raw) {
    try {
      return normalizeStoredHighlightTarget(JSON.parse(raw) as Partial<AdminHomeHighlightTarget>);
    } catch {
      /* fall through */
    }
  }
  return null;
}

function clearAdminHomeHighlightTarget(): void {
  removeAdminHomeSessionItem(ADMIN_HOME_HIGHLIGHT_TARGET_SESSION_KEY);
}

/** 从工作台点击入口离开时标记，返回工作台时触发高亮 */
export function markAdminHomeHighlightPending(
  path: string,
  opts?: { source?: AdminHomeEntrySource; groupTitle?: string },
): void {
  const norm = normalizeAdminPath(path);
  if (!norm || norm === "/admin") return;
  const source = opts?.source ?? "sidebar";
  const groupTitle = opts?.groupTitle?.trim() || undefined;
  const target: AdminHomeHighlightTarget = {
    path: norm,
    source,
    ...(groupTitle ? { groupTitle } : {}),
    entryKey: buildAdminHomeEntryKey(source, norm, groupTitle),
  };
  writeAdminHomeLastEntry(norm);
  writeAdminHomeHighlightTarget(target);
  writeAdminHomeSessionItem(ADMIN_HOME_HIGHLIGHT_PENDING_SESSION_KEY, "1");
  saveAdminHomeScrollPosition();
}

/** 返回工作台导航 state：携带最后点击入口分区信息供高亮（不滚动） */
export function buildAdminHomeReturnState(): AdminHomeReturnState | undefined {
  const target = readAdminHomeHighlightTarget();
  const pendingScroll = hasPendingAdminHomeScrollRestore();
  if (!target && !pendingScroll) return undefined;
  return {
    ...(target ? { highlightEntry: target.path, highlightTarget: target } : {}),
    ...(pendingScroll ? { skipAdminHomeEnterAnimation: true } : {}),
  };
}

/** 导航至 returnTo；目标为工作台时附带 highlightEntry，滚动位置由 session 恢复 */
export function navigateAdminReturnTo(navigate: NavigateFunction, returnToRaw: string): void {
  const returnTo = sanitizeStaffNavReturnTo(returnToRaw);
  if (!returnTo) {
    void navigate(toAdminRoutePath("/admin"), { state: buildAdminHomeReturnState() });
    return;
  }
  if (isAdminHomeLocation(returnTo)) {
    void navigate(returnTo, { state: buildAdminHomeReturnState() });
    return;
  }
  void navigate(returnTo);
}

/** 读取并清除待高亮标记，返回最后点击的入口分区信息 */
export function consumeAdminHomeHighlightPending(): AdminHomeHighlightTarget | null {
  const pending = readAdminHomeSessionItem(ADMIN_HOME_HIGHLIGHT_PENDING_SESSION_KEY);
  if (pending !== "1") return null;
  removeAdminHomeSessionItem(ADMIN_HOME_HIGHLIGHT_PENDING_SESSION_KEY);
  const target = readAdminHomeHighlightTarget();
  clearAdminHomeHighlightTarget();
  return target;
}

export function clearAdminHomeHighlightPending(): void {
  removeAdminHomeSessionItem(ADMIN_HOME_HIGHLIGHT_PENDING_SESSION_KEY);
  clearAdminHomeHighlightTarget();
}

export type TelemetryNavMeta = {
  telemetry: true;
  telemetryReturnStorageKey: string;
};

/** 从注册表查找全屏 telemetry 入口的 returnTo key（与 AdminLayout 侧栏 NavLink 一致） */
export function lookupTelemetryNavMeta(path: string): TelemetryNavMeta | null {
  const norm = normalizeAdminPath(path);
  for (const g of ADMIN_NAV_REGISTRY) {
    for (const it of collectRegistryGroupItems(g)) {
      if (normalizeAdminPath(it.path) === norm && it.telemetry) {
        return {
          telemetry: true,
          telemetryReturnStorageKey: it.telemetryReturnStorageKey ?? ANIMAL_ROOM_TELEMETRY_RETURN_TO_KEY,
        };
      }
    }
  }
  return null;
}

/** 工作台/侧栏等同源：进入 telemetry 全屏页时写入 returnTo + location.state */
export function navigateStaffNavEntry(
  navigate: NavigateFunction,
  targetPath: string,
  currentLocation: Pick<Location, "pathname" | "search">,
  highlightFrom?: Pick<AdminHomeHighlightTarget, "source" | "groupTitle">,
): void {
  const dest = toAdminRoutePath(targetPath);
  const meta = lookupTelemetryNavMeta(targetPath);
  const returnTo = `${currentLocation.pathname}${currentLocation.search}`;
  if (isAdminHomeLocation(currentLocation.pathname)) {
    markAdminHomeHighlightPending(targetPath, highlightFrom);
  }
  if (meta) {
    try {
      sessionStorage.setItem(meta.telemetryReturnStorageKey, returnTo);
    } catch {
      /* ignore */
    }
    void navigate(dest, { state: { returnTo } });
  } else if (isAdminHomeLocation(currentLocation.pathname)) {
    void navigate(dest, { state: { returnTo } });
  } else {
    void navigate(dest);
  }
}

/** 规范化 returnTo（含 query），与 AdminLayout 顶栏返回一致 */
export function sanitizeStaffNavReturnTo(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return null;
  const qIdx = t.indexOf("?");
  const pathOnly = qIdx >= 0 ? t.slice(0, qIdx) : t;
  const query = qIdx >= 0 ? t.slice(qIdx) : "";
  return toAdminRoutePath(normalizeAdminPath(pathOnly)) + query;
}

/** 读取全屏 Twin 页的 returnTo（location.state 优先，其次 sessionStorage） */
export function readTwinFullscreenReturnTo(
  location: Pick<Location, "state" | "key">,
  storageKey: string,
): string | null {
  const fromState = sanitizeStaffNavReturnTo(
    (location.state as { returnTo?: string } | null)?.returnTo,
  );
  if (fromState) return fromState;
  try {
    return sanitizeStaffNavReturnTo(sessionStorage.getItem(storageKey));
  } catch {
    return null;
  }
}

/**
 * 全屏 Twin 页返回：优先 returnTo，其次 history -1，最后才回工作台。
 * 不用 replace，避免卸载 AdminLayout 后像整页刷新一样丢失滚动与列表态。
 */
export function navigateTwinFullscreenReturn(
  navigate: NavigateFunction,
  opts: { returnToPath: string | null; storageKey: string },
): void {
  const { returnToPath, storageKey } = opts;
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
  if (returnToPath) {
    navigateAdminReturnTo(navigate, returnToPath);
    return;
  }
  if (typeof window !== "undefined" && window.history.length > 1) {
    void navigate(-1);
    return;
  }
  void navigate(toAdminRoutePath("/admin"), { state: buildAdminHomeReturnState() });
}

/** 三全屏页共用：returnTo 读取 + 返回 handler */
export function useTwinFullscreenReturn(storageKey: string) {
  const navigate = useNavigate();
  const location = useLocation();
  const returnToPath = useMemo(
    () => readTwinFullscreenReturnTo(location, storageKey),
    [location.state, location.key, storageKey],
  );
  const handleReturn = useCallback(() => {
    navigateTwinFullscreenReturn(navigate, { returnToPath, storageKey });
  }, [navigate, returnToPath, storageKey]);
  return { returnToPath, handleReturn };
}

export function readAdminSidebarOpenGroupsSession(): Record<string, boolean> {
  try {
    const raw = sessionStorage.getItem(ADMIN_SIDEBAR_OPEN_GROUPS_SESSION_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === "boolean") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}
