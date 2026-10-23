import { authHttp } from "@/api/core/authHttp";

export interface PlaybackSegment {
  /** yyyy-MM-ddTHH:mm:ss（本地时间） */
  start: string;
  end: string;
  seconds: number;
}

export type PlaybackJobStatus = "pending" | "running" | "ready" | "error";

export interface PlaybackChunkJob {
  jobId: string;
  status: PlaybackJobStatus;
  channelCode: string;
  startTime: string;
  seconds: number;
  error?: string;
}

export async function fetchPlaybackSegments(
  channelCode: string,
  date: string
): Promise<PlaybackSegment[]> {
  const res = await authHttp.get<{ data: PlaybackSegment[] }>("/v1/dahua/playback/segments", {
    params: { channelCode, date },
  });
  return res.data.data;
}

export async function startPlaybackChunk(
  channelCode: string,
  startTime: string,
  seconds: number
): Promise<PlaybackChunkJob> {
  const res = await authHttp.post<{ data: PlaybackChunkJob }>("/v1/dahua/playback/chunk", {
    channelCode,
    startTime,
    seconds,
  });
  return res.data.data;
}

export async function fetchPlaybackChunkStatus(jobId: string): Promise<PlaybackChunkJob> {
  const res = await authHttp.get<{ data: PlaybackChunkJob }>(`/v1/dahua/playback/chunk/${jobId}`);
  return res.data.data;
}

export async function fetchPlaybackChunkFile(jobId: string): Promise<Blob> {
  const res = await authHttp.get<Blob>(`/v1/dahua/playback/chunk/${jobId}/file`, {
    responseType: "blob",
  });
  return res.data;
}
