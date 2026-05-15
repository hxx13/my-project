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
};

export async function fetchAdminFileTemplates(): Promise<{ rows: AdminFileTemplateRow[]; schemaHint?: string }> {
  const res = await authHttp.get<Result<AdminFileTemplateRow[]>>("/admin/file-templates");
  if (!res.data?.success || !Array.isArray(res.data?.data)) throw new Error(res.data?.message || "读取失败");
  const msg = res.data.message || "";
  const schemaHint = msg && msg !== "操作成功" ? msg : undefined;
  return { rows: res.data.data, schemaHint };
}

export async function uploadAdminFileTemplate(file: File): Promise<AdminFileTemplateRow> {
  const fd = new FormData();
  fd.append("file", file);
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
