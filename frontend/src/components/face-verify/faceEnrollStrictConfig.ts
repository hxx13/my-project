/** 录入严模式阈值（客户端 face-api 帧间互配；运行时以 GET /api/face/config → enrollStrict 为准） */
export interface FaceEnrollStrictThresholds {
  pairMinSim: number;
  minCountAbovePair: number;
  maxPairSim: number;
  top2AvgMin: number;
}

export const DEFAULT_FACE_ENROLL_STRICT: FaceEnrollStrictThresholds = {
  pairMinSim: 0.72,
  minCountAbovePair: 2,
  maxPairSim: 0.82,
  top2AvgMin: 0.75,
};

export function mergeFaceEnrollStrict(
  raw?: Partial<FaceEnrollStrictThresholds> | null,
): FaceEnrollStrictThresholds {
  if (!raw) return { ...DEFAULT_FACE_ENROLL_STRICT };
  return {
    pairMinSim: raw.pairMinSim ?? DEFAULT_FACE_ENROLL_STRICT.pairMinSim,
    minCountAbovePair: raw.minCountAbovePair ?? DEFAULT_FACE_ENROLL_STRICT.minCountAbovePair,
    maxPairSim: raw.maxPairSim ?? DEFAULT_FACE_ENROLL_STRICT.maxPairSim,
    top2AvgMin: raw.top2AvgMin ?? DEFAULT_FACE_ENROLL_STRICT.top2AvgMin,
  };
}

export function formatStrictEnrollmentFailReason(t: FaceEnrollStrictThresholds): string {
  const pct = (n: number) => `${(n * 100).toFixed(0)}%`;
  return (
    `录入严模式未通过：至少 ${t.minCountAbovePair} 张与其它合格照互配 ≥${pct(t.pairMinSim)}，` +
    `或全局最高互配 ≥${pct(t.maxPairSim)} 且各张最高互配前两均值 ≥${pct(t.top2AvgMin)}`
  );
}
