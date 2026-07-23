import axios from 'axios';
import { authStorage } from '@/features/auth/authStorage';
import { attachTokenRefreshInterceptor } from '@/api/core/tokenRefresh';

const faceHttp = axios.create({
  baseURL: '/api/face',
  timeout: 30000,
});

faceHttp.interceptors.request.use((config) => {
  const token = authStorage.getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

attachTokenRefreshInterceptor(faceHttp);

function assertFaceApiSuccess<T>(res: { data?: { success?: boolean; message?: string; data?: T } }, fallback: string): T {
  const body = res.data;
  if (!body?.success) {
    throw new Error(body?.message || fallback);
  }
  return body.data as T;
}

export interface BaselinePhoto {
  id: number;
  url: string;
}

export interface BaselineData {
  urls: string[];
  url: string | null;
  hasBaseline: boolean;
  count: number;
  photos: BaselinePhoto[];
}

/** 获取人员全部底库照片 */
export async function fetchBaselinePhoto(userId: string): Promise<BaselineData> {
  const res = await faceHttp.get(`/baseline/${userId}`);
  try {
    return assertFaceApiSuccess<BaselineData>(res, '获取底库照片失败');
  } catch {
    return { urls: [], url: null, hasBaseline: false, count: 0, photos: [] };
  }
}

/** 上传/更新底库照片；返回 id 便于录入取消时回滚 */
export async function uploadBaselinePhoto(userId: string, file: File): Promise<{ id: number; url: string }> {
  const form = new FormData();
  form.append('userId', userId);
  form.append('file', file);
  const res = await faceHttp.post('/baseline/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  const data = assertFaceApiSuccess<{ id?: number; url?: string }>(res, '上传底库照片失败');
  if (!data?.url) throw new Error('上传成功但未返回照片地址');
  if (data.id == null) throw new Error('上传成功但未返回照片 id');
  return { id: data.id, url: data.url };
}

/** 删除某人的全部底库照片 */
export async function deleteBaselinePhoto(userId: string): Promise<void> {
  const res = await faceHttp.delete(`/baseline/${userId}`);
  assertFaceApiSuccess(res, '删除底库照片失败');
}

/** 删除单张底库照片 */
export async function deleteBaselinePhotoById(userId: string, id: number): Promise<void> {
  const res = await faceHttp.delete(`/baseline/${userId}/${id}`);
  assertFaceApiSuccess(res, '删除底库照片失败');
}

/** 上传调试照片 */
export async function uploadDebugPhoto(file: File, label?: string): Promise<{ id: number; url: string }> {
  const form = new FormData();
  form.append('file', file);
  if (label) form.append('label', label);
  const res = await faceHttp.post('/debug/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data?.data ?? {};
}

/** 列出所有调试照片 */
export async function listDebugPhotos(): Promise<any[]> {
  const res = await faceHttp.get('/debug/photos');
  return res.data?.data ?? [];
}

/** 删除调试照片 */
export async function deleteDebugPhoto(id: number): Promise<void> {
  await faceHttp.delete(`/debug/photos/${id}`);
}

/** 获取人脸识别环境变量阈值（管理端只读） */
export interface FaceEnvThresholdConfig {
  matchThreshold: number;
  rejectThreshold: number;
  matchThresholdGate?: number;
  matchThresholdPersonal?: number;
  matchThresholdPip?: number;
  matchEnvVar: string;
  rejectEnvVar: string;
  modelVersion: string;
  requiresRestart: boolean;
  hotReload?: boolean;
  note?: string;
}

export async function fetchFaceEnvThresholds(): Promise<FaceEnvThresholdConfig> {
  const res = await faceHttp.get('/config/env-thresholds');
  return assertFaceApiSuccess<FaceEnvThresholdConfig>(res, '获取人脸阈值环境配置失败');
}

/** 服务端比对模型是否已加载（路线 B） */
export async function fetchFaceModelStatus(): Promise<{ ready: boolean; modelVersion?: string; initError?: string }> {
  const res = await faceHttp.get('/config/model-status');
  return assertFaceApiSuccess(res, '获取模型状态失败');
}

/** 轮询等待服务端模型就绪（首次启动下载模型时） */
export async function waitForFaceServerModel(maxWaitMs = 120_000): Promise<boolean> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      const st = await fetchFaceModelStatus();
      if (st.ready) return true;
      if (st.initError) return false;
    } catch {
      /* 网络抖动继续等 */
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

/** 活体/录入动作（GET /api/face/config → liveness） */
export interface FaceLivenessConfig {
  verifyBlinkEnabled: boolean;
  verifyTurnEnabled: boolean;
  verifyTurnHoldMs: number;
  enrollBlinkEnabled: boolean;
  enrollTurnLeftEnabled: boolean;
  enrollTurnRightEnabled: boolean;
  enrollTurnHoldMs: number;
  enrollHoldStillSeconds: number;
}

/** 录入严模式阈值（GET /api/face/config → enrollStrict） */
export interface FaceEnrollStrictThresholds {
  pairMinSim: number;
  minCountAbovePair: number;
  maxPairSim: number;
  top2AvgMin: number;
}

/** 门禁 Prefetch（GET /api/face/config → verifyPrefetch） */
export interface FaceVerifyPrefetchConfig {
  prefetchEnabled: boolean;
  prefetchIntervalMs: number;
  preLivenessRejectThreshold: number;
}

export interface FaceClientConfig {
  switches: Record<string, boolean>;
  liveness: FaceLivenessConfig;
  enrollStrict: FaceEnrollStrictThresholds;
  verifyPrefetch: FaceVerifyPrefetchConfig;
}

const DEFAULT_FACE_ENROLL_STRICT: FaceEnrollStrictThresholds = {
  pairMinSim: 0.72,
  minCountAbovePair: 2,
  maxPairSim: 0.82,
  top2AvgMin: 0.75,
};

function mergeFaceEnrollStrict(raw?: Partial<FaceEnrollStrictThresholds> | null): FaceEnrollStrictThresholds {
  if (!raw) return { ...DEFAULT_FACE_ENROLL_STRICT };
  return { ...DEFAULT_FACE_ENROLL_STRICT, ...raw };
}

const DEFAULT_FACE_VERIFY_PREFETCH: FaceVerifyPrefetchConfig = {
  prefetchEnabled: true,
  prefetchIntervalMs: 900,
  preLivenessRejectThreshold: 0.55,
};

function mergeFaceVerifyPrefetch(raw?: Partial<FaceVerifyPrefetchConfig> | null): FaceVerifyPrefetchConfig {
  if (!raw) return { ...DEFAULT_FACE_VERIFY_PREFETCH };
  return { ...DEFAULT_FACE_VERIFY_PREFETCH, ...raw };
}

const DEFAULT_FACE_LIVENESS: FaceLivenessConfig = {
  verifyBlinkEnabled: true,
  verifyTurnEnabled: true,
  verifyTurnHoldMs: 800,
  enrollBlinkEnabled: true,
  enrollTurnLeftEnabled: true,
  enrollTurnRightEnabled: true,
  enrollTurnHoldMs: 800,
  enrollHoldStillSeconds: 2,
};

function mergeFaceLiveness(raw?: Partial<FaceLivenessConfig> | null): FaceLivenessConfig {
  if (!raw) return { ...DEFAULT_FACE_LIVENESS };
  return { ...DEFAULT_FACE_LIVENESS, ...raw };
}

/** 获取人脸识别开关 + 活体运行时配置 */
export async function fetchFaceConfig(): Promise<FaceClientConfig> {
  const res = await faceHttp.get('/config');
  const raw = (res.data?.data ?? {}) as Record<string, unknown>;
  const switches: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === 'liveness' || key === 'enrollStrict' || key === 'verifyPrefetch') continue;
    if (typeof value === 'boolean') switches[key] = value;
  }
  const liveness = mergeFaceLiveness(
    raw.liveness && typeof raw.liveness === 'object' ? (raw.liveness as Partial<FaceLivenessConfig>) : null,
  );
  const enrollStrict = mergeFaceEnrollStrict(
    raw.enrollStrict && typeof raw.enrollStrict === 'object'
      ? (raw.enrollStrict as Partial<FaceEnrollStrictThresholds>)
      : null,
  );
  const verifyPrefetch = mergeFaceVerifyPrefetch(
    raw.verifyPrefetch && typeof raw.verifyPrefetch === 'object'
      ? (raw.verifyPrefetch as Partial<FaceVerifyPrefetchConfig>)
      : null,
  );
  return { switches, liveness, enrollStrict, verifyPrefetch };
}

/** 批量保存开关 */
export async function saveFaceConfig(switches: Record<string, boolean>): Promise<void> {
  await faceHttp.put('/config', switches);
}

/** 后端比对两张照片 */
export async function compareFaces(url1: string, url2: string): Promise<{ similarity: number; matched: boolean }> {
  const res = await faceHttp.post('/debug/compare', null, { params: { url1, url2 } });
  return res.data?.data ?? { similarity: 0, matched: false };
}

/** 后端 1:1 人脸验证（路线 B） */
export interface FaceVerifyResult {
  matched: boolean;
  rejected: boolean;
  similarity: number;
  matchThreshold: number;
  rejectThreshold: number;
  modelVersion: string;
  verifyToken?: string | null;
  bestBaselineId?: number | null;
  topSims?: number[];
  baselineCount: number;
  probeFaceDetected: boolean;
}

export async function verifyFace(params: {
  userId: string;
  sessionId?: string;
  challengeAction?: string;
  source?: string;
  frames: Blob[];
}): Promise<FaceVerifyResult> {
  const form = new FormData();
  form.append('userId', params.userId);
  if (params.sessionId) form.append('sessionId', params.sessionId);
  if (params.challengeAction) form.append('challengeAction', params.challengeAction);
  if (params.source) form.append('source', params.source);
  params.frames.forEach((blob, i) => {
    form.append('frames', blob, `frame${i}.jpg`);
  });
  const res = await faceHttp.post('/verify', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 120_000,
  });
  return assertFaceApiSuccess<FaceVerifyResult>(res, '人脸验证失败');
}

/** 将外部 URL 转为后端代理 URL，解决 CORS 问题 */
export function proxyImageUrl(url: string): string {
  if (!url) return url;
  // 同源或相对路径直接返回
  if (url.startsWith('/') || url.startsWith(window.location.origin)) return url;
  // 外部 URL → 走后端代理
  return `/api/face/baseline/proxy-image?url=${encodeURIComponent(url)}`;
}
