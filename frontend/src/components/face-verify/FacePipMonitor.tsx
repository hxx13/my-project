import { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import * as faceapi from 'face-api.js';
import { Minimize2, Maximize2, AlertTriangle } from 'lucide-react';
import { Z_INDEX } from '@/constants/zIndex';
import { FACE_CAMERA_MIRROR_CLASS, PIP_DETECT_INTERVAL } from './faceConfig';
import { waitForModels } from './useFaceModels';
import { logFaceVerifyFailure } from './faceLog';
import { verifyFace } from '@/api/domains/face.api';
import { captureVideoFrame } from './captureVideoFrame';
import {
  claimFaceCamera,
  isFaceCameraBusy,
  releaseFaceCamera,
  registerFaceCameraReleaseHandler,
  touchFaceCameraActivity,
  unregisterFaceCameraReleaseHandler,
} from './faceCameraExclusive';
import { requestCameraStream } from '@/utils/cameraAccess';
import { randomUUID } from '@/utils/randomUUID';

interface Props {
  active: boolean;
  /** 当前会话人员（服务端路线 B 比对） */
  userId: string;
  lostWarningSeconds?: number;
  onTimeout: () => void;
  onFaceBack?: () => void;
  onWrongPerson?: () => void;
}

const DETECT_INTERVAL = PIP_DETECT_INTERVAL;
const LOST_BUFFER_SECONDS = 3;

type PipAlertKind = 'none' | 'wrong_person' | 'no_face';

export function FacePipMonitor({
  active,
  userId,
  lostWarningSeconds = 10,
  onTimeout,
  onFaceBack,
  onWrongPerson,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(false);
  const pipSessionIdRef = useRef(randomUUID());
  const serverBusyRef = useRef(false);

  const [collapsed, setCollapsed] = useState(false);
  const [facePresent, setFacePresent] = useState(true);
  const [pipAlert, setPipAlert] = useState<PipAlertKind>('none');
  const [countdown, setCountdown] = useState<number | null>(null);
  const [lastSim, setLastSim] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lostSinceRef = useRef(0);
  const wrongPersonLoggedRef = useRef(false);

  const startCamera = useCallback(async () => {
    if (isFaceCameraBusy('pip')) {
      return;
    }
    if (!claimFaceCamera('pip')) return;
    try {
      const stream = await requestCameraStream({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await new Promise<void>((resolve) => {
          video.onloadedmetadata = () => resolve();
          if (video.readyState >= 1) resolve();
        });
        try {
          await video.play();
        } catch {
          /* ignore */
        }
      }
    } catch {
      releaseFaceCamera('pip');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    releaseFaceCamera('pip');
  }, []);

  const stopCameraRef = useRef(stopCamera);
  stopCameraRef.current = stopCamera;

  useEffect(() => {
    registerFaceCameraReleaseHandler('pip', () => stopCameraRef.current());
    return () => unregisterFaceCameraReleaseHandler('pip');
  }, []);

  const stopCountdown = useCallback(() => {
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    setCountdown(null);
    setPipAlert('none');
  }, []);

  const startCountdown = useCallback(
    (kind: Exclude<PipAlertKind, 'none'>) => {
      if (countdownRef.current) return;
      setPipAlert(kind);
      let remaining = lostWarningSeconds;
      setCountdown(remaining);
      countdownRef.current = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          countdownRef.current = null;
          setCountdown(null);
          setPipAlert('none');
          logFaceVerifyFailure(kind === 'wrong_person' ? 'pip_wrong_person' : 'pip_timeout', {
            source: 'pip',
            userId,
            similarity: lastSim ?? undefined,
          });
          onTimeout();
          return;
        }
        setCountdown(remaining);
      }, 1000);
    },
    [lostWarningSeconds, onTimeout, userId, lastSim],
  );

  /** 本地仅做人脸在场检测；身份以服务端 source=pip 比对为准（阈值略低于门禁） */
  const detectLoop = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !activeRef.current) {
      if (activeRef.current) detectRef.current = setTimeout(detectLoop, DETECT_INTERVAL);
      return;
    }
    touchFaceCameraActivity('pip');

    let found = false;
    let wrongPerson = false;
    let sim: number | null = null;
    let matchThreshold: number | undefined;

    try {
      const localDet = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions());
      found = !!localDet;

      if (found && userId && !serverBusyRef.current) {
        serverBusyRef.current = true;
        try {
          const frame = await captureVideoFrame(video);
          const result = await verifyFace({
            userId,
            sessionId: pipSessionIdRef.current,
            source: 'pip',
            challengeAction: 'pip_monitor',
            frames: [frame],
          });
          sim = result.similarity;
          setLastSim(sim);
          matchThreshold = result.matchThreshold;
          found = result.probeFaceDetected;
          wrongPerson = found && !result.matched;
        } catch {
          found = false;
        } finally {
          serverBusyRef.current = false;
        }
      }

      const isOk = found && !wrongPerson;

      if (wrongPerson) {
        lostSinceRef.current = 0;
        if (!wrongPersonLoggedRef.current) {
          wrongPersonLoggedRef.current = true;
          logFaceVerifyFailure('pip_wrong_person', {
            source: 'pip',
            userId,
            similarity: sim,
            threshold: matchThreshold,
          });
        }
        if (!countdownRef.current) {
          onWrongPerson?.();
          startCountdown('wrong_person');
        }
      } else if (!found) {
        lostSinceRef.current += DETECT_INTERVAL / 1000;
        if (lostSinceRef.current >= LOST_BUFFER_SECONDS && !countdownRef.current) {
          startCountdown('no_face');
        }
      } else {
        lostSinceRef.current = 0;
        wrongPersonLoggedRef.current = false;
        if (countdownRef.current) {
          stopCountdown();
          onFaceBack?.();
        }
      }
      setFacePresent(isOk);
    } catch {
      /* ignore */
    }

    if (activeRef.current) detectRef.current = setTimeout(detectLoop, DETECT_INTERVAL);
  }, [startCountdown, stopCountdown, onFaceBack, onWrongPerson, userId]);

  useEffect(() => {
    if (active && userId) {
      pipSessionIdRef.current = randomUUID();
      (async () => {
        await waitForModels();
        await startCamera();
        activeRef.current = true;
        lostSinceRef.current = 0;
        wrongPersonLoggedRef.current = false;
        detectRef.current = setTimeout(detectLoop, DETECT_INTERVAL);
      })();
    } else {
      activeRef.current = false;
      if (detectRef.current) clearTimeout(detectRef.current);
      stopCountdown();
      stopCamera();
    }
    return () => {
      activeRef.current = false;
      if (detectRef.current) clearTimeout(detectRef.current);
      stopCountdown();
      stopCamera();
    };
  }, [active, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!active || !userId) return null;

  const alertTitle =
    pipAlert === 'wrong_person' ? '非本人检测' : pipAlert === 'no_face' ? '人脸丢失' : '';
  const alertSubtitle =
    pipAlert === 'wrong_person'
      ? lastSim != null
        ? `相似度 ${(lastSim * 100).toFixed(0)}% · 窗口即将关闭`
        : '窗口即将关闭'
      : '请回到镜头前';

  const pipOverlay = countdown !== null && pipAlert !== 'none' && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[color-mix(in_srgb,black_75%,transparent)] px-2 text-center"
    >
      <AlertTriangle className="mb-1 h-5 w-5 text-[var(--app-color-feedback-warning)]" />
      <span className="text-[10px] font-bold leading-tight text-white">{alertTitle}</span>
      <span className="mb-1 text-[9px] leading-tight text-white/85">{alertSubtitle}</span>
      <span className="text-lg font-bold tabular-nums text-[var(--app-color-feedback-danger)]">{countdown}s</span>
    </motion.div>
  );

  return createPortal(
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed overflow-hidden rounded-lg border-2 bg-black shadow-lg transition-all"
      style={{
        top: 16,
        right: 80,
        zIndex: Z_INDEX.faceScan + 10,
        width: collapsed ? 48 : 140,
        height: collapsed ? 48 : 140,
        borderColor: facePresent ? 'var(--app-color-accent)' : 'var(--app-color-feedback-danger)',
      }}
    >
      <video
        ref={videoRef}
        className={`h-full w-full object-cover ${FACE_CAMERA_MIRROR_CLASS} ${collapsed ? 'absolute inset-0 opacity-0' : ''}`}
        muted
        playsInline
        autoPlay
      />
      {collapsed && (
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-0.5 bg-black/80 text-white"
        >
          {facePresent ? (
            <Maximize2 className="h-5 w-5" />
          ) : (
            <AlertTriangle className="h-5 w-5 animate-pulse text-[var(--app-color-feedback-danger)]" />
          )}
          {countdown !== null && (
            <span className="text-[10px] font-bold tabular-nums text-[var(--app-color-feedback-danger)]">
              {countdown}s
            </span>
          )}
        </button>
      )}
      {!collapsed && (
        <>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            className="absolute top-1 right-1 z-30 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white/80 hover:text-white"
          >
            <Minimize2 className="h-3 w-3" />
          </button>
          <div
            className={`absolute bottom-0 left-0 right-0 h-1 transition-colors ${
              facePresent ? 'bg-[var(--app-color-feedback-success)]' : 'bg-[var(--app-color-feedback-danger)] animate-pulse'
            }`}
          />
          <AnimatePresence>{pipOverlay}</AnimatePresence>
        </>
      )}
    </motion.div>,
    document.body,
  );
}
