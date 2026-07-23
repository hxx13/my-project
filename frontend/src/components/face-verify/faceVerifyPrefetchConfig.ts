/** 门禁验证 Prefetch：活体期间静默比对 + 眨眼前早拒（运行时以 GET /api/face/config → verifyPrefetch 为准） */
export interface FaceVerifyPrefetchConfig {
  prefetchEnabled: boolean;
  prefetchIntervalMs: number;
  preLivenessRejectThreshold: number;
}

export const DEFAULT_FACE_VERIFY_PREFETCH: FaceVerifyPrefetchConfig = {
  prefetchEnabled: true,
  prefetchIntervalMs: 900,
  preLivenessRejectThreshold: 0.55,
};

export function mergeFaceVerifyPrefetch(
  raw?: Partial<FaceVerifyPrefetchConfig> | null,
): FaceVerifyPrefetchConfig {
  if (!raw) return { ...DEFAULT_FACE_VERIFY_PREFETCH };
  return {
    prefetchEnabled: raw.prefetchEnabled ?? DEFAULT_FACE_VERIFY_PREFETCH.prefetchEnabled,
    prefetchIntervalMs: raw.prefetchIntervalMs ?? DEFAULT_FACE_VERIFY_PREFETCH.prefetchIntervalMs,
    preLivenessRejectThreshold:
      raw.preLivenessRejectThreshold ?? DEFAULT_FACE_VERIFY_PREFETCH.preLivenessRejectThreshold,
  };
}

/** Prefetch 审计用 challengeAction */
export const FACE_VERIFY_PREFETCH_ACTION = 'prefetch' as const;
