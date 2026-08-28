import type { ScanAssistantMessageKind } from "@/store/useScanAssistantStore";

export type CarrierId = "morph" | "ball" | "nimbo" | "twinkle";

export const CARRIER_IDS: CarrierId[] = ["morph", "ball", "nimbo", "twinkle"];

export const CARRIER_LABEL: Record<CarrierId, string> = {
  morph: "MorphOrb（默认）",
  ball: "球球",
  nimbo: "云宝",
  twinkle: "亮亮",
};

export type CarrierState = {
  isDragging: boolean;
  isStreaming: boolean;
  hasMessage: boolean;
  kind?: ScanAssistantMessageKind | null;
};

/** 拖拽随机表情池（每次开始拖拽随机换一个） */
export const DRAG_EMOTION_POOL = ["13", "17", "16", "14", "18"]; // 惊讶/慌张/专注/害羞/无奈
/** 待机随机表情池（待机时轮换）；排除睡眠/疲惫/生气等沉闷项，保持清醒灵动 */
export const IDLE_EMOTION_POOL = [
  "02", // 待机放空
  "03", // 好奇
  "04", // 发呆
  "05", // 加载苏醒
  "10", // 开心
  "11", // 疑惑
  "14", // 害羞
  "16", // 专注
  "18", // 无奈
  "19", // 满意
  "20", // 困惑
];
/** 思考/工作态随机表情池（流式时轮换） */
export const THINKING_EMOTION_POOL = ["30", "31", "32", "36", "37", "40"]; // 思考中/接收任务/处理中忙碌/联网加载/复述回忆/检索
/** 连续无动作进入睡眠的时长 */
export const SLEEP_AFTER_MS = 180_000;
/** 睡眠小憩时长：睡一会儿就自动醒来，避免一直睡死 */
export const SLEEP_DURATION_MS = 20_000;

export function randomPick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 确定性状态 → emotionId（仅「说话内容」部分；拖拽/待机/思考由调用方随机轮换）
 */
export function mapStateToEmotionId(s: CarrierState): string {
  switch (s.kind) {
    case "welcome":
      return "10"; // 开心
    case "alert":
      return "21"; // 生气/提醒
    case "info":
    default:
      return "03"; // 好奇
  }
}

/* ---------- 脚本加载：两套引擎都是 IIFE 全局，按固定顺序注入 ---------- */

const EMOTION_BALL_SCRIPTS = [
  "/vendor/emotion-ball/rings.js",
  "/vendor/emotion-ball/emotions.js",
  "/vendor/emotion-ball/ball.js",
  "/vendor/emotion-ball/engine.js",
];

const MOOD_MATES_SCRIPTS = [
  "/vendor/mood-mates/geometry.js",
  "/vendor/mood-mates/render.js",
  "/vendor/mood-mates/features.js",
  "/vendor/mood-mates/fx.js",
  "/vendor/mood-mates/emotions.js",
  "/vendor/mood-mates/engine.js",
  "/vendor/mood-mates/nimbo.js",
  "/vendor/mood-mates/twinkle.js",
];

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = src;
    s.async = false;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`加载脚本失败: ${src}`));
    document.head.appendChild(s);
  });
}

let emotionBallPromise: Promise<void> | null = null;
export function loadEmotionBall(): Promise<void> {
  if (!emotionBallPromise) {
    emotionBallPromise = EMOTION_BALL_SCRIPTS.reduce(
      (p, src) => p.then(() => loadScript(src)),
      Promise.resolve(),
    );
  }
  return emotionBallPromise;
}

let moodMatesPromise: Promise<void> | null = null;
export function loadMoodMates(): Promise<void> {
  if (!moodMatesPromise) {
    moodMatesPromise = MOOD_MATES_SCRIPTS.reduce(
      (p, src) => p.then(() => loadScript(src)),
      Promise.resolve(),
    );
  }
  return moodMatesPromise;
}
