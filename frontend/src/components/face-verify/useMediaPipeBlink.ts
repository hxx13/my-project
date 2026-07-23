import { useRef, useCallback, useEffect } from 'react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { createAdaptiveBlinkDetector } from './blinkDetector';

let faceLandmarker: FaceLandmarker | null = null;
let initPromise: Promise<void> | null = null;
let initError: string | null = null;
let initFailed = false;
const INIT_TIMEOUT_MS = 6000;

async function ensureLandmarker(): Promise<FaceLandmarker> {
  if (faceLandmarker) return faceLandmarker;
  if (initFailed) throw new Error(initError || 'MediaPipe init failed');
  if (initPromise) {
    await initPromise;
    if (faceLandmarker) return faceLandmarker;
    if (initFailed) throw new Error(initError || 'MediaPipe init failed');
  }

  initPromise = (async () => {
    try {
      const vision = await Promise.race([
        FilesetResolver.forVisionTasks('/models/mediapipe'),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('MediaPipe WASM 加载超时')), INIT_TIMEOUT_MS),
        ),
      ]) as Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;
      faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/models/face_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
        numFaces: 1,
      });
    } catch (e: unknown) {
      initError = e instanceof Error ? e.message : 'MediaPipe init failed';
      initFailed = true;
      throw e;
    }
  })();

  await initPromise;
  return faceLandmarker!;
}

interface BlinkState {
  blinking: boolean;
  leftScore: number;
  rightScore: number;
  error: string | null;
}

/**
 * 基于 MediaPipe blendshapes 的自适应眨眼检测（小眼/单眼皮友好）
 */
export function useMediaPipeBlink(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onBlinkDetected: () => void,
  onError?: (err: string) => void,
) {
  const blinkStateRef = useRef<BlinkState>({ blinking: false, leftScore: 0, rightScore: 0, error: null });
  const detectedRef = useRef(false);
  const activeRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const detectorRef = useRef(createAdaptiveBlinkDetector());

  const detectBlink = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || !activeRef.current || detectedRef.current) {
      if (activeRef.current && !detectedRef.current) {
        timerRef.current = setTimeout(detectBlink, 100);
      }
      return;
    }

    try {
      const lm = await ensureLandmarker();
      const result = lm.detectForVideo(video, performance.now());
      const classifications = result.faceBlendshapes?.[0];
      const blendshapes = classifications?.categories;

      if (!blendshapes || blendshapes.length === 0) {
        timerRef.current = setTimeout(detectBlink, 100);
        return;
      }

      const leftScore = blendshapes.find((b) => b.categoryName === 'eyeBlinkLeft')?.score ?? 0;
      const rightScore = blendshapes.find((b) => b.categoryName === 'eyeBlinkRight')?.score ?? 0;
      const maxBlink = Math.max(leftScore, rightScore);
      blinkStateRef.current = {
        blinking: maxBlink > detectorRef.current.getBaseline() + 0.05,
        leftScore,
        rightScore,
        error: null,
      };

      if (detectorRef.current.update(maxBlink)) {
        detectedRef.current = true;
        onBlinkDetected();
        return;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'MediaPipe blink error';
      blinkStateRef.current = { blinking: false, leftScore: 0, rightScore: 0, error: msg };
      onError?.(msg);
    }

    if (activeRef.current && !detectedRef.current) {
      timerRef.current = setTimeout(detectBlink, 100);
    }
  }, [videoRef, onBlinkDetected, onError]);

  const start = useCallback(() => {
    detectedRef.current = false;
    activeRef.current = true;
    detectorRef.current.reset();
    timerRef.current = setTimeout(detectBlink, 500);
  }, [detectBlink]);

  const stop = useCallback(() => {
    activeRef.current = false;
    detectedRef.current = false;
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const reset = useCallback(() => {
    detectedRef.current = false;
    detectorRef.current.reset();
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { start, stop, reset, getState: () => blinkStateRef.current };
}
