import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import * as faceapi from 'face-api.js';
import { Check, RotateCw, User, Eye, ArrowLeft, ArrowRight, AlertCircle } from 'lucide-react';
import { Z_INDEX } from '@/constants/zIndex';
import {
  FACE_CAMERA_MIRROR_CLASS,
  FACE_MODAL_BACKDROP_CLASS,
  FACE_MODAL_BTN_SECONDARY_CLASS,
  FACE_MODAL_SHELL_CLASS,
} from './faceConfig';
import { waitForModels } from './useFaceModels';
import { useMediaPipeBlink } from './useMediaPipeBlink';
import { useFaceAuthConfig } from './useFaceAuthConfig';
import { compressImage } from '@/utils/compressImage';
import { deleteBaselinePhotoById, fetchBaselinePhoto } from '@/api/domains/face.api';
import {
  ENROLL_MAX_PHOTOS,
  ENROLL_MIN_PHOTOS,
  ENROLL_OPEN_EYE_EAR_MIN,
  ENROLL_FRONTAL_NOSE_OFFSET_MAX,
  FACE_ENROLL_STRICT_CONFIG_KEY,
  FACE_CHALLENGE_TURN_OFFSET,
  FACE_ENROLL_CHALLENGE_TIMEOUT_S,
  ENROLL_AUTO_RETRY_DELAY_MS,
  ENROLL_AUTO_RETRY_MAX,
} from './faceConfig';
import { processEnrollmentFiles } from './enrollQuality';
import { createLivenessMotionGuard } from './livenessMotionGuard';
import {
  type FaceChallengeAction,
  buildEnrollmentSequence,
  getChallengeTitle,
  formatEnrollmentChallengeMessage,
  isPoseChallengeActive,
  measureHeadPose,
} from './faceChallenge';
import {
  claimFaceCamera,
  releaseFaceCamera,
  registerFaceCameraReleaseHandler,
  touchFaceCameraActivity,
  unregisterFaceCameraReleaseHandler,
} from './faceCameraExclusive';
import {
  CameraAccessError,
  formatCameraAccessMessage,
  requestCameraStream,
  resolveCameraHttpsExtraPort,
  suggestSecureCameraUrl,
} from '@/utils/cameraAccess';

// ---- 录入流程：注视 → 眨眼 → 左转头 → 右转头 → 自动采集 ----
type EnrollStep = 'holdStill' | FaceChallengeAction | 'done';

const BLINK_TIMEOUT = 10;
/** 眨眼等待超过此毫秒自动通过（小眼友好） */
const BLINK_ENROLL_FALLBACK_MS = 6_000;
/** 注视阶段静默抓拍间隔（毫秒） */
const HOLD_SILENT_CAPTURE_INTERVAL_MS = 650;
/** 注视阶段最多静默抓拍张数 */
const HOLD_SILENT_CAPTURE_MAX = 2;
/** 眨眼通过后后台连拍张数（不阻塞 UI，仍走正脸质检） */
const POST_BLINK_SILENT_CAPTURE_COUNT = 3;
/** 正脸：鼻尖相对脸中心偏移上限 */
const FRONTAL_NOSE_OFFSET_MAX = ENROLL_FRONTAL_NOSE_OFFSET_MAX;
/** 睁眼：眼裂纵横比下限 */
const OPEN_EYE_EAR_MIN = ENROLL_OPEN_EYE_EAR_MIN;
const MAX_TOTAL_CAPTURES = ENROLL_MAX_PHOTOS + 2;

function isChallengeStep(step: EnrollStep): step is FaceChallengeAction {
  return step !== 'holdStill' && step !== 'done';
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** 眼裂纵横比 EAR，越大越睁眼 */
function eyeAspectRatio(eye: faceapi.Point[]): number {
  if (eye.length < 6) return 0;
  const vertical = dist(eye[1], eye[5]) + dist(eye[2], eye[4]);
  const horizontal = dist(eye[0], eye[3]);
  return horizontal > 0 ? vertical / (2 * horizontal) : 0;
}

function isFrontalOpenFace(det: faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>): boolean {
  const lm = det.landmarks;
  const noseTip = lm.getNose()[3];
  const jawLeft = lm.getJawOutline()[0];
  const jawRight = lm.getJawOutline()[16];
  const faceCenter = (jawLeft.x + jawRight.x) / 2;
  const faceWidth = jawRight.x - jawLeft.x;
  if (faceWidth <= 0) return false;
  const noseOffset = Math.abs((noseTip.x - faceCenter) / faceWidth);
  if (noseOffset > FRONTAL_NOSE_OFFSET_MAX) return false;
  const ear = (eyeAspectRatio(lm.getLeftEye()) + eyeAspectRatio(lm.getRightEye())) / 2;
  return ear >= OPEN_EYE_EAR_MIN;
}

// ---- Props ----
interface Props {
  onCaptured: (imageUrl: string) => void;
  onCancel: () => void;
  uploadFn: (file: File) => Promise<string | { id: number; url: string }>;
  /** 录入目标用户；replaceExisting 时用于先清空旧底库 */
  userId?: string;
  /** 完成后先删旧底库再上传合格照（重新录入场景默认 true） */
  replaceExisting?: boolean;
}

export function FaceEnrollment({ onCaptured, onCancel, uploadFn, userId, replaceExisting = false }: Props) {
  const { isEnabled, liveness, enrollStrict } = useFaceAuthConfig();
  const strictMode = isEnabled(FACE_ENROLL_STRICT_CONFIG_KEY);
  const enrollTurnHoldMs = liveness.enrollTurnHoldMs;
  const requiredMs = Math.max(1, liveness.enrollHoldStillSeconds) * 1000;
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const capturingRef = useRef(false); // 防重入

  const [step, setStep] = useState<EnrollStep>('holdStill');
  const [message, setMessage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);
  const [enrollError, setEnrollError] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [secureCameraUrl, setSecureCameraUrl] = useState<string | null>(null);
  const [autoRetryPending, setAutoRetryPending] = useState(false);

  const autoRetryCountRef = useRef(0);
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const motionGuardRef = useRef(createLivenessMotionGuard());
  const restartEnrollmentRef = useRef<() => void>(() => {});

  const stepRef = useRef<EnrollStep>('holdStill');
  stepRef.current = step;

  const enrollQueueRef = useRef<FaceChallengeAction[]>(buildEnrollmentSequence(liveness));
  const enrollIndexRef = useRef(0);

  // 注视计时
  const faceSeenSince = useRef<number>(0);
  const faceLastSeen = useRef<number>(0);
  const FACE_LOSS_GRACE_MS = 600;

  // 单步动作
  const challengeDeadlineRef = useRef(0);
  const challengeHoldStartRef = useRef(0);
  const blinkPhaseStartedRef = useRef(0);
  const blinkStartRef = useRef<() => void>(() => {});
  const blinkStopRef = useRef<() => void>(() => {});

  const { start: blinkStart, stop: blinkStop } = useMediaPipeBlink(
    videoRef,
    () => {
      if (stepRef.current !== 'blink') return;
      if (!motionGuardRef.current.isBlinkLivenessValid()) {
        blinkStopRef.current();
        blinkStartRef.current();
        setMessage('请保持面部稳定，自然眨眼（勿晃动照片）');
        return;
      }
      completeEnrollChallengeRef.current();
    },
  );
  blinkStartRef.current = blinkStart;
  blinkStopRef.current = blinkStop;

  const attachStream = useCallback(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    void video.play().catch(() => {});
  }, []);

  const startCamera = useCallback(async (): Promise<boolean> => {
    if (!claimFaceCamera('enrollment')) {
      const busyMsg = '摄像头被其他功能占用，请稍后重试';
      setCameraError(busyMsg);
      setMessage(busyMsg);
      return false;
    }
    try {
      setCameraError(null);
      const stream = await requestCameraStream({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      attachStream();
      touchFaceCameraActivity('enrollment');
      return true;
    } catch (e) {
      releaseFaceCamera('enrollment');
      const msg = e instanceof CameraAccessError
        ? e.message
        : formatCameraAccessMessage('unknown');
      setCameraError(msg);
      setMessage(msg);
      return false;
    }
  }, [attachStream]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    releaseFaceCamera('enrollment');
  }, []);

  const stopCameraRef = useRef(stopCamera);
  stopCameraRef.current = stopCamera;

  useEffect(() => {
    registerFaceCameraReleaseHandler('enrollment', () => stopCameraRef.current());
    return () => unregisterFaceCameraReleaseHandler('enrollment');
  }, []);

  const capturePhoto = useCallback((): Promise<File> => {
    return new Promise((resolve, reject) => {
      const video = videoRef.current;
      if (!video || video.videoWidth === 0 || video.videoHeight === 0) return reject(new Error('视频未就绪'));
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas 不可用'));
      // 镜像绘制（与视频 CSS -scale-x-100 保持一致）
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => {
        if (blob) resolve(new File([blob], `enroll-${Date.now()}.jpg`, { type: 'image/jpeg' }));
        else reject(new Error('toBlob 失败'));
      }, 'image/jpeg', 0.92);
    });
  }, []);

  // 暂存捕获的照片文件，全部步骤完成后才上传
  const capturedFilesRef = useRef<File[]>([]);
  const lastSilentCaptureAtRef = useRef(0);
  const holdSilentCaptureCountRef = useRef(0);
  const postBlinkBurstDoneRef = useRef(false);
  const silentCaptureBusyRef = useRef(false);
  /** 用户点取消或组件卸载：禁止继续上传/写库 */
  const cancelledRef = useRef(false);
  /** 串联后台抓拍任务，上传前须 drain，避免连拍未完成只入库 1 张 */
  const pendingCaptureRef = useRef<Promise<void>>(Promise.resolve());
  const detectionLoopRef = useRef<() => void>(() => {});

  const clearAutoRetryTimer = useCallback(() => {
    if (autoRetryTimerRef.current) {
      clearTimeout(autoRetryTimerRef.current);
      autoRetryTimerRef.current = null;
    }
    setAutoRetryPending(false);
  }, []);

  const resetEnrollmentSession = useCallback(() => {
    capturedFilesRef.current = [];
    pendingCaptureRef.current = Promise.resolve();
    enrollQueueRef.current = buildEnrollmentSequence(liveness);
    enrollIndexRef.current = 0;
    faceSeenSince.current = 0;
    faceLastSeen.current = 0;
    holdSilentCaptureCountRef.current = 0;
    postBlinkBurstDoneRef.current = false;
    lastSilentCaptureAtRef.current = 0;
    blinkPhaseStartedRef.current = 0;
    challengeHoldStartRef.current = 0;
    challengeDeadlineRef.current = 0;
    capturingRef.current = false;
    motionGuardRef.current.reset();
    setHoldProgress(0);
    setStep('holdStill');
    setMessage('');
  }, []);

  const restartEnrollment = useCallback(async () => {
    clearAutoRetryTimer();
    setEnrollError(null);
    resetEnrollmentSession();
    if (detectTimerRef.current) {
      clearTimeout(detectTimerRef.current);
      detectTimerRef.current = null;
    }
    blinkStop();
    if (!streamRef.current) {
      const cameraReady = await startCamera();
      if (!cameraReady) return;
    } else {
      attachStream();
    }
    activeRef.current = true;
    detectTimerRef.current = setTimeout(() => detectionLoopRef.current(), 400);
  }, [clearAutoRetryTimer, resetEnrollmentSession, startCamera, attachStream, blinkStop]);

  restartEnrollmentRef.current = () => {
    void restartEnrollment();
  };

  const scheduleEnrollAutoRetry = useCallback((msg: string) => {
    const capturedHint =
      capturedFilesRef.current.length > 0
        ? `（已暂存 ${capturedFilesRef.current.length} 张，需至少 ${ENROLL_MIN_PHOTOS} 张合格正脸）`
        : '';
    setEnrollError(`${msg}${capturedHint}`);
    if (autoRetryCountRef.current >= ENROLL_AUTO_RETRY_MAX) return;
    autoRetryCountRef.current += 1;
    setAutoRetryPending(true);
    clearAutoRetryTimer();
    autoRetryTimerRef.current = setTimeout(() => {
      restartEnrollmentRef.current();
    }, ENROLL_AUTO_RETRY_DELAY_MS);
  }, [clearAutoRetryTimer]);

  const abortEnrollment = useCallback((notifyParent = true) => {
    clearAutoRetryTimer();
    cancelledRef.current = true;
    activeRef.current = false;
    capturingRef.current = false;
    capturedFilesRef.current = [];
    pendingCaptureRef.current = Promise.resolve();
    if (detectTimerRef.current) {
      clearTimeout(detectTimerRef.current);
      detectTimerRef.current = null;
    }
    blinkStop();
    stopCamera();
    setUploading(false);
    if (notifyParent) onCancel();
  }, [blinkStop, clearAutoRetryTimer, onCancel, stopCamera]);

  const enqueueCapture = useCallback((task: () => Promise<void>) => {
    pendingCaptureRef.current = pendingCaptureRef.current.then(task).catch(() => {});
  }, []);

  const drainPendingCaptures = useCallback(async () => {
    await pendingCaptureRef.current;
    for (let i = 0; i < 40; i++) {
      if (!silentCaptureBusyRef.current) break;
      await new Promise((r) => setTimeout(r, 50));
    }
  }, []);

  const appendCapturedFile = useCallback((file: File) => {
    if (capturedFilesRef.current.length >= MAX_TOTAL_CAPTURES) return;
    capturedFilesRef.current.push(file);
  }, []);

  const trySilentFrontalCapture = useCallback(async (): Promise<boolean> => {
    if (cancelledRef.current) return false;
    const video = videoRef.current;
    if (!video || video.readyState < 2 || silentCaptureBusyRef.current) return false;
    if (capturedFilesRef.current.length >= MAX_TOTAL_CAPTURES) return false;
    const now = Date.now();
    if (now - lastSilentCaptureAtRef.current < HOLD_SILENT_CAPTURE_INTERVAL_MS) return false;

    silentCaptureBusyRef.current = true;
    try {
      const det = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();
      if (!det || !isFrontalOpenFace(det)) return false;
      const file = await capturePhoto();
      const compressed = await compressImage(file);
      appendCapturedFile(compressed);
      lastSilentCaptureAtRef.current = now;
      return true;
    } catch {
      return false;
    } finally {
      silentCaptureBusyRef.current = false;
    }
  }, [appendCapturedFile, capturePhoto]);

  /** 眨眼后后台连拍（不做人脸复检、不阻塞步骤切换，质检在上传前统一做） */
  const quickBurstCapture = useCallback(async (count: number) => {
    for (let i = 0; i < count; i++) {
      if (cancelledRef.current) break;
      if (capturedFilesRef.current.length >= MAX_TOTAL_CAPTURES) break;
      await new Promise((r) => setTimeout(r, i === 0 ? 120 : 280));
      if (silentCaptureBusyRef.current) continue;
      silentCaptureBusyRef.current = true;
      try {
        const file = await capturePhoto();
        const compressed = await compressImage(file);
        appendCapturedFile(compressed);
      } catch {
        /* 单张失败继续 */
      } finally {
        silentCaptureBusyRef.current = false;
      }
    }
  }, [appendCapturedFile, capturePhoto]);

  const uploadCapturedFiles = useCallback(async (): Promise<string> => {
    if (cancelledRef.current) {
      throw new Error('已取消录入');
    }
    setMessage('正在完成采集...');
    await drainPendingCaptures();
    if (cancelledRef.current) {
      throw new Error('已取消录入');
    }

    if (capturedFilesRef.current.length === 0) {
      throw new Error('未采集到照片，请对准摄像头后重试');
    }

    let maxUploadCount = ENROLL_MAX_PHOTOS;
    let minPhotos = ENROLL_MIN_PHOTOS;
    const targetUserId = userId?.trim();
    let oldPhotoIds: number[] = [];
    if (targetUserId) {
      try {
        const baseline = await fetchBaselinePhoto(targetUserId);
        if (replaceExisting) {
          oldPhotoIds = (baseline.photos ?? []).map((p) => p.id);
        } else {
          maxUploadCount = Math.max(0, ENROLL_MAX_PHOTOS - baseline.count);
          minPhotos = Math.min(ENROLL_MIN_PHOTOS, maxUploadCount);
          if (maxUploadCount <= 0) {
            throw new Error(`底库已满（${ENROLL_MAX_PHOTOS} 张），请先删除旧照片后再录入`);
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes('底库已满')) throw e;
      }
    }

    setMessage('正在质检照片...');
    const qc = await processEnrollmentFiles(capturedFilesRef.current, {
      strictMode,
      strictThresholds: enrollStrict,
      maxUploadCount,
      minPhotos,
    });
    if (cancelledRef.current) {
      throw new Error('已取消录入');
    }
    if (qc.selected.length === 0) {
      throw new Error(qc.reason || `合格正脸照不足 ${minPhotos} 张，请重新录入`);
    }

    const uploaded: { id: number; url: string }[] = [];
    let lastError = '';
    for (const candidate of qc.selected) {
      if (cancelledRef.current) break;
      try {
        const raw = await uploadFn(candidate.file);
        const row = typeof raw === 'string' ? { id: -1, url: raw } : raw;
        uploaded.push(row);
      } catch (e) {
        lastError = e instanceof Error ? e.message : '上传失败';
        break;
      }
    }

    const rollbackUploaded = async () => {
      if (!targetUserId) return;
      for (const row of uploaded) {
        if (row.id > 0) {
          try {
            await deleteBaselinePhotoById(targetUserId, row.id);
          } catch {
            /* 尽力回滚 */
          }
        }
      }
    };

    if (cancelledRef.current || uploaded.length < qc.selected.length) {
      await rollbackUploaded();
      throw new Error(cancelledRef.current ? '已取消录入' : (lastError || '上传未完成，已回滚本次照片'));
    }

    if (replaceExisting && targetUserId && oldPhotoIds.length > 0) {
      for (const id of oldPhotoIds) {
        if (cancelledRef.current) {
          await rollbackUploaded();
          throw new Error('已取消录入');
        }
        try {
          await deleteBaselinePhotoById(targetUserId, id);
        } catch (e) {
          await rollbackUploaded();
          throw e instanceof Error ? e : new Error('删除旧底库失败');
        }
      }
    }

    return uploaded[uploaded.length - 1].url;
  }, [replaceExisting, strictMode, enrollStrict, uploadFn, userId, drainPendingCaptures]);

  const completeEnrollChallengeRef = useRef<() => void>(() => {});

  const finishEnrollment = useCallback(async () => {
    if (cancelledRef.current) return;
    activeRef.current = false;
    setUploading(true);
    setMessage('正在上传照片...');
    try {
      const lastUrl = await uploadCapturedFiles();
      if (cancelledRef.current) return;
      autoRetryCountRef.current = 0;
      clearAutoRetryTimer();
      setEnrollError(null);
      stopCamera();
      setUploading(false);
      setStep('done');
      onCaptured(lastUrl);
    } catch (e) {
      if (cancelledRef.current) return;
      setUploading(false);
      const msg = e instanceof Error ? e.message : '上传失败，请检查权限或网络';
      if (msg !== '已取消录入') {
        scheduleEnrollAutoRetry(msg);
        activeRef.current = false;
      }
    }
  }, [uploadCapturedFiles, onCaptured, clearAutoRetryTimer, stopCamera, scheduleEnrollAutoRetry]);

  const beginChallengeStep = useCallback((action: FaceChallengeAction) => {
    challengeDeadlineRef.current = Date.now() + FACE_ENROLL_CHALLENGE_TIMEOUT_S * 1000;
    challengeHoldStartRef.current = 0;
    setHoldProgress(0);
    setMessage(formatEnrollmentChallengeMessage(action, enrollTurnHoldMs));
    setStep(action);
    if (action === 'blink') {
      blinkPhaseStartedRef.current = Date.now();
      blinkStart();
    } else {
      blinkStop();
    }
  }, [blinkStart, blinkStop]);

  completeEnrollChallengeRef.current = () => {
    const current = stepRef.current;
    if (!isChallengeStep(current)) return;

    // 眨眼完成：立即切下一步，连拍 fire-and-forget（禁止 await，避免卡在眨眼界面）
    if (current === 'blink') {
      blinkStop();
      if (!postBlinkBurstDoneRef.current) {
        postBlinkBurstDoneRef.current = true;
        enqueueCapture(() => quickBurstCapture(POST_BLINK_SILENT_CAPTURE_COUNT));
      }
    }

    const nextIndex = enrollIndexRef.current + 1;
    enrollIndexRef.current = nextIndex;
    const queue = enrollQueueRef.current;
    if (nextIndex >= queue.length) {
      if (!cancelledRef.current) void finishEnrollment();
      return;
    }
    beginChallengeStep(queue[nextIndex]);
  };

  // 检测循环 — 注视 → 眨眼 → 左转头 → 右转头 → 自动采集
  const detectionLoop = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !activeRef.current) {
      if (activeRef.current) detectTimerRef.current = setTimeout(detectionLoop, 200);
      return;
    }

    touchFaceCameraActivity('enrollment');
    const currentStep = stepRef.current;
    const now = Date.now();

    if (currentStep === 'holdStill') {
      try {
        const det = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions());
        if (det) {
          faceLastSeen.current = now;
          if (faceSeenSince.current === 0) faceSeenSince.current = now;
          const elapsed = now - faceSeenSince.current;
          const progress = Math.min(100, Math.round((elapsed / requiredMs) * 100));
          setHoldProgress(progress);
          setMessage(`请注视摄像头 ${Math.max(0, Math.ceil((requiredMs - elapsed) / 1000))}s`);

          // 注视正脸静默抓拍：入队后台执行，不阻塞检测循环；上传前 drain
          if (
            holdSilentCaptureCountRef.current < HOLD_SILENT_CAPTURE_MAX &&
            elapsed >= 400
          ) {
            enqueueCapture(async () => {
              if (holdSilentCaptureCountRef.current >= HOLD_SILENT_CAPTURE_MAX) return;
              const captured = await trySilentFrontalCapture();
              if (captured) holdSilentCaptureCountRef.current += 1;
            });
          }

          if (elapsed >= requiredMs) {
            const queue = enrollQueueRef.current;
            if (queue.length === 0) {
              if (!cancelledRef.current) void finishEnrollment();
            } else {
              enrollIndexRef.current = 0;
              beginChallengeStep(queue[0]);
            }
            faceSeenSince.current = 0;
          }
        } else if (faceLastSeen.current > 0 && (now - faceLastSeen.current) < FACE_LOSS_GRACE_MS) {
          setMessage(`请注视摄像头 ${Math.max(0, Math.ceil((requiredMs - (now - faceSeenSince.current)) / 1000))}s`);
        } else {
          faceSeenSince.current = 0;
          setHoldProgress(0);
          setMessage('未检测到人脸，请对准摄像头');
        }
      } catch { /* ignore */ }
    }

    if (isChallengeStep(currentStep)) {
      const timedOut = now > challengeDeadlineRef.current;

      if (currentStep === 'blink') {
        const blinkElapsed = now - blinkPhaseStartedRef.current;
        const blinkTimedOut = blinkPhaseStartedRef.current > 0 && blinkElapsed > BLINK_TIMEOUT * 1000;
        const fallback = blinkPhaseStartedRef.current > 0 && blinkElapsed >= BLINK_ENROLL_FALLBACK_MS;
        try {
          const det = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks();
          if (det) {
            motionGuardRef.current.add(det.detection.box, det.landmarks.positions);
          }
        } catch { /* ignore */ }
        if (blinkTimedOut || (fallback && motionGuardRef.current.isBlinkLivenessValid())) {
          completeEnrollChallengeRef.current();
        } else if (fallback) {
          setMessage('请保持面部稳定，自然眨眼（勿晃动照片）');
        }
      } else if (timedOut) {
        completeEnrollChallengeRef.current();
      } else {
        try {
          const det = await faceapi
            .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks();
          if (det) {
            const pose = measureHeadPose(det);
            if (
              pose &&
              isPoseChallengeActive(
                currentStep,
                pose,
                FACE_CHALLENGE_TURN_OFFSET,
              )
            ) {
              if (challengeHoldStartRef.current === 0) challengeHoldStartRef.current = now;
              const holdElapsed = now - challengeHoldStartRef.current;
              setHoldProgress(Math.min(100, Math.round((holdElapsed / enrollTurnHoldMs) * 100)));
              setMessage(
                `${getChallengeTitle(currentStep)}，保持 ${Math.max(0, Math.ceil((enrollTurnHoldMs - holdElapsed) / 1000))} 秒`,
              );
              if (holdElapsed >= enrollTurnHoldMs) {
                completeEnrollChallengeRef.current();
              }
            } else {
              challengeHoldStartRef.current = 0;
              setHoldProgress(0);
              setMessage(formatEnrollmentChallengeMessage(currentStep, enrollTurnHoldMs));
            }
          }
        } catch { /* ignore */ }
      }
    }

    if (activeRef.current) {
      detectTimerRef.current = setTimeout(detectionLoop, 200);
    }
  }, [requiredMs, beginChallengeStep, enqueueCapture, trySilentFrontalCapture, finishEnrollment]);

  detectionLoopRef.current = detectionLoop;

  // 启动（防 StrictMode 双 mount）
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        cancelledRef.current = false;
        autoRetryCountRef.current = 0;
        setEnrollError(null);
        setAutoRetryPending(false);
        setMessage('正在加载识别模型...');
        await waitForModels();
        if (!mounted) return;
        const cameraReady = await startCamera();
        if (!mounted) return;
        if (!cameraReady || !streamRef.current) return;
        enrollQueueRef.current = buildEnrollmentSequence(liveness);
        enrollIndexRef.current = 0;
        faceSeenSince.current = 0;
        holdSilentCaptureCountRef.current = 0;
        postBlinkBurstDoneRef.current = false;
        lastSilentCaptureAtRef.current = 0;
        blinkPhaseStartedRef.current = 0;
        pendingCaptureRef.current = Promise.resolve();
        capturingRef.current = false;
        activeRef.current = true;
        setMessage('');
        detectTimerRef.current = setTimeout(detectionLoop, 500);
      } catch (e) {
        if (!mounted) return;
        setMessage(e instanceof Error ? e.message : '初始化失败');
      }
    })();
    return () => {
      mounted = false;
      clearAutoRetryTimer();
      cancelledRef.current = true;
      activeRef.current = false;
      capturingRef.current = false;
      capturedFilesRef.current = [];
      pendingCaptureRef.current = Promise.resolve();
      if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
      blinkStop();
      stopCamera();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // video 节点挂载后绑定摄像头流
  useEffect(() => {
    attachStream();
  });

  useEffect(() => {
    if (!cameraError) {
      setSecureCameraUrl(null);
      return;
    }
    void resolveCameraHttpsExtraPort().then((port) => {
      setSecureCameraUrl(suggestSecureCameraUrl(port));
    });
  }, [cameraError]);

  const isDone = step === 'done';
  const enrollStepOrder: Array<'holdStill' | FaceChallengeAction> = [
    'holdStill',
    ...buildEnrollmentSequence(liveness),
  ];
  const currentStepIndex = enrollStepOrder.indexOf(step === 'done' ? 'holdStill' : step);

  const renderChallengeIcon = (action: FaceChallengeAction, className: string) => {
    switch (action) {
      case 'blink':
        return <Eye className={`${className} animate-pulse text-white`} />;
      case 'turnLeft':
        return <ArrowLeft className={`${className} animate-pulse text-[var(--app-color-accent)]`} />;
      case 'turnRight':
        return <ArrowRight className={`${className} animate-pulse text-[var(--app-color-accent)]`} />;
    }
  };

  return createPortal(
    <div
      className={`fixed inset-0 flex items-start justify-center pt-5 ${FACE_MODAL_BACKDROP_CLASS}`}
      style={{ zIndex: Z_INDEX.faceEnrollment }}
    >
      {/* 外层负责水平居中，避免 motion transform 冲掉 translateX(-50%) */}
      <div className="w-[min(360px,92vw)] shrink-0">
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: -12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 420, damping: 28 }}
          className={`flex w-full flex-col items-center gap-3 rounded-[var(--app-radius-container)] border border-[var(--app-color-border-default)] p-4 shadow-[var(--app-elevation-modal)] ${FACE_MODAL_SHELL_CLASS}`}
        >
        {/* 标题 + 取消按钮 */}
        <div className="flex w-full items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[var(--app-color-text-primary)]">
            {isDone ? '录入完成' : '人脸照片录入'}
          </h3>
          {!isDone && (
            <button
              type="button"
              disabled={uploading}
              onClick={() => abortEnrollment(true)}
              className={`shrink-0 rounded-[var(--app-radius-element)] border border-[var(--app-color-border-default)] px-3 py-1.5 text-xs font-semibold text-[var(--app-color-text-primary)] transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 ${FACE_MODAL_BTN_SECONDARY_CLASS}`}
            >
              取消
            </button>
          )}
          {isDone && (
            <button
              type="button"
              onClick={() => { stopCamera(); onCancel(); }}
              className="shrink-0 rounded-[var(--app-radius-element)] border border-[var(--app-color-accent)] bg-[var(--app-color-accent)] px-3 py-1.5 text-xs font-semibold text-[var(--app-color-text-inverse)]"
            >
              完成
            </button>
          )}
        </div>

        {/* 视频区（扩大，提示全部居中叠加在画面内） */}
        <div className={`relative h-[360px] w-full overflow-hidden rounded-[var(--app-radius-container)] bg-black
          ${isDone ? 'border-2 border-[var(--app-color-feedback-success)]' : 'border-2 border-[var(--app-color-accent)]'}`}>
          <video ref={videoRef} className={`w-full h-full object-cover ${FACE_CAMERA_MIRROR_CLASS}`} muted playsInline />

          {/* ---- 所有步骤提示都居中叠加在视频画面中心 ---- */}

          {/* 摄像头不可用 */}
          {cameraError && !isDone && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[color-mix(in_srgb,black_78%,transparent)] px-4 text-center">
              <AlertCircle className="mb-3 h-12 w-12 text-[var(--app-color-feedback-warning)]" />
              <span className="mb-1 text-base font-bold text-white">无法打开摄像头</span>
              <span className="mb-3 max-w-[300px] text-xs leading-relaxed text-white/90">{cameraError}</span>
              {secureCameraUrl && (
                  <a
                    href={secureCameraUrl}
                    className="mb-3 text-xs font-semibold text-[var(--app-color-accent)] underline underline-offset-2"
                  >
                    改用 HTTPS 打开
                  </a>
                )}
              <button
                type="button"
                onClick={() => void startCamera()}
                className="rounded-[var(--app-radius-element)] border border-[var(--app-color-accent)] bg-[var(--app-color-accent)] px-4 py-2 text-xs font-semibold text-[var(--app-color-text-inverse)]"
              >
                重试
              </button>
            </div>
          )}

          {/* 注视摄像头 */}
          {step === 'holdStill' && !cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
              <User className="mb-3 h-14 w-14 text-white" />
              <span className="mb-1 text-lg font-bold text-white">请注视摄像头</span>
              <span className="px-4 text-center text-sm text-white/85">{message}</span>
            </div>
          )}

          {isChallengeStep(step) && !cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
              {renderChallengeIcon(step, 'mb-3 h-14 w-14')}
              <span className="mb-1 text-lg font-bold text-white">
                {step === 'blink' ? getChallengeTitle(step) : formatEnrollmentChallengeMessage(step, enrollTurnHoldMs)}
              </span>
              {step !== 'blink' && (
                <span className="px-4 text-center text-sm text-white/80">{message}</span>
              )}
            </div>
          )}

          {/* 录入失败：提示 + 重新录入 */}
          {enrollError && !isDone && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[color-mix(in_srgb,black_72%,transparent)] px-4 text-center">
              <AlertCircle className="mb-3 h-12 w-12 text-[var(--app-color-feedback-warning)]" />
              <span className="mb-1 text-base font-bold text-white">录入未成功</span>
              <span className="mb-3 max-w-[280px] text-xs leading-relaxed text-white/90">{enrollError}</span>
              {autoRetryPending && autoRetryCountRef.current <= ENROLL_AUTO_RETRY_MAX && (
                <span className="mb-3 text-[10px] text-white/70">
                  {ENROLL_AUTO_RETRY_DELAY_MS / 1000}s 后自动重新录入…
                </span>
              )}
              <button
                type="button"
                onClick={() => void restartEnrollment()}
                className="rounded-[var(--app-radius-element)] border border-[var(--app-color-accent)] bg-[var(--app-color-accent)] px-4 py-2 text-xs font-semibold text-[var(--app-color-text-inverse)]"
              >
                重新录入
              </button>
            </div>
          )}

          {/* 完成 ✓ */}
          {isDone && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[color-mix(in_srgb,var(--app-color-feedback-success)_35%,black)]">
              <Check className="mb-3 h-16 w-16 text-[var(--app-color-feedback-success)]" strokeWidth={2} />
              <span className="text-lg font-bold text-white">录入完成</span>
            </div>
          )}

          {/* 底部进度条 */}
          {(step === 'holdStill' || isChallengeStep(step)) && (
            <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/25">
              <div
                className="h-full bg-[var(--app-color-feedback-success)] transition-all duration-200"
                style={{ width: `${holdProgress}%` }}
              />
            </div>
          )}

          {/* 底部步骤小圆点（无单独「抓拍」步骤） */}
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
            {enrollStepOrder.map((key, idx) => {
              const done = isDone || currentStepIndex > idx;
              const active = !isDone && currentStepIndex === idx;
              return (
                <div
                  key={key}
                  className={`h-2 w-2 rounded-full transition-colors ${
                    done ? 'bg-[var(--app-color-feedback-success)]' : active ? 'bg-white' : 'bg-white/35'
                  }`}
                />
              );
            })}
          </div>
        </div>

        {uploading && (
          <p className="flex items-center justify-center gap-2 text-xs text-[var(--app-color-text-secondary)]">
            <RotateCw className="h-3.5 w-3.5 animate-spin" />
            正在上传照片...
          </p>
        )}
        </motion.div>
      </div>
    </div>,
    document.body
  );
}
