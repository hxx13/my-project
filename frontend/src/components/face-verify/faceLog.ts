/** 人脸验证结果日志：控制台中文逐行输出，无 JSON */

export type FaceVerifyLogPayload = {
  source?: string;
  similarity?: number | null;
  threshold?: number;
  rejectThreshold?: number;
  bestDist?: number;
  userId?: string;
  userName?: string;
  phase?: string;
  /** 超时子原因：elapsed=整轮超时 | no_face=连续无人脸 */
  timeoutCause?: string;
  belowMatchFrames?: number;
  matchingElapsedMs?: number;
  /** MediaPipe 眨眼 blendshape 调试 */
  blinkScore?: number;
  blinkBaseline?: number;
  blinkPhase?: string;
  challengeAction?: string;
  baselineCount?: number;
  retryCount?: number;
  detail?: unknown;
};

const REASON_LABELS: Record<string, string> = {
  mismatch: '人脸与底库不匹配',
  timeout: '验证超时',
  baseline_unavailable: '无底库照片（且无可用的头像兜底）',
  baseline_load_error: '底库加载失败',
  camera_not_ready: '摄像头未就绪',
  max_retries: '验证次数已用尽',
  pip_timeout: 'PIP 监测：人脸离开超时',
  server_verify_error: '服务端人脸比对失败',
  model_not_ready: '服务端人脸模型尚未就绪',
  liveness_spoof: '活体检测未通过（请保持面部稳定，勿晃动照片）',
};

const TIMEOUT_CAUSE_LABELS: Record<string, string> = {
  elapsed: '整轮硬超时（默认 10s）',
  no_face: '连续无人脸超时（默认 3.5s）',
  camera: '摄像头未就绪',
  blink_wait: '等待眨眼超时（小眼/未明显眨眼，可重试或请用力眨眼）',
};

const PHASE_LABELS: Record<string, string> = {
  pre_blink: '眨眼前快速比对',
  pre_liveness_reject: '活体前早拒',
  matching: '眨眼后比对',
  gray_zone: '相似度灰区未通过',
  retry: '重试轮次',
};

function pct(sim: number | null | undefined): string {
  if (sim == null || Number.isNaN(sim)) return '—';
  return `${(sim * 100).toFixed(1)}%`;
}


function logChineseLines(tag: string, lines: Array<[string, string | undefined]>) {
  for (const [label, value] of lines) {
    if (value != null && value !== '' && value !== '—') {
      console.info(`${tag} ${label}: ${value}`);
    }
  }
}

function payloadToLines(reason: string, payload: FaceVerifyLogPayload): Array<[string, string | undefined]> {
  const label = REASON_LABELS[reason] ?? reason;
  const lines: Array<[string, string | undefined]> = [
    ['结果', label],
  ];
  if (payload.timeoutCause) {
    lines.push(['超时原因', TIMEOUT_CAUSE_LABELS[payload.timeoutCause] ?? payload.timeoutCause]);
  }
  if (payload.phase) {
    lines.push(['阶段', PHASE_LABELS[payload.phase] ?? payload.phase]);
  }
  if (payload.userName || payload.userId) {
    lines.push(['人员', payload.userName ?? payload.userId]);
  }
  if (payload.userId && payload.userName) {
    lines.push(['人员ID', payload.userId]);
  }
  if (payload.similarity != null) lines.push(['相似度', pct(payload.similarity)]);
  if (payload.threshold != null) lines.push(['通过线', `≥${pct(payload.threshold)}`]);
  if (payload.rejectThreshold != null) lines.push(['拒绝线', `<${pct(payload.rejectThreshold)}`]);
  if (payload.bestDist != null) lines.push(['特征距离', payload.bestDist.toFixed(3)]);
  if (payload.belowMatchFrames != null) lines.push(['灰区帧数', String(payload.belowMatchFrames)]);
  if (payload.matchingElapsedMs != null) lines.push(['比对耗时', `${payload.matchingElapsedMs}ms`]);
  if (payload.blinkScore != null) lines.push(['眨眼分数', payload.blinkScore.toFixed(3)]);
  if (payload.blinkBaseline != null) lines.push(['睁眼基线', payload.blinkBaseline.toFixed(3)]);
  if (payload.baselineCount != null) lines.push(['底库张数', String(payload.baselineCount)]);
  if (payload.retryCount != null) lines.push(['已重试次数', String(payload.retryCount)]);
  if (payload.source) lines.push(['来源', payload.source]);
  if (payload.challengeAction) lines.push(['活体动作', payload.challengeAction]);
  if (payload.detail != null && typeof payload.detail === 'string') {
    lines.push(['详情', payload.detail]);
  }
  return lines;
}

function isTimeoutReason(reason: string, payload: FaceVerifyLogPayload): boolean {
  return (
    reason === 'timeout' ||
    reason === 'pip_timeout' ||
    reason === 'camera_not_ready' ||
    payload.timeoutCause != null
  );
}

function logDetail(reason: string, payload: FaceVerifyLogPayload) {
  const tag = isTimeoutReason(reason, payload) ? '[人脸验证] ⏱️' : '[人脸验证] ❌';
  logChineseLines(tag, payloadToLines(reason, payload));
}

export function logFaceVerifySuccess(payload: FaceVerifyLogPayload) {
  const lines: Array<[string, string | undefined]> = [
    ['结果', '通过'],
  ];
  if (payload.userName || payload.userId) {
    lines.push(['人员', payload.userName ?? payload.userId]);
  }
  if (payload.userId && payload.userName) lines.push(['人员ID', payload.userId]);
  if (payload.similarity != null) lines.push(['相似度', pct(payload.similarity)]);
  if (payload.threshold != null) lines.push(['通过线', `≥${pct(payload.threshold)}`]);
  if (payload.bestDist != null) lines.push(['特征距离', payload.bestDist.toFixed(3)]);
  if (payload.source) lines.push(['来源', payload.source]);
  if (payload.challengeAction) lines.push(['活体动作', payload.challengeAction]);
  if (payload.baselineCount != null) lines.push(['底库张数', String(payload.baselineCount)]);
  const detail = payload.detail as { prefetchAccelerated?: boolean; consecutiveFrames?: number } | undefined;
  if (detail?.prefetchAccelerated) lines.push(['Prefetch加速', '是']);
  if (detail?.consecutiveFrames != null) lines.push(['连续通过帧', String(detail.consecutiveFrames)]);
  logChineseLines('[人脸验证] ✅', lines);
}

export function logFaceVerifyFailure(reason: string, payload: FaceVerifyLogPayload = {}) {
  logDetail(reason, payload);
}

/** 验证超时专用入口（与 failure 相同格式，标签为超时） */
export function logFaceVerifyTimeout(cause: string, payload: FaceVerifyLogPayload = {}) {
  logDetail('timeout', { ...payload, timeoutCause: cause });
}
