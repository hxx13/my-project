import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export type AdminFileTemplateRow = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedByUserId: string;
  createTime: string;
  folderId?: number | null;
};

export async function fetchAdminFileTemplates(folderId?: number | null): Promise<{ rows: AdminFileTemplateRow[]; schemaHint?: string }> {
  const res = await authHttp.get<Result<AdminFileTemplateRow[]>>("/admin/file-templates", {
    params: folderId == null ? {} : { folderId },
  });
  if (!res.data?.success || !Array.isArray(res.data?.data)) throw new Error(res.data?.message || "读取失败");
  const msg = res.data.message || "";
  const schemaHint = msg && msg !== "操作成功" ? msg : undefined;
  return { rows: res.data.data, schemaHint };
}

/**
 * 上传文件本体。这张表是全站共用的 blob 表，`purpose` 决定它归谁用：
 * 不传 = TEMPLATE（文件模板库），SOP 抽屉传 SOP。
 * 不打标就会串到文件模板库列表里去。
 *
 * `ephemeral` = 一次性文件：不出现在列表里，打完即删（还有超时兜底清理）。
 */
export async function uploadAdminFileTemplate(
  file: File,
  purpose?: "TEMPLATE" | "SOP",
  ephemeral?: boolean,
  folderId?: number | null,
): Promise<AdminFileTemplateRow> {
  const fd = new FormData();
  fd.append("file", file);
  if (purpose) fd.append("purpose", purpose);
  if (ephemeral) fd.append("ephemeral", "true");
  if (folderId != null) fd.append("folderId", String(folderId));
  const res = await authHttp.post<Result<AdminFileTemplateRow>>("/admin/file-templates", fd, {
    timeout: 120000,
  });
  if (!res.data?.success || !res.data?.data) throw new Error(res.data?.message || "上传失败");
  return res.data.data;
}

export async function deleteAdminFileTemplate(id: string): Promise<void> {
  const res = await authHttp.delete<Result<null>>(`/admin/file-templates/${encodeURIComponent(id)}`);
  if (!res.data?.success) throw new Error(res.data?.message || "删除失败");
}

/** 移动文件到文件夹。folderId 传 null = 移回未归类 */
export async function moveAdminFileTemplate(id: string, folderId: number | null): Promise<void> {
  const res = await authHttp.post<Result<null>>(`/admin/file-templates/${encodeURIComponent(id)}/folder`, { folderId });
  if (!res.data?.success) throw new Error(res.data?.message || "移动失败");
}

/** 浏览器下载：须带 Bearer，故用 blob + 对象 URL */
export async function downloadAdminFileTemplateBlob(id: string, fallbackName: string): Promise<{ blob: Blob; fileName: string }> {
  const res = await authHttp.get(`/admin/file-templates/${encodeURIComponent(id)}/download`, {
    responseType: "blob",
    timeout: 120000,
  });
  const cd = res.headers["content-disposition"] || res.headers["Content-Disposition"];
  let fileName = fallbackName;
  if (typeof cd === "string") {
    const m = /filename\*=UTF-8''([^;]+)/i.exec(cd);
    if (m?.[1]) {
      try {
        fileName = decodeURIComponent(m[1].replace(/"/g, "").trim());
      } catch {
        /* keep */
      }
    } else {
      const m2 = /filename="([^"]+)"/i.exec(cd);
      if (m2?.[1]) fileName = m2[1];
    }
  }
  return { blob: res.data as Blob, fileName };
}
