/** 活体/录入动作运行时配置（默认兜底；运行时以 GET /api/face/config 的 liveness 为准） */
export interface FaceLivenessConfig {
  verifyBlinkEnabled: boolean;
  verifyTurnEnabled: boolean;
  verifyTurnHoldMs: number;
  enrollBlinkEnabled: boolean;
  enrollTurnLeftEnabled: boolean;
  enrollTurnRightEnabled: boolean;
  enrollTurnHoldMs: number;
  enrollHoldStillSeconds: number;
}

export const DEFAULT_FACE_LIVENESS: FaceLivenessConfig = {
  verifyBlinkEnabled: true,
  verifyTurnEnabled: true,
  verifyTurnHoldMs: 800,
  enrollBlinkEnabled: true,
  enrollTurnLeftEnabled: true,
  enrollTurnRightEnabled: true,
  enrollTurnHoldMs: 800,
  enrollHoldStillSeconds: 2,
};

export function mergeFaceLiveness(raw?: Partial<FaceLivenessConfig> | null): FaceLivenessConfig {
  if (!raw) return { ...DEFAULT_FACE_LIVENESS };
  return {
    verifyBlinkEnabled: raw.verifyBlinkEnabled ?? DEFAULT_FACE_LIVENESS.verifyBlinkEnabled,
    verifyTurnEnabled: raw.verifyTurnEnabled ?? DEFAULT_FACE_LIVENESS.verifyTurnEnabled,
    verifyTurnHoldMs: raw.verifyTurnHoldMs ?? DEFAULT_FACE_LIVENESS.verifyTurnHoldMs,
    enrollBlinkEnabled: raw.enrollBlinkEnabled ?? DEFAULT_FACE_LIVENESS.enrollBlinkEnabled,
    enrollTurnLeftEnabled: raw.enrollTurnLeftEnabled ?? DEFAULT_FACE_LIVENESS.enrollTurnLeftEnabled,
    enrollTurnRightEnabled: raw.enrollTurnRightEnabled ?? DEFAULT_FACE_LIVENESS.enrollTurnRightEnabled,
    enrollTurnHoldMs: raw.enrollTurnHoldMs ?? DEFAULT_FACE_LIVENESS.enrollTurnHoldMs,
    enrollHoldStillSeconds: raw.enrollHoldStillSeconds ?? DEFAULT_FACE_LIVENESS.enrollHoldStillSeconds,
  };
}
