import { useEffect, useRef, useState } from "react";
import { MorphOrbLoader } from "@/components/scanner/MorphOrbLoader";
import {
  DRAG_EMOTION_POOL,
  IDLE_EMOTION_POOL,
  SLEEP_AFTER_MS,
  SLEEP_DURATION_MS,
  THINKING_EMOTION_POOL,
  loadEmotionBall,
  loadMoodMates,
  mapStateToEmotionId,
  randomPick,
  type CarrierId,
  type CarrierState,
} from "./carrier";

const IDLE_ROTATE_MS = 6000;
const THINKING_ROTATE_MS = 2500;

type EngineInstance = {
  setEmotion?: (id: string, opts?: { auto?: boolean }) => void;
  destroy?: () => void;
};

type Props = {
  carrier: CarrierId;
  size: number;
  state: CarrierState;
};

/** 引擎载体通用 Hook：挂载时按序加载脚本并 create；emotionId 变化时 setEmotion
 *
 * <p>返回 {@code failed} 让调用方**退回默认球**。引擎脚本是运行时注入 /vendor/ 的，
 * 缺一个整个形象就没了（真机踩过：生产 nginx 限流把 `/vendor/emotion-ball/emotions.js`
 * 拒成 503，串行加载链当场断掉，容器留个空 div —— 看着"球不见了"，界面上却一个字都不说）。
 * 宁可退回一个纯 CSS 的球，也不能什么都没有。
 */
function useEngineCarrier(
  load: () => Promise<void>,
  create: (el: HTMLDivElement) => EngineInstance,
  emotionId: string,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<EngineInstance | null>(null);
  const emotionIdRef = useRef(emotionId);
  const [failed, setFailed] = useState(false);
  emotionIdRef.current = emotionId;

  useEffect(() => {
    let cancelled = false;
    void load()
      .then(() => {
        if (cancelled || !containerRef.current) return;
        const inst = create(containerRef.current);
        instanceRef.current = inst;
        inst.setEmotion?.(emotionIdRef.current);
      })
      .catch((e) => {
        // 别静默：退回默认球的同时留一条日志，否则界面上什么都不说、只能靠翻控制台
        if (cancelled) return;
        console.warn("[scan-assistant] 载体引擎脚本没加载成功，已退回默认球：", e);
        setFailed(true);
      });
    return () => {
      cancelled = true;
      instanceRef.current?.destroy?.();
      instanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    instanceRef.current?.setEmotion?.(emotionId);
  }, [emotionId]);

  return { containerRef, failed };
}

/** 三组随机表情池 + 睡眠计时，解析出当前 emotionId */
function useCarrierEmotion(state: CarrierState): string {
  const [dragEmotion, setDragEmotion] = useState(() => randomPick(DRAG_EMOTION_POOL));
  const [idleEmotion, setIdleEmotion] = useState(() => randomPick(IDLE_EMOTION_POOL));
  const [thinkEmotion, setThinkEmotion] = useState(() => randomPick(THINKING_EMOTION_POOL));
  const [asleep, setAsleep] = useState(false);
  const asleepRef = useRef(false);
  asleepRef.current = asleep;
  const wasDraggingRef = useRef(false);

  const isIdle = !state.isDragging && !state.isStreaming && !state.hasMessage;

  // 每次开始拖拽：随机换一个拖拽表情，并唤醒
  useEffect(() => {
    if (state.isDragging && !wasDraggingRef.current) {
      setDragEmotion(randomPick(DRAG_EMOTION_POOL));
      setAsleep(false);
    }
    wasDraggingRef.current = state.isDragging;
  }, [state.isDragging]);

  // 有消息 / 思考中：唤醒
  useEffect(() => {
    if (state.hasMessage || state.isStreaming) setAsleep(false);
  }, [state.hasMessage, state.isStreaming]);

  // 流式：轮换工作态表情
  useEffect(() => {
    if (!state.isStreaming) return;
    const id = setInterval(() => setThinkEmotion(randomPick(THINKING_EMOTION_POOL)), THINKING_ROTATE_MS);
    return () => clearInterval(id);
  }, [state.isStreaming]);

  // 待机：轮换表情 + 超时睡眠（小憩后自动醒来，不睡死）
  useEffect(() => {
    if (!isIdle) return;
    const sleepTimer = setTimeout(() => setAsleep(true), SLEEP_AFTER_MS);
    const wakeTimer = setTimeout(() => {
      setAsleep(false);
      setIdleEmotion(randomPick(IDLE_EMOTION_POOL));
    }, SLEEP_AFTER_MS + SLEEP_DURATION_MS);
    const rotateTimer = setInterval(() => {
      if (!asleepRef.current) setIdleEmotion(randomPick(IDLE_EMOTION_POOL));
    }, IDLE_ROTATE_MS);
    return () => {
      clearTimeout(sleepTimer);
      clearTimeout(wakeTimer);
      clearInterval(rotateTimer);
    };
  }, [isIdle]);

  if (state.isDragging) return dragEmotion;
  if (state.isStreaming) return thinkEmotion;
  if (state.hasMessage) return mapStateToEmotionId(state);
  if (asleep) return "00"; // 睡眠
  return idleEmotion;
}

function EmotionBallCarrier({ size, emotionId }: { size: number; emotionId: string }) {
  const { containerRef, failed } = useEngineCarrier(
    loadEmotionBall,
    (el) => (window as any).EmotionBall.create(el, { emotion: "02" }),
    emotionId,
  );
  if (failed) {
    return <MorphOrbLoader size={size} />;
  }
  return <div ref={containerRef} style={{ width: size * 100, height: size * 100 }} />;
}

function MoodMatesCarrier({
  size,
  emotionId,
  character,
}: {
  size: number;
  emotionId: string;
  character: "nimbo" | "twinkle";
}) {
  const { containerRef, failed } = useEngineCarrier(
    loadMoodMates,
    (el) => (window as any).MoodMates.create(el, { character, emotion: "02" }),
    emotionId,
  );
  if (failed) {
    return <MorphOrbLoader size={size} />;
  }
  return <div ref={containerRef} style={{ width: size * 100, height: size * 100 }} />;
}

/** 首页智能助手视觉载体分发器 */
export function CarrierVisual({ carrier, size, state }: Props) {
  const emotionId = useCarrierEmotion(state);
  switch (carrier) {
    case "ball":
      return <EmotionBallCarrier size={size} emotionId={emotionId} />;
    case "nimbo":
      return <MoodMatesCarrier size={size} emotionId={emotionId} character="nimbo" />;
    case "twinkle":
      return <MoodMatesCarrier size={size} emotionId={emotionId} character="twinkle" />;
    case "morph":
    default:
      return <MorphOrbLoader size={size} />;
  }
}
