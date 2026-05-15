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

export type AdminPageHelpBundle = {
  bodyHtml: string | null;
  updatedAt: string | null;
  updatedBy: string | null;
  messages: AdminPageHelpMessage[];
};

export async function fetchAdminPageHelp(path: string): Promise<AdminPageHelpBundle> {
  const res = await adminHttp.get<SpringResult<AdminPageHelpBundle>>("/page-help", {
    params: { path },
  });
  return unwrap(res, "加载帮助失败");
}

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
