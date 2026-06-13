/** 规范化页面帮助路由键（与后端 PageHelpPathUtil 对齐） */
export function normalizePageHelpPath(pathname: string): string {
  let p = (pathname || "").trim() || "/";
  if (!p.startsWith("/")) p = `/${p}`;
  while (p.length > 1 && p.endsWith("/")) {
    p = p.slice(0, -1);
  }
  return p;
}

export function isPageHelpPathEligible(pathname: string): boolean {
  const p = normalizePageHelpPath(pathname);
  if (p.includes("..")) return false;
  if (p === "/login" || p.startsWith("/student/login")) return false;
  return true;
}
