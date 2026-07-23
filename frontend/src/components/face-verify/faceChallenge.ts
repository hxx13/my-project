import * as faceapi from 'face-api.js';

/** 动作指令：眨眼 / 左右转头 */
export type FaceChallengeAction = 'blink' | 'turnLeft' | 'turnRight';

/** 门禁随机动作池 */
export const GATE_CHALLENGE_ACTIONS: FaceChallengeAction[] = ['blink', 'turnLeft', 'turnRight'];

/** 录入固定顺序：注视后依次执行 */
export const ENROLLMENT_ACTION_SEQUENCE: FaceChallengeAction[] = ['blink', 'turnLeft', 'turnRight'];

export interface HeadPoseMetrics {
  /** 鼻尖相对脸中心水平偏移（正=画面右侧） */
  horizontalOffset: number;
}

/** 门禁：每次验证随机一个动作（单步，保留兼容） */
export function pickRandomGateChallenge(): FaceChallengeAction {
  const pool = GATE_CHALLENGE_ACTIONS;
  return pool[Math.floor(Math.random() * pool.length)];
}

import type { FaceLivenessConfig } from './faceLivenessConfig';

/** 门禁：按运行时配置组装活体步骤 */
export function buildGateChallengeSequence(
  liveness: Pick<FaceLivenessConfig, 'verifyBlinkEnabled' | 'verifyTurnEnabled'>,
): FaceChallengeAction[] {
  const steps: FaceChallengeAction[] = [];
  if (liveness.verifyBlinkEnabled) steps.push('blink');
  if (liveness.verifyTurnEnabled) {
    steps.push(Math.random() < 0.5 ? 'turnLeft' : 'turnRight');
  }
  return steps;
}

/** 录入：按运行时配置组装活体步骤 */
export function buildEnrollmentSequence(
  liveness: Pick<
    FaceLivenessConfig,
    'enrollBlinkEnabled' | 'enrollTurnLeftEnabled' | 'enrollTurnRightEnabled'
  >,
): FaceChallengeAction[] {
  const steps: FaceChallengeAction[] = [];
  if (liveness.enrollBlinkEnabled) steps.push('blink');
  if (liveness.enrollTurnLeftEnabled) steps.push('turnLeft');
  if (liveness.enrollTurnRightEnabled) steps.push('turnRight');
  return steps;
}

export function getChallengeTitle(action: FaceChallengeAction): string {
  switch (action) {
    case 'blink':
      return '请眨眼';
    case 'turnLeft':
      return '请向左转头';
    case 'turnRight':
      return '请向右转头';
  }
}

/** 门禁验证：转头/眨眼的操作说明 */
export function getGateChallengeHint(
  action: FaceChallengeAction,
  compact = false,
  turnHoldMs = 0,
): string {
  switch (action) {
    case 'blink':
      return compact ? '自然眨眼一次' : '自然眨眼一次即可';
    case 'turnLeft':
      return turnHoldMs > 0
        ? compact
          ? `转向左侧并保持约 ${Math.ceil(turnHoldMs / 1000)}s`
          : `请转向你的左侧并保持约 ${Math.ceil(turnHoldMs / 1000)} 秒`
        : compact
          ? '转向左侧，侧脸到位即可'
          : '请转向你的左侧，侧脸到位即可';
    case 'turnRight':
      return turnHoldMs > 0
        ? compact
          ? `转向右侧并保持约 ${Math.ceil(turnHoldMs / 1000)}s`
          : `请转向你的右侧并保持约 ${Math.ceil(turnHoldMs / 1000)} 秒`
        : compact
          ? '转向右侧，侧脸到位即可'
          : '请转向你的右侧，侧脸到位即可';
  }
}

/** 录入：转头需保持的秒数提示（与 FACE_CHALLENGE_HOLD_MS 对齐） */
export function getEnrollmentTurnHoldHint(action: FaceChallengeAction, holdMs: number): string | null {
  const seconds = Math.max(1, Math.ceil(holdMs / 1000));
  switch (action) {
    case 'turnLeft':
      return `保持约 ${seconds} 秒`;
    case 'turnRight':
      return `保持约 ${seconds} 秒`;
    default:
      return null;
  }
}

/** 录入步骤完整文案（含转头保持时长） */
export function formatEnrollmentChallengeMessage(action: FaceChallengeAction, holdMs: number): string {
  const holdHint = getEnrollmentTurnHoldHint(action, holdMs);
  return holdHint ? `${getChallengeTitle(action)}，${holdHint}` : getChallengeTitle(action);
}

export function measureHeadPose(
  det: faceapi.WithFaceLandmarks<{ detection: faceapi.FaceDetection }>,
): HeadPoseMetrics | null {
  const lm = det.landmarks;
  const noseTip = lm.getNose()[3];
  const jawLeft = lm.getJawOutline()[0];
  const jawRight = lm.getJawOutline()[16];
  const faceCenterX = (jawLeft.x + jawRight.x) / 2;
  const faceWidth = jawRight.x - jawLeft.x;
  if (faceWidth <= 0) return null;

  return {
    horizontalOffset: (noseTip.x - faceCenterX) / faceWidth,
  };
}

export function isPoseChallengeActive(
  action: FaceChallengeAction,
  pose: HeadPoseMetrics,
  turnOffset: number,
): boolean {
  switch (action) {
    case 'turnLeft':
      return pose.horizontalOffset > turnOffset;
    case 'turnRight':
      return pose.horizontalOffset < -turnOffset;
    default:
      return false;
  }
}

export function isTurnChallengeAction(action: FaceChallengeAction): boolean {
  return action === 'turnLeft' || action === 'turnRight';
}

/** 比对阶段：是否已回正（避免侧脸对正脸底库产生虚高相似度） */
export function isFrontalPose(pose: HeadPoseMetrics, maxNoseOffset: number): boolean {
  return Math.abs(pose.horizontalOffset) <= maxNoseOffset;
}

/** 转头动作完成后、正式比对前 */
export function getGateFrontalHint(compact = false): string {
  return compact ? '请回正面对镜头' : '动作已完成，请回正面对镜头';
}
