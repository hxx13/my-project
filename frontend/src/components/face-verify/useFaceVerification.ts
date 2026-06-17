import { useState, useRef, useCallback, useEffect } from 'react';
import * as faceapi from 'face-api.js';
import type { VerificationResult } from './types';
import type { FaceVerificationOptions } from './types';
import { waitForModels } from './useFaceModels';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import {
  FACE_VERIFY_TIMEOUT_MS,
  FACE_VERIFY_DETECT_INTERVAL_MS,
  FACE_VERIFY_DETECT_START_DELAY_MS,
  FACE_VERIFY_NO_FACE_TIMEOUT_MS,
  FACE_VERIFY_BELOW_MATCH_FRAMES,
  FACE_VERIFY_MATCH_PHASE_MAX_MS,
  FACE_VERIFY_MATCH_CONSECUTIVE_FRAMES,
  FACE_VERIFY_MAX_RETRIES,
  FACE_GATE_FRONTAL_NOSE_OFFSET_MAX,
  BLINK_LIVENESS_FALLBACK_MS,
  BLINK_CLOSE_THRESHOLD,
  FACE_CHALLENGE_TURN_OFFSET,
  FACE_GATE_POSE_CHALLENGE_TIMEOUT_MS,
} from './faceConfig';
import { logFaceVerifyFailure, logFaceVerifySuccess } from './faceLog';
import type { FaceVerifyLogPayload } from './faceLog';
import { waitForVideoPlayback } from './waitForVideoPlayback';
import { createAdaptiveBlinkDetector } from './blinkDetector';
import { createLivenessMotionGuard } from './livenessMotionGuard';
import { captureVideoFramePair } from './captureVideoFrame';
import { verifyFace, waitForFaceServerModel } from '@/api/domains/face.api';
import {
  type FaceChallengeAction,
  isPoseChallengeActive,
  isTurnChallengeAction,
  isFrontalPose,
  measureHeadPose,
  buildGateChallengeSequence,
} from './faceChallenge';
import { useFaceAuthConfig } from './useFaceAuthConfig';
import {
  DEFAULT_FACE_VERIFY_PREFETCH,
  FACE_VERIFY_PREFETCH_ACTION,
  type FaceVerifyPrefetchConfig,
} from './faceVerifyPrefetchConfig';

const DEFAULT_TIMEOUT = FACE_VERIFY_TIMEOUT_MS;
const DEFAULT_MAX_RETRIES = FACE_VERIFY_MAX_RETRIES;
const DETECT_INTERVAL = FACE_VERIFY_DETECT_INTERVAL_MS;
const DETECT_START_DELAY = FACE_VERIFY_DETECT_START_DELAY_MS;
const NO_FACE_TIMEOUT_MS = FACE_VERIFY_NO_FACE_TIMEOUT_MS;
const BELOW_MATCH_FRAMES = FACE_VERIFY_BELOW_MATCH_FRAMES;
const MATCH_PHASE_MAX_MS = FACE_VERIFY_MATCH_PHASE_MAX_MS;
const MATCH_CONSECUTIVE_FRAMES = FACE_VERIFY_MATCH_CONSECUTIVE_FRAMES;
const GATE_FRONTAL_MAX = FACE_GATE_FRONTAL_NOSE_OFFSET_MAX;
/** 服务端比对最小间隔，避免连续打满 API */
const SERVER_VERIFY_MIN_INTERVAL_MS = 350;

function failVerification(
  activeRef: React.MutableRefObject<boolean>,
  endedRef: React.MutableRefObject<boolean>,
  stopTimer: () => void,
  detectRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  setStatus: (s: VerificationResult) => void,
  reason: 'mismatch' | 'timeout',
  logPayload: FaceVerifyLogPayload,
) {
  if (endedRef.current) return;
  endedRef.current = true;
  activeRef.current = false;
  stopTimer();
  if (detectRef.current) {
    clearTimeout(detectRef.current);
    detectRef.current = null;
  }
  if (reason === 'mismatch') {
    logFaceVerifyFailure('mismatch', logPayload);
    setStatus('mismatched');
  } else {
    logFaceVerifyFailure('timeout', logPayload);
    setStatus('timeout');
  }
}

type ServerVerifyMode = 'prefetch' | 'match';

type FaceDetectionWithLandmarks = faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>;

/** 活体期间是否适合静默 Prefetch（正脸、稳定、非闭眼/转头瞬间） */
function canPrefetchDuringChallenge(
  detection: FaceDetectionWithLandmarks,
  action: FaceChallengeAction,
  lastBlinkScore: number,
  motionValid: boolean,
): boolean {
  const pose = measureHeadPose(detection);
  if (!pose || !isFrontalPose(pose, GATE_FRONTAL_MAX)) return false;
  if (!motionValid) return false;
  if (action === 'blink' && lastBlinkScore > BLINK_CLOSE_THRESHOLD * 0.65) return false;
  if (action !== 'blink' && isPoseChallengeActive(action, pose, FACE_CHALLENGE_TURN_OFFSET)) return false;
  return true;
}

let mpLandmarker: FaceLandmarker | null = null;
let mpInitPromise: Promise<FaceLandmarker> | null = null;
let mpFailed = false;
const MP_INIT_TIMEOUT_MS = 8000;

async function getMpLandmarker(): Promise<FaceLandmarker> {
  if (mpLandmarker) return mpLandmarker;
  if (mpFailed) throw new Error('MediaPipe 初始化已失败，跳过');
  if (mpInitPromise) return mpInitPromise;

  mpInitPromise = (async () => {
    try {
      const vision = await Promise.race([
        FilesetResolver.forVisionTasks('/models/mediapipe'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('MediaPipe WASM 加载超时 (' + MP_INIT_TIMEOUT_MS + 'ms)')), MP_INIT_TIMEOUT_MS),
        ),
      ]) as Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
      try {
        mpLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'GPU' },
          runningMode: 'VIDEO',
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
          numFaces: 1,
        });
      } catch {
        mpLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate: 'CPU' },
          runningMode: 'VIDEO',
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: false,
          numFaces: 1,
        });
      }
      return mpLandmarker;
    } catch (e) {
      mpFailed = true;
      throw e;
    }
  })();

  return mpInitPromise;
}

export type BlinkPhase =
  | 'detecting-face'
  | 'awaiting-challenge'
  | 'challenge-confirmed'
  | 'awaiting-frontal'
  | 'matching';

export function useFaceVerification(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  _baselineUrls: string | string[],
  options?: FaceVerificationOptions,
) {
  const timeoutMs = options?.timeout ?? DEFAULT_TIMEOUT;
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;
  const optionsRef = useRef(options);
  optionsRef.current = options;
  const { liveness, verifyPrefetch } = useFaceAuthConfig();
  const livenessRef = useRef(liveness);
  livenessRef.current = liveness;
  const verifyPrefetchRef = useRef(verifyPrefetch);
  verifyPrefetchRef.current = verifyPrefetch;

  const logContext = useCallback((): FaceVerifyLogPayload => ({
    userId: optionsRef.current?.userId,
    userName: optionsRef.current?.userName,
    baselineCount: optionsRef.current?.baselineCount ?? 0,
  }), []);

  const [status, setStatus] = useState<VerificationResult>('idle');
  const [similarity, setSimilarity] = useState<number | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [blinkPhase, setBlinkPhase] = useState<BlinkPhase>('awaiting-challenge');
  const [serverVerifying, setServerVerifying] = useState(false);
  const [challengeAction, setChallengeAction] = useState<FaceChallengeAction>('blink');

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef = useRef<number>(0);
  const activeRef = useRef(false);
  const challengeConfirmedRef = useRef(false);
  const challengeQueueRef = useRef<FaceChallengeAction[]>([]);
  const challengeStepIndexRef = useRef(0);
  const gateTurnHoldStartRef = useRef(0);
  const challengeActionRef = useRef<FaceChallengeAction>(challengeAction);
  challengeActionRef.current = challengeAction;
  const blinkDetectorRef = useRef(createAdaptiveBlinkDetector());
  const motionGuardRef = useRef(createLivenessMotionGuard());
  const challengeWaitStartedRef = useRef(0);
  const lastBlinkScoreRef = useRef(0);
  const belowMatchFramesRef = useRef(0);
  const aboveMatchFramesRef = useRef(0);
  const matchingStartedAtRef = useRef(0);
  const noFaceSinceRef = useRef(0);
  const endedRef = useRef(false);
  const serverVerifyBusyRef = useRef(false);
  const lastServerVerifyAtRef = useRef(0);
  const serverMatchingPhaseRef = useRef(false);
  const serverThresholdRef = useRef({ match: 0.62, reject: 0.48 });
  const verifyTokenRef = useRef<string | null>(null);
  const prefetchConsecutiveRef = useRef(0);
  const prefetchTransferredRef = useRef(false);
  const pendingVerifyTokenRef = useRef<string | null>(null);
  const lastPrefetchSuccessRef = useRef<{
    similarity: number;
    matchThreshold: number;
    topSims?: number[];
    modelVersion?: string;
    verifyToken?: string | null;
  } | null>(null);

  const resetPrefetchRuntime = useCallback(() => {
    prefetchConsecutiveRef.current = 0;
    prefetchTransferredRef.current = false;
    pendingVerifyTokenRef.current = null;
    lastPrefetchSuccessRef.current = null;
  }, []);

  const resetChallengeRuntime = useCallback((queue: FaceChallengeAction[]) => {
    challengeQueueRef.current = queue;
    challengeStepIndexRef.current = 0;
    const action = queue[0] ?? 'blink';
    setChallengeAction(action);
    challengeActionRef.current = action;
    challengeConfirmedRef.current = queue.length === 0;
    blinkDetectorRef.current.reset();
    motionGuardRef.current.reset();
    gateTurnHoldStartRef.current = 0;
    challengeWaitStartedRef.current = Date.now();
    lastBlinkScoreRef.current = 0;
    if (queue.length === 0) {
      setBlinkPhase('challenge-confirmed');
    } else {
      setBlinkPhase('awaiting-challenge');
    }
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const endServerMatchingPhase = useCallback(() => {
    serverMatchingPhaseRef.current = false;
    setServerVerifying(false);
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    endedRef.current = false;
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      setElapsedSeconds(elapsed);
      if (elapsed >= Math.floor(timeoutMs / 1000)) {
        if (activeRef.current && !endedRef.current) {
          const timeoutCause = challengeConfirmedRef.current ? 'elapsed' : 'challenge_wait';
          failVerification(activeRef, endedRef, stopTimer, detectRef, setStatus, 'timeout', {
            ...logContext(),
            source: optionsRef.current?.source ?? 'gate',
            timeoutCause,
            challengeAction: challengeActionRef.current,
            blinkScore: lastBlinkScoreRef.current,
            blinkBaseline: blinkDetectorRef.current.getBaseline(),
            blinkPhase: blinkDetectorRef.current.getPhase(),
          });
        } else {
          stopTimer();
        }
      }
    }, 1000);
  }, [timeoutMs, logContext, stopTimer]);

  const confirmChallenge = useCallback(() => {
    const queue = challengeQueueRef.current;
    const idx = challengeStepIndexRef.current;
    const action = queue[idx] ?? 'blink';

    if (idx < queue.length - 1) {
      challengeStepIndexRef.current = idx + 1;
      const next = queue[idx + 1];
      setChallengeAction(next);
      challengeActionRef.current = next;
      challengeConfirmedRef.current = false;
      blinkDetectorRef.current.reset();
      motionGuardRef.current.reset();
      gateTurnHoldStartRef.current = 0;
      challengeWaitStartedRef.current = Date.now();
      setBlinkPhase('awaiting-challenge');
      return;
    }

    challengeConfirmedRef.current = true;
    if (isTurnChallengeAction(action)) {
      setBlinkPhase('awaiting-frontal');
    } else {
      setBlinkPhase('challenge-confirmed');
    }
  }, []);

  const completeVerificationSuccess = useCallback((
    action: FaceChallengeAction | typeof FACE_VERIFY_PREFETCH_ACTION,
    result: {
      similarity: number;
      matchThreshold: number;
      verifyToken?: string | null;
      topSims?: number[];
      modelVersion?: string;
    },
    extra?: { prefetchAccelerated?: boolean; consecutiveFrames?: number },
  ) => {
    activeRef.current = false;
    stopTimer();
    if (detectRef.current) {
      clearTimeout(detectRef.current);
      detectRef.current = null;
    }
    endServerMatchingPhase();
    const token = result.verifyToken ?? pendingVerifyTokenRef.current;
    if (token) {
      verifyTokenRef.current = token;
      optionsRef.current?.onVerifyToken?.(token);
    }
    logFaceVerifySuccess({
      ...logContext(),
      similarity: result.similarity,
      threshold: result.matchThreshold,
      source: optionsRef.current?.source ?? 'gate',
      challengeAction: action === FACE_VERIFY_PREFETCH_ACTION ? challengeActionRef.current : action,
      detail: {
        topSims: result.topSims,
        consecutiveFrames: extra?.consecutiveFrames ?? aboveMatchFramesRef.current,
        modelVersion: result.modelVersion,
        verifyToken: token,
        route: 'server',
        prefetchAccelerated: extra?.prefetchAccelerated ?? false,
      },
    });
    setStatus('matched');
  }, [logContext, stopTimer, endServerMatchingPhase]);

  /** 活体完成后：若 Prefetch 已积累足够 matched 次数，即时放行 */
  const tryInstantPassAfterLiveness = useCallback((action: FaceChallengeAction): boolean => {
    if (prefetchTransferredRef.current) return false;
    prefetchTransferredRef.current = true;
    aboveMatchFramesRef.current = prefetchConsecutiveRef.current;
    const meta = lastPrefetchSuccessRef.current;
    if (aboveMatchFramesRef.current >= MATCH_CONSECUTIVE_FRAMES && meta) {
      completeVerificationSuccess(action, {
        similarity: meta.similarity,
        matchThreshold: meta.matchThreshold,
        verifyToken: pendingVerifyTokenRef.current ?? meta.verifyToken,
        topSims: meta.topSims,
        modelVersion: meta.modelVersion,
      }, {
        prefetchAccelerated: true,
        consecutiveFrames: aboveMatchFramesRef.current,
      });
      return true;
    }
    return false;
  }, [completeVerificationSuccess]);

  const runServerVerify = useCallback(async (
    video: HTMLVideoElement,
    action: FaceChallengeAction,
    mode: ServerVerifyMode = 'match',
  ) => {
    const userId = optionsRef.current?.userId;
    if (!userId) return;

    const prefetchCfg: FaceVerifyPrefetchConfig = verifyPrefetchRef.current ?? DEFAULT_FACE_VERIFY_PREFETCH;
    if (mode === 'prefetch' && !prefetchCfg.prefetchEnabled) return;

    const now = Date.now();
    const minInterval = mode === 'prefetch' ? prefetchCfg.prefetchIntervalMs : SERVER_VERIFY_MIN_INTERVAL_MS;
    if (serverVerifyBusyRef.current || now - lastServerVerifyAtRef.current < minInterval) {
      return;
    }
    serverVerifyBusyRef.current = true;
    if (mode === 'match' && !serverMatchingPhaseRef.current) {
      serverMatchingPhaseRef.current = true;
      setServerVerifying(true);
    }
    lastServerVerifyAtRef.current = now;

    const apiAction = mode === 'prefetch' ? FACE_VERIFY_PREFETCH_ACTION : action;

    try {
      const frames = await captureVideoFramePair(video, 100);
      const result = await verifyFace({
        userId,
        sessionId: optionsRef.current?.sessionId,
        challengeAction: apiAction,
        source: optionsRef.current?.source ?? 'gate',
        frames,
      });

      serverThresholdRef.current = {
        match: result.matchThreshold,
        reject: result.rejectThreshold,
      };
      setSimilarity(result.similarity);

      if (mode === 'prefetch' && !challengeConfirmedRef.current) {
        if (result.similarity < prefetchCfg.preLivenessRejectThreshold) {
          failVerification(activeRef, endedRef, stopTimer, detectRef, setStatus, 'mismatch', {
            ...logContext(),
            similarity: result.similarity,
            threshold: result.matchThreshold,
            rejectThreshold: result.rejectThreshold,
            source: optionsRef.current?.source ?? 'gate',
            phase: 'pre_liveness_reject',
            challengeAction: action,
            detail: { modelVersion: result.modelVersion, route: 'server', prefetch: true },
          });
          return;
        }
        if (result.matched) {
          prefetchConsecutiveRef.current += 1;
          if (result.verifyToken) pendingVerifyTokenRef.current = result.verifyToken;
          lastPrefetchSuccessRef.current = {
            similarity: result.similarity,
            matchThreshold: result.matchThreshold,
            topSims: result.topSims,
            modelVersion: result.modelVersion,
            verifyToken: result.verifyToken,
          };
        } else {
          prefetchConsecutiveRef.current = 0;
        }
        return;
      }

      if (result.rejected) {
        failVerification(activeRef, endedRef, stopTimer, detectRef, setStatus, 'mismatch', {
          ...logContext(),
          similarity: result.similarity,
          threshold: result.matchThreshold,
          rejectThreshold: result.rejectThreshold,
          source: optionsRef.current?.source ?? 'gate',
          phase: 'matching',
          challengeAction: action,
          detail: { modelVersion: result.modelVersion, topSims: result.topSims, route: 'server' },
        });
        return;
      }

      if (result.matched) {
        aboveMatchFramesRef.current += 1;
        belowMatchFramesRef.current = 0;
        if (result.verifyToken) {
          verifyTokenRef.current = result.verifyToken;
          optionsRef.current?.onVerifyToken?.(result.verifyToken);
        }
        if (aboveMatchFramesRef.current >= MATCH_CONSECUTIVE_FRAMES) {
          completeVerificationSuccess(action, {
            similarity: result.similarity,
            matchThreshold: result.matchThreshold,
            verifyToken: result.verifyToken,
            topSims: result.topSims,
            modelVersion: result.modelVersion,
          });
        }
        return;
      }

      aboveMatchFramesRef.current = 0;
      belowMatchFramesRef.current += 1;
      const matchingElapsed = Date.now() - matchingStartedAtRef.current;
      if (belowMatchFramesRef.current >= BELOW_MATCH_FRAMES || matchingElapsed >= MATCH_PHASE_MAX_MS) {
        failVerification(activeRef, endedRef, stopTimer, detectRef, setStatus, 'mismatch', {
          ...logContext(),
          similarity: result.similarity,
          threshold: result.matchThreshold,
          rejectThreshold: result.rejectThreshold,
          source: optionsRef.current?.source ?? 'gate',
          phase: 'gray_zone',
          belowMatchFrames: belowMatchFramesRef.current,
          matchingElapsedMs: matchingElapsed,
          challengeAction: action,
          detail: { modelVersion: result.modelVersion, route: 'server' },
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const reason = msg.includes('模型') ? 'model_not_ready' : 'server_verify_error';
      logFaceVerifyFailure(reason, {
        ...logContext(),
        source: optionsRef.current?.source ?? 'gate',
        challengeAction: apiAction,
        detail: msg,
      });
    } finally {
      serverVerifyBusyRef.current = false;
    }
  }, [logContext, stopTimer, completeVerificationSuccess]);

  const maybeRunPrefetch = useCallback((
    video: HTMLVideoElement,
    detection: FaceDetectionWithLandmarks,
    action: FaceChallengeAction,
  ) => {
    const prefetchCfg = verifyPrefetchRef.current;
    if (!prefetchCfg.prefetchEnabled) return;
    if (serverVerifyBusyRef.current) return;
    if (!canPrefetchDuringChallenge(
      detection,
      action,
      lastBlinkScoreRef.current,
      motionGuardRef.current.isBlinkLivenessValid(),
    )) {
      return;
    }
    void runServerVerify(video, action, 'prefetch');
  }, [runServerVerify]);

  const detectLoop = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !activeRef.current) return;

    const action = challengeActionRef.current;

    try {
      const detection = await faceapi
        .detectSingleFace(video, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks();

      if (!detection) {
        if (blinkPhase !== 'awaiting-challenge') setBlinkPhase('awaiting-challenge');
        if (noFaceSinceRef.current === 0) noFaceSinceRef.current = Date.now();
        if (Date.now() - noFaceSinceRef.current > NO_FACE_TIMEOUT_MS) {
          failVerification(activeRef, endedRef, stopTimer, detectRef, setStatus, 'timeout', {
            ...logContext(),
            source: optionsRef.current?.source ?? 'gate',
            timeoutCause: 'no_face',
            challengeAction: action,
          });
          return;
        }
        if (activeRef.current) detectRef.current = setTimeout(detectLoop, DETECT_INTERVAL);
        return;
      }
      noFaceSinceRef.current = 0;

      motionGuardRef.current.add(detection.detection.box, detection.landmarks.positions);

      if (!challengeConfirmedRef.current) {
        const waitElapsed = Date.now() - challengeWaitStartedRef.current;

        if (action === 'blink') {
          let maxBlink = lastBlinkScoreRef.current;
          try {
            const mp = await getMpLandmarker();
            const mpResult = mp.detectForVideo(video, performance.now());
            const bs = mpResult.faceBlendshapes?.[0]?.categories;
            if (bs && bs.length > 0) {
              const leftBlink = bs.find((b) => b.categoryName === 'eyeBlinkLeft')?.score ?? 0;
              const rightBlink = bs.find((b) => b.categoryName === 'eyeBlinkRight')?.score ?? 0;
              maxBlink = Math.max(leftBlink, rightBlink);
              lastBlinkScoreRef.current = maxBlink;
              if (blinkDetectorRef.current.update(maxBlink)) {
                if (motionGuardRef.current.isBlinkLivenessValid()) {
                  confirmChallenge();
                } else {
                  blinkDetectorRef.current.reset();
                  logFaceVerifyFailure('liveness_spoof', {
                    ...logContext(),
                    source: optionsRef.current?.source ?? 'gate',
                    challengeAction: action,
                    detail: {
                      motion: motionGuardRef.current.getNormalizedFaceMotion(),
                      photoSlide: true,
                    },
                  });
                }
              }
            }
          } catch {
            if (mpFailed) confirmChallenge();
          }

          if (
            !challengeConfirmedRef.current &&
            waitElapsed >= BLINK_LIVENESS_FALLBACK_MS &&
            motionGuardRef.current.isBlinkLivenessValid()
          ) {
            confirmChallenge();
          }
        } else {
          if (waitElapsed > FACE_GATE_POSE_CHALLENGE_TIMEOUT_MS) {
            failVerification(activeRef, endedRef, stopTimer, detectRef, setStatus, 'timeout', {
              ...logContext(),
              source: optionsRef.current?.source ?? 'gate',
              timeoutCause: 'challenge_wait',
              challengeAction: action,
            });
            return;
          }

          const pose = measureHeadPose(detection);
          const turnHoldMs = livenessRef.current.verifyTurnHoldMs;
          if (pose && isPoseChallengeActive(action, pose, FACE_CHALLENGE_TURN_OFFSET)) {
            if (turnHoldMs <= 0) {
              confirmChallenge();
            } else {
              if (gateTurnHoldStartRef.current === 0) gateTurnHoldStartRef.current = Date.now();
              if (Date.now() - gateTurnHoldStartRef.current >= turnHoldMs) {
                confirmChallenge();
              }
            }
          } else {
            gateTurnHoldStartRef.current = 0;
          }
        }

        if (!challengeConfirmedRef.current) {
          maybeRunPrefetch(video, detection, action);
          if (blinkPhase !== 'awaiting-challenge') setBlinkPhase('awaiting-challenge');
          if (activeRef.current) detectRef.current = setTimeout(detectLoop, DETECT_INTERVAL);
          return;
        }
      }

      if (matchingStartedAtRef.current === 0) matchingStartedAtRef.current = Date.now();

      const pose = measureHeadPose(detection);
      if (isTurnChallengeAction(action) && pose && !isFrontalPose(pose, GATE_FRONTAL_MAX)) {
        belowMatchFramesRef.current = 0;
        maybeRunPrefetch(video, detection, action);
        setBlinkPhase('awaiting-frontal');
        if (activeRef.current) detectRef.current = setTimeout(detectLoop, DETECT_INTERVAL);
        return;
      }

      if (tryInstantPassAfterLiveness(action)) {
        return;
      }

      setBlinkPhase('matching');
      await runServerVerify(video, action, 'match');

      if (activeRef.current && !endedRef.current) {
        detectRef.current = setTimeout(detectLoop, DETECT_INTERVAL);
      }
    } catch {
      if (activeRef.current) detectRef.current = setTimeout(detectLoop, DETECT_INTERVAL);
    }
  }, [videoRef, blinkPhase, logContext, confirmChallenge, stopTimer, runServerVerify, maybeRunPrefetch, tryInstantPassAfterLiveness]);

  const start = useCallback(async () => {
    endServerMatchingPhase();
    resetPrefetchRuntime();
    const queue = buildGateChallengeSequence(livenessRef.current);
    resetChallengeRuntime(queue);
    setStatus('detecting');
    setSimilarity(null);
    setElapsedSeconds(0);
    belowMatchFramesRef.current = 0;
    aboveMatchFramesRef.current = 0;
    matchingStartedAtRef.current = 0;
    noFaceSinceRef.current = 0;
    endedRef.current = false;
    verifyTokenRef.current = null;
    lastServerVerifyAtRef.current = 0;
    activeRef.current = true;
    if (queue.length > 0 && queue[0] === 'blink') void getMpLandmarker().catch(() => {});

    const baselineCount = optionsRef.current?.baselineCount ?? 0;
    if (baselineCount <= 0) {
      logFaceVerifyFailure('baseline_unavailable', {
        ...logContext(),
        source: optionsRef.current?.source ?? 'gate',
      });
      activeRef.current = false;
      setStatus('noFace');
      return;
    }

    if (!optionsRef.current?.userId) {
      logFaceVerifyFailure('baseline_unavailable', { ...logContext(), detail: 'missing userId' });
      activeRef.current = false;
      setStatus('noFace');
      return;
    }

    try {
      await waitForModels();
    } catch {
      activeRef.current = false;
      setStatus('timeout');
      return;
    }

    setBlinkPhase('detecting-face');
    const modelOk = await waitForFaceServerModel(90_000);
    if (!modelOk) {
      logFaceVerifyFailure('model_not_ready', {
        ...logContext(),
        source: optionsRef.current?.source ?? 'gate',
        detail: '服务端 FaceNet 模型未在 90s 内就绪，请重启后端或检查网络',
      });
      activeRef.current = false;
      setStatus('timeout');
      return;
    }

    const videoOk = await waitForVideoPlayback(videoRef);
    if (!videoOk) {
      activeRef.current = false;
      logFaceVerifyFailure('camera_not_ready', {
        ...logContext(),
        source: optionsRef.current?.source ?? 'gate',
        timeoutCause: 'camera',
      });
      setStatus('timeout');
      return;
    }

    startTimer();
    if (DETECT_START_DELAY <= 0) void detectLoop();
    else detectRef.current = setTimeout(detectLoop, DETECT_START_DELAY);
  }, [resetChallengeRuntime, startTimer, detectLoop, videoRef, logContext, endServerMatchingPhase, resetPrefetchRuntime]);

  const stop = useCallback(() => {
    activeRef.current = false;
    stopTimer();
    endServerMatchingPhase();
    if (detectRef.current) {
      clearTimeout(detectRef.current);
      detectRef.current = null;
    }
  }, [stopTimer, endServerMatchingPhase]);

  const retry = useCallback(async () => {
    const next = retryCount + 1;
    setRetryCount(next);
    if (next >= maxRetries) {
      logFaceVerifyFailure('max_retries', {
        ...logContext(),
        source: optionsRef.current?.source ?? 'gate',
        retryCount: next,
      });
      setStatus('maxRetries');
      stop();
    } else {
      const queue = buildGateChallengeSequence(livenessRef.current);
      resetChallengeRuntime(queue);
      resetPrefetchRuntime();
      setStatus('detecting');
      setSimilarity(null);
      setElapsedSeconds(0);
      belowMatchFramesRef.current = 0;
      aboveMatchFramesRef.current = 0;
      matchingStartedAtRef.current = 0;
      noFaceSinceRef.current = 0;
      verifyTokenRef.current = null;
      lastServerVerifyAtRef.current = 0;
      stop();
      endedRef.current = false;
      activeRef.current = true;
      if (queue.length > 0 && queue[0] === 'blink') void getMpLandmarker().catch(() => {});

      const videoOk = await waitForVideoPlayback(videoRef);
      if (!videoOk) {
        activeRef.current = false;
        logFaceVerifyFailure('camera_not_ready', {
          ...logContext(),
          source: optionsRef.current?.source ?? 'gate',
          phase: 'retry',
          timeoutCause: 'camera',
        });
        setStatus('timeout');
        return;
      }

      startTimer();
      if (DETECT_START_DELAY <= 0) void detectLoop();
      else detectRef.current = setTimeout(detectLoop, DETECT_START_DELAY);
    }
  }, [retryCount, maxRetries, stop, startTimer, detectLoop, videoRef, logContext, resetChallengeRuntime, resetPrefetchRuntime]);

  const reset = useCallback(() => {
    stop();
    endedRef.current = false;
    setStatus('idle');
    setSimilarity(null);
    setRetryCount(0);
    setElapsedSeconds(0);
    resetChallengeRuntime(buildGateChallengeSequence(livenessRef.current));
    resetPrefetchRuntime();
    belowMatchFramesRef.current = 0;
    aboveMatchFramesRef.current = 0;
    matchingStartedAtRef.current = 0;
    verifyTokenRef.current = null;
  }, [stop, resetChallengeRuntime, resetPrefetchRuntime]);

  useEffect(() => () => { stop(); }, [stop]);

  useEffect(() => {
    if (
      status === 'mismatched'
      || status === 'timeout'
      || status === 'maxRetries'
      || status === 'noFace'
    ) {
      endServerMatchingPhase();
    }
  }, [status, endServerMatchingPhase]);

  return {
    status,
    similarity,
    retryCount,
    elapsedSeconds,
    blinkPhase,
    serverVerifying,
    challengeAction,
    verifyToken: verifyTokenRef.current,
    start,
    stop,
    retry,
    reset,
  };
}
