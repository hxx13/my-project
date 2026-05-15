import { adminHttp } from "@/api/core/adminHttp";
import { authHttp } from "@/api/core/authHttp";

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

export type MpAnnouncementAdminView = {
  id: string;
  title: string;
  summary?: string | null;
  bodyHtml?: string | null;
  publishedAtText?: string | null;
  enabled?: number | null;
  sortOrder?: number | null;
  createdBy?: string | null;
};

export type MpAnnouncementUpsertBody = {
  title: string;
  summary?: string | null;
  bodyHtml?: string | null;
  enabled?: number | null;
  sortOrder?: number | null;
};

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

export async function fetchMpAnnouncementsAdmin(): Promise<MpAnnouncementAdminView[]> {
  const res = await adminHttp.get<SpringResult<MpAnnouncementAdminView[]>>("/mp-announcements");
  return unwrap(res, "加载公告失败");
}

export async function fetchMpAnnouncementAdmin(id: string): Promise<MpAnnouncementAdminView> {
  const res = await adminHttp.get<SpringResult<MpAnnouncementAdminView>>(`/mp-announcements/${encodeURIComponent(id)}`);
  return unwrap(res, "加载公告失败");
}

export async function createMpAnnouncement(body: MpAnnouncementUpsertBody): Promise<MpAnnouncementAdminView> {
  const res = await adminHttp.post<SpringResult<MpAnnouncementAdminView>>("/mp-announcements", body);
  return unwrap(res, "创建失败");
}

export async function updateMpAnnouncement(
  id: string,
  body: MpAnnouncementUpsertBody
): Promise<MpAnnouncementAdminView> {
  const res = await adminHttp.put<SpringResult<MpAnnouncementAdminView>>(
    `/mp-announcements/${encodeURIComponent(id)}`,
    body
  );
  return unwrap(res, "保存失败");
}

export async function deleteMpAnnouncement(id: string): Promise<void> {
  const res = await adminHttp.delete<SpringResult<unknown>>(`/mp-announcements/${encodeURIComponent(id)}`);
  const body = res.data;
  if (!body?.success) {
    throw new Error(body?.message || "删除失败");
  }
}

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
  const res = await authHttp.post<SpringResult<{ url: string }>>("/upload", fd);
  const data = unwrap(res, "上传失败");
  const u = data.url;
  if (!u) throw new Error("上传未返回地址");
  if (u.startsWith("http://") || u.startsWith("https://")) return u;
  const origin = window.location.origin;
  return `${origin}${u.startsWith("/") ? u : `/${u}`}`;
}
