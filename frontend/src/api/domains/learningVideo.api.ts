import { adminHttp } from "@/api/core/adminHttp";
import { authHttp } from "@/api/core/authHttp";

export type LearningVideoRow = {
  id: number;
  title: string;
  fileUrl: string;
  fileRecordId?: number | null;
  durationSeconds?: number;
  sizeBytes?: number;
  allowSeek?: number;
  rememberPosition?: number;
  requireFullWatch?: number;
  completeThreshold?: number;
  active?: number;
  sortOrder?: number;
  createdAt?: string | null;
};

export type MyLearningVideo = {
  id: number;
  title: string;
  fileUrl: string;
  durationSeconds: number;
  sizeBytes?: number;
  allowSeek: boolean;
  rememberPosition: boolean;
  requireFullWatch: boolean;
  completeThreshold?: number;
  completed: boolean;
  watchedSeconds: number;
  percent: number;
  /** 打开播放器时应跳到的秒数（记住位置/未看完重来等规则已折算） */
  resumeSeconds: number;
  lastWatchedAt?: string | null;
};

export type LearningVideoProgressResult = {
  videoId: number;
  positionSeconds: number;
  watchedSeconds: number;
  durationSeconds: number;
  completed: boolean;
  resumeSeconds: number;
  percent: number;
};

// ---- 管理端 ----

export async function fetchLearningVideos(): Promise<LearningVideoRow[]> {
  const r = await adminHttp.get("/learning-videos");
  return (r.data?.data ?? []) as LearningVideoRow[];
}

export async function createLearningVideo(body: {
  title: string;
  fileUrl: string;
  fileRecordId?: number;
  sizeBytes?: number;
  durationSeconds?: number;
}): Promise<LearningVideoRow> {
  const r = await adminHttp.post("/learning-videos", body);
  return r.data?.data as LearningVideoRow;
}

export async function updateLearningVideo(
  id: number,
  body: Partial<{
    title: string;
    allowSeek: number;
    rememberPosition: number;
    requireFullWatch: number;
    completeThreshold: number;
    active: number;
    sortOrder: number;
  }>,
): Promise<LearningVideoRow> {
  const r = await adminHttp.put(`/learning-videos/${id}`, body);
  return r.data?.data as LearningVideoRow;
}

export async function deleteLearningVideo(id: number): Promise<void> {
  await adminHttp.delete(`/learning-videos/${id}`);
}

// ---- 学生端 ----

export async function fetchMyLearningVideos(): Promise<MyLearningVideo[]> {
  const r = await authHttp.get("/student/learning-videos");
  if (r.data?.success === false) throw new Error(r.data?.message || "加载视频失败");
  return (r.data?.data ?? []) as MyLearningVideo[];
}

export async function reportLearningVideoProgress(
  videoId: number,
  body: { position: number; watchedDelta: number; duration: number; ended?: boolean },
): Promise<LearningVideoProgressResult> {
  const r = await authHttp.post(`/student/learning-videos/${videoId}/progress`, body);
  if (r.data?.success === false) throw new Error(r.data?.message || "进度上报失败");
  return r.data?.data as LearningVideoProgressResult;
}
