import { authHttp } from "@/api/core/authHttp";

export type PreviewStreamType = "main" | "sub";

export interface VideoPreviewSession {
  sessionId: string;
  channelCode: string;
  streamType?: PreviewStreamType;
  /** 后端相对路径，形如 /v1/dahua/preview/hls/{sessionId}/index.m3u8 */
  hlsUrl: string;
}

/** 开始一路预览：单画面用主码流，多画面用子码流 */
export async function startVideoPreview(
  channelCode: string,
  streamType: PreviewStreamType = "sub"
): Promise<VideoPreviewSession> {
  const res = await authHttp.post<{ data: VideoPreviewSession }>("/v1/dahua/preview/start", {
    channelCode,
    streamType,
  });
  return res.data.data;
}

export async function stopVideoPreview(sessionId: string): Promise<void> {
  await authHttp.post("/v1/dahua/preview/stop", { sessionId });
}

export interface ActivePreviewSession {
  sessionId: string;
  channelCode: string;
  channelName: string;
  streamType: string;
  ageSeconds: number;
  idleSeconds: number;
}

export interface ActivePreviews {
  max: number;
  sessions: ActivePreviewSession[];
}

/** 当前服务端占用：用于后台页显示「占用 N/4」，占满时一眼能看出来 */
export async function fetchActivePreviews(): Promise<ActivePreviews> {
  const res = await authHttp.get<{ data: ActivePreviews }>("/v1/dahua/preview/active");
  return res.data.data;
}

/** 播放地址补上 /api 前缀（authHttp 的 baseURL 同样是 /api） */
export function previewHlsUrl(hlsUrl: string): string {
  return `/api${hlsUrl.startsWith("/") ? "" : "/"}${hlsUrl}`;
}
