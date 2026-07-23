import { authHttp } from "@/api/core/authHttp";
import type { DualImageSource } from "@/utils/mediaUrl";
import { compressImage } from "@/utils/compressImage";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export interface UploadResult {
  url: string;           // 相对路径 /api/upload/files/...
  publicUrl: string;     // 完整公网 URL
  recordId: number;      // upload_file_record.id
}

/** 上传单个图片文件，自动压缩后再上传。返回相对路径、公网 URL 和记录 ID。 */
export async function uploadSingleImage(file: File): Promise<UploadResult> {
  const compressed = await compressImage(file);
  const form = new FormData();
  form.append("file", compressed);
  const res = await authHttp.post<Result<UploadResult>>("/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data.data;
}

/** 将 UploadResult 转为 DualImage 组件可用的 source 对象 */
export function toDualSource(r: UploadResult): DualImageSource {
  return { publicUrl: r.publicUrl };
}

/** 查询文件记录 — 可同时拿到 publicUrl 和 wechatFileId */
export async function fetchFileRecord(recordId: number): Promise<DualImageSource> {
  const res = await authHttp.get<Result<DualImageSource>>(`/upload/records/${recordId}`);
  return res.data.data;
}
