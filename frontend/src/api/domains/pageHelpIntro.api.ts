import { authHttp } from "@/api/core/authHttp";

interface SpringResult<T> {
  success?: boolean;
  code?: number;
  data?: T;
  message?: string;
}

export type PageHelpVersion = {
  id: number;
  versionLabel: string;
  versionKind: "update" | "new";
  bodyHtml: string | null;
  createdBy: string | null;
  createdAt: string | null;
};

export type PageHelpIntroBundle = {
  path: string;
  bodyHtml: string | null;
  updatedAt: string | null;
  currentVersion: PageHelpVersion | null;
  introAckVersionLabel: string | null;
  /** 旧版 ack 存 datetime，仅兼容展示 */
  introAckUpdatedAt: string | null;
  shouldShowIntro: boolean;
};

function unwrap<T>(res: { data: SpringResult<T> }, fallback: string): T {
  const body = res.data;
  const ok = body?.success === true || Number(body?.code) === 200;
  if (!ok || body?.data === undefined) {
    throw new Error(body?.message || fallback);
  }
  return body.data;
}

export async function fetchPageHelpIntro(path: string): Promise<PageHelpIntroBundle> {
  const res = await authHttp.get<SpringResult<PageHelpIntroBundle>>("/me/page-help", {
    params: { path },
  });
  return unwrap(res, "加载页面帮助失败");
}

/** 保存后仅合并 introAck，禁止整表 load（post-save-no-full-refresh.mdc） */
export async function ackPageHelpIntro(path: string, versionLabel: string): Promise<void> {
  const res = await authHttp.post<SpringResult<unknown>>("/me/page-help/intro-ack", {
    path,
    versionLabel,
  });
  const body = res.data;
  const ok = body?.success === true || Number(body?.code) === 200;
  if (!ok) {
    throw new Error(body?.message || "保存已知晓状态失败");
  }
}

export function pageHelpVersionKindLabel(kind: string | null | undefined): string {
  return kind === "new" ? "新内容" : "更新内容";
}
