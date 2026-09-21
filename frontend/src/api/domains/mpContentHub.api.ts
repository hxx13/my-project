import { authHttp } from "@/api/core/authHttp";
import { resolveApiMediaUrl } from "@/utils/mediaUrl";

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

export type MiniProgramReleaseView = {
  id: string;
  versionCode: string;
  title: string;
  summary?: string | null;
  bodyHtml?: string | null;
  publishedAtText?: string | null;
  showOnLaunch?: number | null;
};

export type MiniProgramReleaseUpsertBody = {
  versionCode: string;
  title: string;
  summary?: string | null;
  bodyHtml?: string | null;
  showOnLaunch?: boolean | null;
};

export async function fetchMpReleases(): Promise<MiniProgramReleaseView[]> {
  const res = await authHttp.get<SpringResult<MiniProgramReleaseView[]>>("/mp/releases");
  return unwrap(res, "加载版本记录失败");
}

export async function createMpRelease(body: MiniProgramReleaseUpsertBody): Promise<MiniProgramReleaseView> {
  const res = await authHttp.post<SpringResult<MiniProgramReleaseView>>("/mp/releases", body);
  return unwrap(res, "创建失败");
}

export async function updateMpRelease(
  id: string,
  body: MiniProgramReleaseUpsertBody
): Promise<MiniProgramReleaseView> {
  const res = await authHttp.put<SpringResult<MiniProgramReleaseView>>(
    `/mp/releases/${encodeURIComponent(id)}`,
    body
  );
  return unwrap(res, "保存失败");
}

export async function deleteMpRelease(id: string): Promise<void> {
  const res = await authHttp.delete<SpringResult<unknown>>(`/mp/releases/${encodeURIComponent(id)}`);
  const body = res.data;
  if (!body?.success) {
    throw new Error(body?.message || "删除失败");
  }
}

export async function uploadRichImage(file: File): Promise<string> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await authHttp.post<SpringResult<{ url: string; publicUrl?: string }>>("/upload", fd);
  const data = unwrap(res, "上传失败");
  const publicUrl = data.publicUrl?.trim();
  if (publicUrl && /^https?:\/\//i.test(publicUrl)) {
    return publicUrl;
  }
  const relative = data.url?.trim();
  if (!relative) throw new Error("上传未返回地址");
  const normalized = relative.startsWith("/") ? relative : `/${relative}`;
  return resolveApiMediaUrl(normalized) ?? normalized;
}
