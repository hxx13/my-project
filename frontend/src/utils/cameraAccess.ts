/** 浏览器摄像头访问（HTTP 非 localhost 时 getUserMedia 不可用） */

export type CameraAccessFailureReason =
  | 'insecure_context'
  | 'unsupported'
  | 'denied'
  | 'not_found'
  | 'busy'
  | 'unknown';

export class CameraAccessError extends Error {
  readonly reason: CameraAccessFailureReason;

  constructor(reason: CameraAccessFailureReason, message: string) {
    super(message);
    this.name = 'CameraAccessError';
    this.reason = reason;
  }

  static fromUnknown(err: unknown): CameraAccessError {
    if (err instanceof CameraAccessError) return err;
    const dom = err as DOMException | undefined;
    const name = dom?.name ?? '';
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      return new CameraAccessError('denied', formatCameraAccessMessage('denied'));
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      return new CameraAccessError('not_found', formatCameraAccessMessage('not_found'));
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      return new CameraAccessError('busy', formatCameraAccessMessage('busy'));
    }
    if (name === 'SecurityError') {
      return new CameraAccessError('insecure_context', formatCameraAccessMessage('insecure_context'));
    }
    return new CameraAccessError('unknown', formatCameraAccessMessage('unknown', dom?.message));
  }
}

/** 额外 HTTPS 默认端口，与后端 app.server.https-extra.port 一致；实际端口以 runtime-config 为准 */
export const DEFAULT_CAMERA_HTTPS_EXTRA_PORT = 18_443;
/** @deprecated 请用 getCameraHttpsExtraPort / resolveCameraHttpsExtraPort */
export const CAMERA_HTTPS_EXTRA_PORT = DEFAULT_CAMERA_HTTPS_EXTRA_PORT;

let cameraHttpsExtraPort = DEFAULT_CAMERA_HTTPS_EXTRA_PORT;
let cameraHttpsPortPromise: Promise<number> | null = null;

export function setCameraHttpsExtraPort(port: number): void {
  if (Number.isFinite(port) && port > 0) {
    cameraHttpsExtraPort = port;
  }
}

export function getCameraHttpsExtraPort(): number {
  return cameraHttpsExtraPort;
}

/** 从 /api/public/runtime-config 读取实际 HTTPS 端口（启动时若 18443 被占用会换端口） */
export async function resolveCameraHttpsExtraPort(): Promise<number> {
  if (cameraHttpsPortPromise) return cameraHttpsPortPromise;
  cameraHttpsPortPromise = (async () => {
    try {
      const { fetchPublicRuntimeConfig } = await import('@/api/domains/notification.api');
      const cfg = await fetchPublicRuntimeConfig();
      const parsed = parseInt(cfg.cameraHttpsPort ?? '', 10);
      if (parsed > 0) setCameraHttpsExtraPort(parsed);
    } catch {
      /* 使用默认端口 */
    }
    return cameraHttpsExtraPort;
  })();
  return cameraHttpsPortPromise;
}

export function isCameraSecureContext(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext;
}

export function canRequestCameraStream(): boolean {
  return typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices?.getUserMedia === 'function'
    && isCameraSecureContext();
}

/** 非安全上下文时给出可点击的 HTTPS 地址（自签证书需浏览器点「继续访问」） */
export function suggestSecureCameraUrl(httpsPort = getCameraHttpsExtraPort()): string | null {
  if (typeof window === 'undefined' || isCameraSecureContext()) return null;
  const { hostname, pathname, search, hash } = window.location;
  if (!hostname) return null;
  return `https://${hostname}:${httpsPort}${pathname}${search}${hash}`;
}

export function formatCameraAccessMessage(
  reason: CameraAccessFailureReason,
  detail?: string,
): string {
  switch (reason) {
    case 'insecure_context': {
      const httpsUrl = suggestSecureCameraUrl();
      if (httpsUrl) {
        return `当前为 HTTP 访问，浏览器禁止打开摄像头。请改用 HTTPS：${httpsUrl}（首次需信任自签证书）；或在服务器本机使用 http://localhost:8080`;
      }
      return '当前为 HTTP 访问，浏览器禁止打开摄像头。请改用 HTTPS，或在服务器本机使用 http://localhost:8080';
    }
    case 'unsupported':
      return '当前浏览器不支持摄像头访问，请更换 Chrome / Edge 等现代浏览器';
    case 'denied':
      return '摄像头权限被拒绝，请在浏览器地址栏允许摄像头后刷新页面';
    case 'not_found':
      return '未检测到可用摄像头，请确认设备已连接且未被其它程序占用';
    case 'busy':
      return '摄像头被占用或无法读取，请关闭其它使用摄像头的程序后重试';
    default:
      return detail?.trim()
        ? `无法打开摄像头：${detail.trim()}`
        : '无法打开摄像头，请检查浏览器权限与网络访问方式';
  }
}

export function getCameraAccessBlockReason(): CameraAccessFailureReason | null {
  if (typeof navigator === 'undefined') return 'unsupported';
  if (!isCameraSecureContext()) return 'insecure_context';
  if (typeof navigator.mediaDevices?.getUserMedia !== 'function') return 'unsupported';
  return null;
}

const DEFAULT_VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
  audio: false,
};

export async function requestCameraStream(
  constraints: MediaStreamConstraints = DEFAULT_VIDEO_CONSTRAINTS,
): Promise<MediaStream> {
  const block = getCameraAccessBlockReason();
  if (block) {
    throw new CameraAccessError(block, formatCameraAccessMessage(block));
  }
  try {
    return await navigator.mediaDevices.getUserMedia(constraints);
  } catch (err) {
    throw CameraAccessError.fromUnknown(err);
  }
}
