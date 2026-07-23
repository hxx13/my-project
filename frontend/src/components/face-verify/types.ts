export type ScanStatus = 'idle' | 'scanning' | 'success' | 'failed';

export type VerificationResult = 'idle' | 'detecting' | 'matched' | 'mismatched' | 'timeout' | 'maxRetries' | 'noFace';

export interface FaceVerificationOptions {
  /** @deprecated 路线 B 阈值由服务端返回 */
  threshold?: number;
  timeout?: number;
  maxRetries?: number;
  interval?: number;
  userId?: string;
  userName?: string;
  /** 底库张数（服务端比对，前端不再加载 descriptor） */
  baselineCount?: number;
  /** 验证会话 ID，与审计 / verifyToken 绑定 */
  sessionId?: string;
  /** gate | personal | pip */
  source?: string;
  /** 服务端签发 verifyToken 回调 */
  onVerifyToken?: (token: string) => void;
}

export interface FaceVerificationState {
  status: VerificationResult;
  similarity: number | null;
  retryCount: number;
  elapsedSeconds: number;
}

export interface PersonInfo {
  name: string;
  group?: string;
  department?: string;
  avatarUrl?: string;
}

export interface FaceDebugPhoto {
  id: number;
  label: string;
  publicUrl: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}
