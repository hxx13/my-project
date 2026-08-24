/**
 * NHP 表单实例附件 API（镜像 AUP 附件）。
 */
import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message?: string;
  data: T;
}

export interface NhpAttachment {
  fileId: number;
  fileName?: string;
  mimeType?: string;
  size?: number;
  url?: string;
  uploadedBy?: string;
  createdAt?: string;
}

export interface AttachmentDownload {
  blob: Blob;
  fileName: string;
}

export async function uploadNhpAttachment(recordId: number, file: File, operatorId?: string): Promise<NhpAttachment> {
  const form = new FormData();
  form.append("file", file);
  if (operatorId) form.append("operatorId", operatorId);
  return authHttp
    .post<Result<NhpAttachment>>(`/nhp/records/${recordId}/attachments`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    })
    .then(({ data }) => data.data);
}

export async function fetchNhpAttachments(recordId: number): Promise<NhpAttachment[]> {
  return authHttp
    .get<Result<NhpAttachment[]>>(`/nhp/records/${recordId}/attachments`)
    .then(({ data }) => data.data ?? []);
}

export async function downloadNhpAttachment(fileId: number): Promise<AttachmentDownload> {
  const res = await authHttp.get<Blob>(`/nhp/attachments/${fileId}/download`, { responseType: "blob" });
  const blob = res.data;
  const disposition = (res.headers["content-disposition"] as string) ?? "";
  const match = /filename\*?=(?:UTF-8''|")?([^";]+)/i.exec(disposition);
  const fileName = match ? decodeURIComponent(match[1]) : `attachment-${fileId}`;
  return { blob, fileName };
}

export async function deleteNhpAttachment(recordId: number, fileId: number): Promise<void> {
  await authHttp.delete<Result<void>>(`/nhp/records/${recordId}/attachments/${fileId}`);
}
