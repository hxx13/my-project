/** 人脸识别全局统一参数 — 所有组件引用同一份配置，确保阈值一致 */

/** 人脸比对 MATCH 阈值（路线 B：仅 PIP 等仍用 face-api 的客户端路径保留；门禁以服务端为准） */
export const FACE_MATCH_THRESHOLD = 0.82;

/** PIP 持续监测非本人判定：sim < 此值触发告警（略低于 MATCH 避免误报） */
export const PIP_MISMATCH_THRESHOLD = 0.76;

/** 主验证明确不匹配：sim < 此值视为强烈非本人信号（与 REJECT 取更严逻辑） */
export const FACE_MISMATCH_THRESHOLD = 0.45;

/**
 * 门禁 1:1 快速拒绝线（活体后比对）：sim < 此值 1 帧即失败。
 */
export const FACE_VERIFY_REJECT_THRESHOLD = 0.75;

/**
 * 眨眼前快速拒绝线：仅拦截「明显非同人」，避免 70% 左右灰区（底库角度/光照偏差）误杀。
 * 林安顺类案例 sim≈0.71 应允许进入眨眼，眨眼后多帧再比对。
 */
export const FACE_VERIFY_PRE_BLINK_REJECT_THRESHOLD = 0.55;

/** 已进入比对阶段：连续 N 帧 sim < MATCH 仍未通过则判失败 */
export const FACE_VERIFY_BELOW_MATCH_FRAMES = 4;

/** 门禁通过：连续 N 帧 sim >= MATCH（且转头后已回正）才判成功，抑制单帧误通过（每帧 1 次 /api/face/verify，非 bug） */
export const FACE_VERIFY_MATCH_CONSECUTIVE_FRAMES = 3;

/** 门禁比对阶段：鼻尖水平偏移小于此值视为回正（侧脸对底库相似度不可靠） */
export const FACE_GATE_FRONTAL_NOSE_OFFSET_MAX = 0.06;

/** 进入比对后，低于 MATCH 持续超过此毫秒仍未通过则判失败（灰区兜底） */
export const FACE_VERIFY_MATCH_PHASE_MAX_MS = 2_000;

/** 眨眼检测：眼睛闭合阈值（blendshape score > 此值判定闭眼）— 绝对下限，与自适应检测配合 */
export const BLINK_CLOSE_THRESHOLD = 0.35;

/** 眨眼检测：眼睛睁开阈值（blendshape score < 此值判定睁眼）— 仅 FaceEnrollment 等旧路径保留 */
export const BLINK_OPEN_THRESHOLD = 0.15;

/** 自适应眨眼：校准帧数（约 1.2s @100ms），采集个人常态睁眼水平 */
export const BLINK_OPEN_BASELINE_FRAMES = 12;

/** 相对闭眼：score 需高于个人基线此增量 */
export const BLINK_RELATIVE_CLOSE_DELTA = 0.09;

/** 相对睁眼：从闭眼峰值回落此增量即视为睁眼 */
export const BLINK_RELATIVE_OPEN_DELTA = 0.07;

/** 闭眼绝对下限（基线极低时兜底） */
export const BLINK_CLOSE_THRESHOLD_MIN = 0.18;

/** 门禁验证：等待眨眼超过此毫秒且人脸在场 → 降级跳过眨眼，直接比对 */
export const BLINK_LIVENESS_FALLBACK_MS = 5_000;

/** 活体：判定「照片抖动」所需的最小脸框位移（相对脸宽） */
export const LIVENESS_PHOTO_SLIDE_MIN_MOTION = 0.035;

/** 活体：地标帧间残差低于此（相对脸宽）视为刚性平移 */
export const LIVENESS_MAX_LANDMARK_RESIDUAL_RATIO = 0.022;

/** 录入质检失败：自动重新录入前的等待（毫秒） */
export const ENROLL_AUTO_RETRY_DELAY_MS = 4_000;

/** 录入质检失败：自动重试次数上限（之后须手动点「重新录入」） */
export const ENROLL_AUTO_RETRY_MAX = 1;

/** PIP 持续监测检测间隔（毫秒）；身份以服务端 source=pip 比对为准 */
export const PIP_DETECT_INTERVAL = 2000;

/** PIP 人脸丢失倒计时（秒） */
export const PIP_LOST_SECONDS = 10;

/** 个人中心 PIN 键盘上方的人脸预览窗尺寸 */
export const COMPACT_FACE_WINDOW = { width: 148, height: 124, gap: 12 } as const;

/** 前置摄像头预览水平镜像（照镜子效果；face-api/MediaPipe 仍采样原始帧） */
export const FACE_CAMERA_MIRROR_CLASS = '-scale-x-100';

/**
 * Portal 人脸弹窗遮罩：实色半透明，不用 backdrop-blur（避免夜空/扫码背景下发虚）
 */
export const FACE_MODAL_BACKDROP_CLASS =
  'bg-[color-mix(in_srgb,black_58%,transparent)] backdrop-blur-none';

/**
 * Portal 人脸弹窗卡片：实色底（不依赖夜空高透 surface 或未定义的 surface-card）
 */
export const FACE_MODAL_SHELL_CLASS =
  'bg-[color-mix(in_srgb,var(--app-color-scan-student-bg)_88%,black)]';

/** 弹窗次要按钮底色 */
export const FACE_MODAL_BTN_SECONDARY_CLASS =
  'bg-[color-mix(in_srgb,var(--app-color-scan-profile-bg)_72%,black)]';

/** 门禁人脸验证最大重试次数（含首轮共 N 次机会；2=最多识别 2 轮） */
export const FACE_VERIFY_MAX_RETRIES = 2;

/** 灵动岛失败态最短展示时长（毫秒）；下一轮扫描须在此之后开始 */
export const FACE_ISLAND_FAILED_HOLD_MS = 2_200;

/**
 * 各轮失败后的自动重试缓冲（毫秒）。
 * [0]=首轮失败后距第 2 次（仅 2 轮时只需一项）。
 */
const FACE_AUTO_RETRY_DELAYS_MS = [3_000] as const;

/** 第 failedAttemptIndex 次失败（0 起）后，等待多久再自动开始下一轮 */
export function faceAutoRetryDelayMs(failedAttemptIndex: number): number {
  const tier =
    FACE_AUTO_RETRY_DELAYS_MS[failedAttemptIndex] ??
    FACE_AUTO_RETRY_DELAYS_MS[FACE_AUTO_RETRY_DELAYS_MS.length - 1];
  return Math.max(tier, FACE_ISLAND_FAILED_HOLD_MS + 600);
}

/** 两次验证均失败后，重新录入/重刷提示自动消失时长（毫秒） */
export const FACE_MAX_RETRIES_PROMPT_MS = 15_000;

/** 是否已用尽门禁人脸验证次数（灵动岛已展示最终失败，无需再弹 Toast） */
export function isFaceVerifyExhausted(
  faceStatus: string | undefined,
  retryCount: number,
): boolean {
  if (faceStatus === 'maxRetries') return true;
  if (retryCount < FACE_VERIFY_MAX_RETRIES - 1) return false;
  return faceStatus === 'mismatched' || faceStatus === 'timeout';
}

/** 摄像头无业务活动超过此毫秒则全局强制回收（PIP 检测循环会周期性 touch 续期） */
export const FACE_CAMERA_IDLE_RELEASE_MS = 10 * 60 * 1000;

// ---- 录入质检（正脸 / 睁眼 / 清晰 / 无遮挡；每人 3–6 张）----

/** 每人底库最少张数 */
export const ENROLL_MIN_PHOTOS = 3;

/** 每人底库最多张数 */
export const ENROLL_MAX_PHOTOS = 6;

/** 录入：正脸鼻尖偏移上限 */
export const ENROLL_FRONTAL_NOSE_OFFSET_MAX = 0.07;

/** 录入：睁眼 EAR 下限 */
export const ENROLL_OPEN_EYE_EAR_MIN = 0.17;

/** 录入：人脸检测置信度下限 */
export const ENROLL_MIN_DETECTION_SCORE = 0.5;

/** 录入：人脸宽度占画面比例下限（过小易糊） */
export const ENROLL_MIN_FACE_WIDTH_RATIO = 0.22;

/** 录入：Laplacian 方差下限（低于此视为模糊） */
export const ENROLL_MIN_BLUR_VARIANCE = 90;

/** 录入：帧间一致性下限，低于此视为侧脸/异帧剔除 */
export const ENROLL_PAIRWISE_MIN_SIM = 0.68;

/** 高安全区：互配较低线（严模式 pair_min 默认；常规帧间筛选仍用 ENROLL_PAIRWISE_MIN_SIM） */
export const ENROLL_STRICT_PAIR_MIN_SIM = 0.72;

/** 高安全区：至少 N 张与其它合格照互配超过较低线 */
export const ENROLL_STRICT_MIN_COUNT_ABOVE_PAIR = 2;

/** 高安全区：最高互配线（与门禁 MATCH 参考对齐，默认 0.82；运行期以 face.enroll_strict.max_pair_sim 为准） */
export const ENROLL_STRICT_MAX_PAIR_SIM = 0.82;

/** 高安全区：各张最高互配的前两名均值下限 */
export const ENROLL_STRICT_TOP2_AVG_MIN = 0.75;

/** face 配置 key：录入严模式开关（附加互配质检，阈值见 face.enroll_strict.*） */
export const FACE_ENROLL_STRICT_CONFIG_KEY = 'face.enroll_strict.enabled';

/** 转头：鼻尖水平偏移阈值 */
export const FACE_CHALLENGE_TURN_OFFSET = 0.08;

/** 动作保持时长（毫秒） */
export const FACE_CHALLENGE_HOLD_MS = 800;

/** 录入单步动作超时（秒） */
export const FACE_ENROLL_CHALLENGE_TIMEOUT_S = 10;

/** 门禁非眨眼动作超时（毫秒） */
export const FACE_GATE_POSE_CHALLENGE_TIMEOUT_MS = 6_000;

/** 空闲看门狗轮询间隔（毫秒） */
export const FACE_CAMERA_IDLE_CHECK_MS = 60 * 1000;

/**
 * 门禁 1:1 人脸核验节奏
 * - 单次端到端目标：约 8–15s（含活体 + 服务端比对）
 * - 单次硬超时：16s（失败后按轮次缓冲再自动重试）
 */
/** 单次验证硬超时（毫秒） */
export const FACE_VERIFY_TIMEOUT_MS = 16_000;

/** 人脸检测循环间隔（毫秒），约 10Hz */
export const FACE_VERIFY_DETECT_INTERVAL_MS = 100;

/** 视频就绪后启动检测的延迟（毫秒）；0 = 立即开跑 */
export const FACE_VERIFY_DETECT_START_DELAY_MS = 0;

/** 连续无人脸超过此毫秒则判超时 */
export const FACE_VERIFY_NO_FACE_TIMEOUT_MS = 2_500;

/** @deprecated 已由 FACE_VERIFY_REJECT_THRESHOLD 单帧拒绝取代；保留常量避免外部引用断裂 */
export const FACE_VERIFY_MISMATCH_FRAMES = 1;

/** @deprecated 请用 faceAutoRetryDelayMs；保留避免外部硬编码引用断裂 */
export const FACE_AUTO_RETRY_DELAY_MS = faceAutoRetryDelayMs(0);

/** 灵动岛失败文案：低于拒绝线立即失败 vs 超时兜底 */
export function faceVerifyFailedLabel(
  status: 'mismatched' | 'timeout' | 'noFace' | 'maxRetries' | string | undefined,
): string {
  if (status === 'mismatched') return '识别未通过';
  if (status === 'timeout' || status === 'noFace') return '验证超时';
  if (status === 'maxRetries') return '验证失败';
  return '验证失败';
}
