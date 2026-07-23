import {
  BLINK_CLOSE_THRESHOLD_MIN,
  BLINK_OPEN_BASELINE_FRAMES,
  BLINK_RELATIVE_CLOSE_DELTA,
  BLINK_RELATIVE_OPEN_DELTA,
} from './faceConfig';

export type AdaptiveBlinkPhase = 'calibrating' | 'awaitClose' | 'awaitReopen';

/**
 * 自适应眨眼检测：先校准个人「常态睁眼」水平，再检测相对变化。
 * 小眼用户常态 score 可能 0.18–0.25，固定阈值 <0.15 会永远卡在 waitOpen。
 */
export function createAdaptiveBlinkDetector() {
  let phase: AdaptiveBlinkPhase = 'calibrating';
  let baselineOpen = 0;
  let calibCount = 0;
  let calibSum = 0;
  let peakClose = 0;

  return {
    reset() {
      phase = 'calibrating';
      baselineOpen = 0;
      calibCount = 0;
      calibSum = 0;
      peakClose = 0;
    },
    getPhase(): AdaptiveBlinkPhase {
      return phase;
    },
    getBaseline(): number {
      return baselineOpen;
    },
    getPeakClose(): number {
      return peakClose;
    },
    /** @returns true 表示完成一次有效眨眼周期 */
    update(maxBlink: number): boolean {
      if (phase === 'calibrating') {
        calibSum += maxBlink;
        calibCount += 1;
        if (calibCount >= BLINK_OPEN_BASELINE_FRAMES) {
          baselineOpen = calibSum / calibCount;
          phase = 'awaitClose';
        }
        return false;
      }

      const closeTarget = Math.max(
        baselineOpen + BLINK_RELATIVE_CLOSE_DELTA,
        BLINK_CLOSE_THRESHOLD_MIN,
      );

      if (phase === 'awaitClose') {
        peakClose = Math.max(peakClose, maxBlink);
        if (maxBlink >= closeTarget) {
          phase = 'awaitReopen';
        }
        return false;
      }

      const reopenLevel = Math.max(
        peakClose - BLINK_RELATIVE_OPEN_DELTA,
        baselineOpen + BLINK_RELATIVE_CLOSE_DELTA * 0.4,
      );
      if (maxBlink <= reopenLevel) {
        return true;
      }
      return false;
    },
  };
}

export type AdaptiveBlinkDetector = ReturnType<typeof createAdaptiveBlinkDetector>;
