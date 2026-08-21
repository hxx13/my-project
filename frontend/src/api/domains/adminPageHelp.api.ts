import { adminHttp } from "@/api/core/adminHttp";

interface SpringResult<T> {
  success: boolean;
  data?: T;
  message?: string;
}

function unwrap<T>(res: { data: SpringResult<T> }, fallback: string): T {
  const body = res.data;
  if (!body?.success) {
    throw new Error(body?.message || fallback);
  }
  if (body.data === undefined) {
    throw new Error(fallback);
  }
  return body.data;
}

export type AdminPageHelpMessage = {
  id: number;
  userId: string;
  body: string;
  createdAt: string | null;
  authorLabel: string | null;
};

export type AdminPageHelpVersion = {
  id: number;
  versionLabel: string;
  versionKind: "update" | "new";
  bodyHtml: string | null;
  createdBy: string | null;
  createdByName?: string | null;
  createdAt: string | null;
};

export type AdminPageHelpBundle = {
  bodyHtml: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  updatedByName?: string | null;
  currentVersion: AdminPageHelpVersion | null;
  versions: AdminPageHelpVersion[];
  messages: AdminPageHelpMessage[];
};

export async function fetchAdminPageHelp(path: string): Promise<AdminPageHelpBundle> {
  const res = await adminHttp.get<SpringResult<AdminPageHelpBundle>>("/page-help", {
    params: { path },
  });
  return unwrap(res, "加载帮助失败");
}

export async function publishPageHelpVersion(
  path: string,
  versionLabel: string,
  versionKind: "update" | "new",
  bodyHtml: string,
): Promise<{ id: number; versionLabel: string; versionKind: string }> {
  const res = await adminHttp.post<SpringResult<{ id: number; versionLabel: string; versionKind: string }>>(
    "/page-help/versions",
    { path, versionLabel, versionKind, bodyHtml },
  );
  return unwrap(res, "发布失败");
}

export async function updatePageHelpVersion(
  path: string,
  id: number,
  versionKind: "update" | "new",
  bodyHtml: string,
): Promise<void> {
  const res = await adminHttp.put<SpringResult<unknown>>("/page-help/versions", {
    path,
    id,
    versionKind,
    bodyHtml,
  });
  const body = res.data;
  if (!body?.success) {
    throw new Error(body?.message || "保存失败");
  }
}

export async function deletePageHelpVersion(path: string, id: number): Promise<void> {
  const res = await adminHttp.delete<SpringResult<unknown>>("/page-help/versions", {
    params: { path, id },
  });
  const body = res.data;
  if (!body?.success) {
    throw new Error(body?.message || "删除失败");
  }
}

/** @deprecated 兼容旧保存，后端会自动递增 patch 版本 */
export async function saveAdminPageHelp(path: string, bodyHtml: string): Promise<void> {
  const res = await adminHttp.put<SpringResult<unknown>>("/page-help", { path, bodyHtml });
  const body = res.data;
  if (!body?.success) {
    throw new Error(body?.message || "保存失败");
  }
}

export async function postAdminPageHelpMessage(path: string, text: string): Promise<{ id: number }> {
  const res = await adminHttp.post<SpringResult<{ id: number }>>("/page-help/messages", { path, body: text });
  return unwrap(res, "发表留言失败");
}

export function suggestNextPageHelpVersion(versions: AdminPageHelpVersion[]): string {
  const latest = versions[0];
  if (!latest?.versionLabel) {
    return "V1.0.0";
  }
  try {
    const num = latest.versionLabel.toUpperCase().replace(/^V/, "");
    const parts = num.split(".");
    const major = Number(parts[0] ?? 1);
    const minor = Number(parts[1] ?? 0);
    const patch = Number(parts[2] ?? 0);
    if (Number.isNaN(major) || Number.isNaN(minor) || Number.isNaN(patch)) {
      return "V1.0.1";
    }
    return `V${major}.${minor}.${patch + 1}`;
  } catch {
    return "V1.0.1";
  }
}

export function pageHelpVersionKindLabel(kind: string | null | undefined): string {
  return kind === "new" ? "新内容" : "更新内容";
}
