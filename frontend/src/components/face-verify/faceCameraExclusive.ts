import { FACE_CAMERA_IDLE_CHECK_MS, FACE_CAMERA_IDLE_RELEASE_MS } from './faceConfig';

/** 全局摄像头占用：同一时刻只允许一个组件持有 getUserMedia 流 */
export type FaceCameraOwner = 'gate' | 'personal' | 'pip' | 'enrollment';

let activeOwner: FaceCameraOwner | null = null;
let lastActivityAt = 0;
let idleCheckTimer: ReturnType<typeof setInterval> | null = null;

/** 各 owner 注册的本地 stop 回调（用于空闲强杀 / 兜底回收） */
const releaseHandlers = new Map<FaceCameraOwner, () => void>();

function touchActivity(): void {
  lastActivityAt = Date.now();
}

function ensureIdleWatchdog(): void {
  if (idleCheckTimer) return;
  idleCheckTimer = setInterval(() => {
    if (activeOwner === null) return;
    if (Date.now() - lastActivityAt < FACE_CAMERA_IDLE_RELEASE_MS) return;
    console.warn(
      `[face-camera] 空闲 ${FACE_CAMERA_IDLE_RELEASE_MS}ms 无活动，强制回收 owner=${activeOwner}`,
    );
    forceReleaseAllFaceCameras();
  }, FACE_CAMERA_IDLE_CHECK_MS);
}

function stopIdleWatchdog(): void {
  if (!idleCheckTimer) return;
  clearInterval(idleCheckTimer);
  idleCheckTimer = null;
}

export function claimFaceCamera(owner: FaceCameraOwner): boolean {
  if (activeOwner === null || activeOwner === owner) {
    activeOwner = owner;
    touchActivity();
    ensureIdleWatchdog();
    return true;
  }
  return false;
}

export function releaseFaceCamera(owner: FaceCameraOwner): void {
  if (activeOwner !== owner) return;
  activeOwner = null;
  stopIdleWatchdog();
}

export function isFaceCameraBusy(owner?: FaceCameraOwner): boolean {
  return activeOwner !== null && activeOwner !== owner;
}

/** 检测循环 / 流就绪时调用，刷新空闲计时 */
export function touchFaceCameraActivity(owner?: FaceCameraOwner): void {
  if (owner && activeOwner !== null && activeOwner !== owner) return;
  touchActivity();
}

/** 组件挂载摄像头后注册本地 stop，便于全局兜底回收 */
export function registerFaceCameraReleaseHandler(owner: FaceCameraOwner, handler: () => void): void {
  releaseHandlers.set(owner, handler);
}

export function unregisterFaceCameraReleaseHandler(owner: FaceCameraOwner): void {
  releaseHandlers.delete(owner);
}

/** 强制回收所有摄像头（关弹窗 / 中止会话 / 空闲超时） */
export function forceReleaseAllFaceCameras(): void {
  releaseHandlers.forEach((handler) => {
    try {
      handler();
    } catch (e) {
      console.warn('[face-camera] release handler error', e);
    }
  });
  releaseHandlers.clear();
  activeOwner = null;
  stopIdleWatchdog();
}

export function getActiveFaceCameraOwner(): FaceCameraOwner | null {
  return activeOwner;
}
