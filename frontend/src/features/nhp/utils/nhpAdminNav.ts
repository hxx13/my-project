/**
 * NHP content-manager 导航：携带 returnTo，返回时恢复筛选/选中等 URL 状态。
 * 复用 AUP useGoBack；页内跳转用 nhpNavState / build*Path。
 */
import type { Location } from "react-router-dom";

/** 当前页完整路径（pathname + search），写入 location.state.returnTo */
export function nhpPathOf(location: Pick<Location, "pathname" | "search">): string {
  return `${location.pathname}${location.search || ""}`;
}

/** 跳转子页时注入的 state */
export function nhpNavState(location: Pick<Location, "pathname" | "search">): { returnTo: string } {
  return { returnTo: nhpPathOf(location) };
}

export function buildNhpFieldPagePath(
  dictKey: string,
  opts?: { status?: string | null; fieldCode?: string | null },
): string {
  const p = new URLSearchParams();
  const st = (opts?.status || "").trim().toUpperCase();
  if (st && st !== "ALL") p.set("status", st);
  const fc = (opts?.fieldCode || "").trim();
  if (fc) p.set("fieldCode", fc);
  const q = p.toString();
  return `/nhp-admin/field/${encodeURIComponent(dictKey)}${q ? `?${q}` : ""}`;
}

export function buildNhpCodelistPath(opts?: {
  code?: string | null;
  version?: number | null;
  dictKey?: string | null;
}): string {
  const p = new URLSearchParams();
  const code = (opts?.code || "").trim();
  if (code) p.set("code", code);
  if (opts?.version != null && opts.version > 0) p.set("version", String(opts.version));
  const dictKey = (opts?.dictKey || "").trim();
  if (dictKey) p.set("dictKey", dictKey);
  const q = p.toString();
  return `/nhp-admin/codelist${q ? `?${q}` : ""}`;
}

export function buildNhpTemplatePath(opts?: { formKey?: string | null; dictKey?: string | null }): string {
  const p = new URLSearchParams();
  const formKey = (opts?.formKey || "").trim();
  if (formKey) p.set("formKey", formKey);
  const dictKey = (opts?.dictKey || "").trim();
  if (dictKey) p.set("dictKey", dictKey);
  const q = p.toString();
  return `/nhp-admin/template${q ? `?${q}` : ""}`;
}

function normalizeNhpPath(path: string): string {
  const base = path.split("?")[0].replace(/\/$/, "") || "/";
  return base;
}

/** 校验站内 returnTo；与 currentPath 相同时视为无效，防止自指回环 */
export function sanitizeNhpReturnTo(raw: unknown, currentPath?: string | null): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  if (!t.startsWith("/") || t.startsWith("//")) return null;
  const cur = (currentPath ?? "").trim();
  if (cur && (t === cur || normalizeNhpPath(t) === normalizeNhpPath(cur))) return null;
  return t;
}
