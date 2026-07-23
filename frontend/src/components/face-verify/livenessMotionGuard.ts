import type faceapi from 'face-api.js';
import {
  LIVENESS_MAX_LANDMARK_RESIDUAL_RATIO,
  LIVENESS_PHOTO_SLIDE_MIN_MOTION,
} from './faceConfig';

interface TimedSample {
  t: number;
  cx: number;
  cy: number;
  faceWidth: number;
  landmarks?: faceapi.Point[];
}

/**
 * 活体运动守卫：检测「整脸平移 + 地标刚性同步」——常见于拿照片上下抖动冒充眨眼。
 */
export function createLivenessMotionGuard(windowMs = 1_500) {
  const samples: TimedSample[] = [];

  function trim(now: number) {
    while (samples.length > 0 && now - samples[0].t > windowMs) {
      samples.shift();
    }
  }

  function add(
    box: { x: number; y: number; width: number; height: number },
    landmarks?: faceapi.Point[],
    t = Date.now(),
  ) {
    samples.push({
      t,
      cx: box.x + box.width / 2,
      cy: box.y + box.height / 2,
      faceWidth: Math.max(box.width, 1),
      landmarks,
    });
    trim(t);
  }

  function reset() {
    samples.length = 0;
  }

  /** 脸框中心最大位移 / 脸宽 */
  function getNormalizedFaceMotion(): number {
    if (samples.length < 2) return 0;
    const fw = samples[samples.length - 1].faceWidth;
    let maxDist = 0;
    for (let i = 1; i < samples.length; i++) {
      maxDist = Math.max(
        maxDist,
        Math.hypot(samples[i].cx - samples[0].cx, samples[i].cy - samples[0].cy),
      );
    }
    return maxDist / fw;
  }

  /**
   * 连续帧地标位移高度一致 → 像刚性照片整体移动，而非局部眨眼/表情变化。
   */
  function isLikelyPrintedPhotoSlide(): boolean {
    const withLm = samples.filter((s) => s.landmarks && s.landmarks.length > 0);
    if (withLm.length < 3) return false;

    const motion = getNormalizedFaceMotion();
    if (motion < LIVENESS_PHOTO_SLIDE_MIN_MOTION) return false;

    let rigiditySum = 0;
    let pairs = 0;
    for (let i = 1; i < withLm.length; i++) {
      const prev = withLm[i - 1].landmarks!;
      const curr = withLm[i].landmarks!;
      if (prev.length !== curr.length) continue;
      const fw = withLm[i].faceWidth;
      const dx = curr.map((p, j) => p.x - prev[j].x);
      const dy = curr.map((p, j) => p.y - prev[j].y);
      const avgDx = dx.reduce((a, b) => a + b, 0) / dx.length;
      const avgDy = dy.reduce((a, b) => a + b, 0) / dy.length;
      const residual =
        dx.reduce((sum, _, j) => sum + Math.abs(dx[j] - avgDx) + Math.abs(dy[j] - avgDy), 0) / dx.length;
      rigiditySum += residual / fw;
      pairs++;
    }
    if (pairs === 0) return false;
    return rigiditySum / pairs <= LIVENESS_MAX_LANDMARK_RESIDUAL_RATIO;
  }

  function isBlinkLivenessValid(): boolean {
    return !isLikelyPrintedPhotoSlide();
  }

  return {
    add,
    reset,
    getNormalizedFaceMotion,
    isLikelyPrintedPhotoSlide,
    isBlinkLivenessValid,
  };
}

export type LivenessMotionGuard = ReturnType<typeof createLivenessMotionGuard>;
