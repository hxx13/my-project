import { useEffect, useRef, useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { createPortal } from 'react-dom';
import { Eye, X, ArrowLeft, ArrowRight } from 'lucide-react';
import { Z_INDEX } from '@/constants/zIndex';
import { COMPACT_FACE_WINDOW, FACE_CAMERA_MIRROR_CLASS } from './faceConfig';
import type { BlinkPhase } from './useFaceVerification';
import type { FaceChallengeAction } from './faceChallenge';
import { getChallengeTitle, getGateChallengeHint, getGateFrontalHint, isTurnChallengeAction } from './faceChallenge';
import { useFaceAuthConfig } from './useFaceAuthConfig';
import { claimFaceCamera, releaseFaceCamera, registerFaceCameraReleaseHandler, touchFaceCameraActivity, unregisterFaceCameraReleaseHandler } from './faceCameraExclusive';
import type { FaceCameraOwner } from './faceCameraExclusive';
import { CameraAccessError, formatCameraAccessMessage, requestCameraStream, resolveCameraHttpsExtraPort, suggestSecureCameraUrl } from '@/utils/cameraAccess';

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  open: boolean;
  cameraWarm?: boolean;
  blinkPhase?: BlinkPhase;
  serverVerifying?: boolean;
  challengeAction?: FaceChallengeAction;
  onStreamReady?: () => void;
  onStreamError?: (message: string) => void;
  onClose?: () => void;
  compact?: boolean;
  embedded?: boolean;
  cameraOwner?: FaceCameraOwner;
}

const HIDDEN_VIDEO_CLASS =
  'pointer-events-none fixed h-px w-px overflow-hidden opacity-0';

function challengeIcon(action: FaceChallengeAction, compact: boolean) {
  const cls = compact ? 'h-4 w-4 text-white' : 'h-8 w-8 text-white';
  switch (action) {
    case 'blink':
      return <Eye className={cls} />;
    case 'turnLeft':
      return <ArrowLeft className={`${cls} text-[var(--app-color-accent)]`} />;
    case 'turnRight':
      return <ArrowRight className={`${cls} text-[var(--app-color-accent)]`} />;
  }
}

function FaceCameraContent({
  videoRef,
  blinkPhase,
  serverVerifying = false,
  challengeAction = 'blink',
  cameraError = null,
  secureCameraUrl = null,
  onClose,
  compact,
  embedded,
  inPortalShell,
}: Pick<Props, 'videoRef' | 'blinkPhase' | 'serverVerifying' | 'challengeAction' | 'onClose' | 'compact' | 'embedded'> & {
  cameraError?: string | null;
  secureCameraUrl?: string | null;
  inPortalShell?: boolean;
}) {
  const { liveness } = useFaceAuthConfig();
  const isCompact = compact === true;
  const awaiting = !serverVerifying && (blinkPhase === 'awaiting-challenge' || blinkPhase === 'detecting-face');
  const awaitingFrontal = !serverVerifying && blinkPhase === 'awaiting-frontal';

  const shellClass = inPortalShell
    ? 'relative h-full w-full'
    : embedded
      ? 'relative shrink-0'
      : 'fixed pointer-events-auto';

  const chromeClass = inPortalShell
    ? ''
    : 'rounded-[var(--app-radius-container)] border-2 border-[var(--app-color-accent)] bg-black shadow-[var(--app-elevation-modal)]';

  return (
    <div
      className={`overflow-hidden ${shellClass} ${chromeClass}`}
      style={embedded && isCompact ? {
        width: COMPACT_FACE_WINDOW.width,
        height: COMPACT_FACE_WINDOW.height,
      } : undefined}
    >
      {onClose && (
        <button
          onClick={onClose}
          className={`absolute z-10 flex items-center justify-center rounded-full bg-black/60 text-white/80 transition-colors hover:bg-black/80 hover:text-white
            ${isCompact ? 'top-1 right-1 h-5 w-5' : 'top-2 right-2 h-7 w-7'}`}
          title="关闭人脸验证"
        >
          <X className={isCompact ? 'h-3 w-3' : 'h-4 w-4'} />
        </button>
      )}
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 4 }}
        transition={{ type: 'spring', stiffness: 380, damping: 28 }}
        className="h-full w-full"
      >
        <video
          ref={videoRef as React.RefObject<HTMLVideoElement>}
          className={`h-full w-full object-cover ${FACE_CAMERA_MIRROR_CLASS}`}
          muted
          playsInline
          autoPlay
        />
        {cameraError && (
          <div
            className={`absolute inset-0 z-40 flex flex-col items-center justify-center bg-[color-mix(in_srgb,black_78%,transparent)] px-3 text-center
              ${isCompact ? 'gap-1' : 'gap-2'}`}
          >
            <span className={`font-bold text-[var(--app-color-feedback-warning)] ${isCompact ? 'text-[9px]' : 'text-sm'}`}>
              无法打开摄像头
            </span>
            <span className={`leading-relaxed text-white/90 ${isCompact ? 'text-[8px]' : 'text-xs'}`}>
              {cameraError}
            </span>
            {secureCameraUrl && !isCompact && (
                <a
                  href={secureCameraUrl}
                  className="mt-1 text-xs font-semibold text-[var(--app-color-accent)] underline underline-offset-2"
                >
                  改用 HTTPS 打开
                </a>
              )}
          </div>
        )}
        {serverVerifying && (
          <div
            className={`absolute inset-0 z-30 flex flex-col items-center justify-center bg-[color-mix(in_srgb,black_62%,transparent)] px-3 text-center
              ${isCompact ? 'gap-1' : 'gap-2'}`}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
              className={`rounded-full border-2 border-white/30 border-t-white ${isCompact ? 'h-5 w-5' : 'h-8 w-8'}`}
            />
            <span className={`font-bold text-white ${isCompact ? 'text-[9px]' : 'text-sm'}`}>验证中</span>
            <span className={`leading-tight text-white/80 ${isCompact ? 'text-[8px]' : 'text-xs'}`}>
              后台多帧比对确认中，请保持正脸勿动
            </span>
          </div>
        )}
        {blinkPhase && !serverVerifying && (
          <div
            className={`absolute bottom-0 left-0 right-0 z-20 flex flex-col items-center bg-gradient-to-t from-black/70 via-black/40 to-transparent
              ${isCompact ? 'gap-0.5 p-1.5 pt-4' : 'gap-2 p-4 pt-8'}`}
          >
            <motion.div animate={{ scale: [1, 1.15, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}>
              {challengeIcon(challengeAction, isCompact)}
            </motion.div>
            <span className={`font-bold tracking-wider text-white ${isCompact ? 'text-[9px]' : 'text-sm'}`}>
              {awaitingFrontal
                ? '请回正面对镜头'
                : awaiting
                  ? getChallengeTitle(challengeAction)
                  : '请保持自然表情'}
            </span>
            {awaiting && (
              <span className={`text-center leading-tight text-white/75 ${isCompact ? 'text-[8px]' : 'text-xs'}`}>
                {getGateChallengeHint(challengeAction, isCompact, liveness.verifyTurnHoldMs)}
              </span>
            )}
            {awaitingFrontal && (
              <span className={`text-center leading-tight text-white/75 ${isCompact ? 'text-[8px]' : 'text-xs'}`}>
                {getGateFrontalHint(isCompact)}
              </span>
            )}
            {!isCompact && !awaitingFrontal && (blinkPhase === 'challenge-confirmed' || blinkPhase === 'matching' || blinkPhase === 'detecting-face') && (
              <span className="text-xs text-white/60">
                {blinkPhase === 'challenge-confirmed' || blinkPhase === 'matching'
                  ? '正在识别，请保持自然表情'
                  : '请将面部对准镜头'}
              </span>
            )}
          </div>
        )}
        <AnimatePresence>
          {blinkPhase === 'challenge-confirmed' && !isTurnChallengeAction(challengeAction) && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-0 z-10 flex items-start justify-center bg-black/25 pt-6"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                className={`flex items-center justify-center rounded-full bg-[var(--app-color-feedback-success)] ${isCompact ? 'h-8 w-8' : 'h-12 w-12'}`}
              >
                <svg
                  className={`text-[var(--app-color-text-inverse)] ${isCompact ? 'h-4 w-4' : 'h-6 w-6'}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={3}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function HiddenCameraVideo({ videoRef }: { videoRef: React.RefObject<HTMLVideoElement | null> }) {
  return (
    <video
      ref={videoRef as React.RefObject<HTMLVideoElement>}
      className={HIDDEN_VIDEO_CLASS}
      style={{ zIndex: -1, left: 0, top: 0 }}
      muted
      playsInline
      autoPlay
      aria-hidden
    />
  );
}

export function FaceCameraWindow({
  videoRef,
  open,
  cameraWarm = false,
  blinkPhase,
  serverVerifying,
  challengeAction,
  onStreamReady,
  onStreamError,
  onClose,
  compact,
  embedded,
  cameraOwner = 'gate',
}: Props) {
  const streamRef = useRef<MediaStream | null>(null);
  const streamReadyNotifiedRef = useRef(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [secureCameraUrl, setSecureCameraUrl] = useState<string | null>(null);
  const cameraActive = cameraWarm || open;

  const attachStream = useCallback(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    const streamChanged = video.srcObject !== stream;
    if (streamChanged) {
      streamReadyNotifiedRef.current = false;
      video.srcObject = stream;
    }
    if (video.srcObject === stream) {
      video.onloadedmetadata = () => {
        void video.play().catch(() => {});
        if (!streamReadyNotifiedRef.current) {
          streamReadyNotifiedRef.current = true;
          touchFaceCameraActivity(cameraOwner);
          onStreamReady?.();
        }
      };
      if (video.readyState >= 1) {
        void video.play().catch(() => {});
        if (!streamReadyNotifiedRef.current && video.videoWidth > 0) {
          streamReadyNotifiedRef.current = true;
          onStreamReady?.();
        }
      }
    }
  }, [videoRef, onStreamReady, cameraOwner]);

  const startCamera = useCallback(async () => {
    if (streamRef.current) {
      attachStream();
      return;
    }
    if (!claimFaceCamera(cameraOwner)) {
      const busyMsg = '摄像头被其他功能占用，请稍后重试';
      setCameraError(busyMsg);
      onStreamError?.(busyMsg);
      return;
    }
    try {
      setCameraError(null);
      const stream = await requestCameraStream({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      attachStream();
    } catch (err) {
      releaseFaceCamera(cameraOwner);
      const msg = err instanceof CameraAccessError
        ? err.message
        : formatCameraAccessMessage('unknown');
      setCameraError(msg);
      onStreamError?.(msg);
    }
  }, [attachStream, cameraOwner, onStreamError]);

  const stopCamera = useCallback(() => {
    streamReadyNotifiedRef.current = false;
    setCameraError(null);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    releaseFaceCamera(cameraOwner);
  }, [videoRef, cameraOwner]);

  const stopCameraRef = useRef(stopCamera);
  stopCameraRef.current = stopCamera;

  useEffect(() => {
    registerFaceCameraReleaseHandler(cameraOwner, () => stopCameraRef.current());
    return () => unregisterFaceCameraReleaseHandler(cameraOwner);
  }, [cameraOwner]);

  useEffect(() => {
    if (!cameraError) {
      setSecureCameraUrl(null);
      return;
    }
    void resolveCameraHttpsExtraPort().then((port) => {
      setSecureCameraUrl(suggestSecureCameraUrl(port));
    });
  }, [cameraError]);

  useEffect(() => {
    if (cameraActive) void startCamera();
    else stopCamera();
  }, [cameraActive, startCamera, stopCamera]);

  useEffect(() => {
    return () => stopCameraRef.current();
  }, []);

  useEffect(() => {
    if (cameraActive) attachStream();
  }, [cameraActive, open, cameraWarm, attachStream]);

  if (!cameraActive) return null;

  const isCompact = compact === true;

  if (!open) {
    if (embedded) return <HiddenCameraVideo videoRef={videoRef} />;
    return createPortal(<HiddenCameraVideo videoRef={videoRef} />, document.body);
  }

  if (embedded) {
    return (
      <FaceCameraContent
        videoRef={videoRef}
        blinkPhase={blinkPhase}
        serverVerifying={serverVerifying}
        challengeAction={challengeAction}
        cameraError={cameraError}
        secureCameraUrl={secureCameraUrl}
        onClose={onClose}
        compact={compact}
        embedded
      />
    );
  }

  if (isCompact) return null;

  return createPortal(
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="pointer-events-none fixed inset-0"
        style={{ zIndex: Z_INDEX.faceScan - 1, background: 'rgba(0,0,0,0.35)' }}
      />
      <div
        className="pointer-events-auto fixed overflow-hidden rounded-[var(--app-radius-container)] border-2 border-[var(--app-color-accent)] bg-black shadow-[var(--app-elevation-modal)]"
        style={{
          top: 90,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 'min(320px, 80vw)',
          height: 'min(320px, 45vh)',
          zIndex: Z_INDEX.faceScan,
        }}
      >
        <FaceCameraContent
          videoRef={videoRef}
          blinkPhase={blinkPhase}
          serverVerifying={serverVerifying}
          challengeAction={challengeAction}
          cameraError={cameraError}
          onClose={onClose}
          compact={false}
          inPortalShell
        />
      </div>
    </>,
    document.body
  );
}
