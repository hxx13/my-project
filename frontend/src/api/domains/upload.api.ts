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

/** 视频单文件上限，须与后端 app.upload.video-max-bytes 保持一致 */
export const VIDEO_MAX_MB = 200;
export const VIDEO_ACCEPT = "video/mp4,video/webm,video/quicktime,video/x-m4v,.mp4,.webm,.mov,.m4v";

/** 上传视频（不压缩，原样落盘；与图片共用同一条上传链） */
export async function uploadVideoFile(file: File): Promise<UploadResult> {
  if (file.size > VIDEO_MAX_MB * 1024 * 1024) {
    throw new Error(`视频不能超过 ${VIDEO_MAX_MB}MB`);
  }
  const form = new FormData();
  form.append("file", file);
  // 大文件上传远超默认 20s
  const res = await authHttp.post<Result<UploadResult>>("/upload", form, { timeout: 10 * 60_000 });
  return res.data.data;
}

/** 将 UploadResult 转为 DualImage 组件可用的 source 对象 */
export function toDualSource(r: UploadResult): DualImageSource {
  return { publicUrl: r.publicUrl };
}

/** 查询文件记录 */
export async function fetchFileRecord(recordId: number): Promise<DualImageSource> {
  const res = await authHttp.get<Result<DualImageSource>>(`/upload/records/${recordId}`);
  return res.data.data;
}
