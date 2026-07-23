import type { AnalyzeResponse } from "@/api/types/scanner";
import {
  fetchScanAssistantArchiveWelcome,
  markScanAssistantConversationUsed,
  streamScanAssistantSpeak,
  type ScanAssistantSpeakContext,
} from "@/api/domains/scanAssistant.api";
import type { ScanAssistantMessageKind } from "@/store/useScanAssistantStore";
import { useScanAssistantStore } from "@/store/useScanAssistantStore";
import { isScanPopupSessionActive } from "@/components/scanner/scanSessionGuard";

function roomDisplayName(room: { displayName?: string; name?: string } | undefined): string {
  return (room?.displayName || room?.name || "").trim();
}

/** 从 analyze 结果预打包助手上下文（与后端 compactContext / ContextService 字段对齐） */
export function buildScanAssistantContext(data: AnalyzeResponse): ScanAssistantSpeakContext {
  const name = data.userInfo?.name?.trim() ?? "";
  const userId = data.userInfo?.userId ? String(data.userInfo.userId) : "";
  const group = data.userInfo?.group?.trim() ?? "";
  const department = data.userInfo?.department_name?.trim() ?? "";
  const projectGroup = data.userInfo?.project_group_name?.trim() ?? "";
  const role = data.userInfo?.user_type_names?.trim() ?? "";
  const rpgLevel = data.userInfo?.rpg?.level;
  const allowedRooms = data.allowedRooms ?? [];
  const pendingRooms = data.pendingRooms ?? [];
  const rooms = [...allowedRooms, ...pendingRooms];
  const allowedRoomNames = allowedRooms.map(roomDisplayName).filter(Boolean).slice(0, 8);
  const pendingRoomNames = pendingRooms.map(roomDisplayName).filter(Boolean).slice(0, 8);
  const roomNames = Array.from(new Set(rooms.map(roomDisplayName).filter(Boolean))).slice(0, 5);
  const primaryRoom = roomNames[0] ?? "";
  const violation = data.studentViolationNotice;
  const unbound = data.unboundCardNotice;
  const violationTitle = violation?.violationText?.trim() ?? "";
  const unboundNotice = unbound?.violationText?.trim() ?? "";
  const enterLocked = Boolean(violation?.enterLocked || unbound?.enterLocked);

  return {
    name,
    userId,
    group,
    department,
    projectGroup,
    role,
    rpgLevel,
    currentState: data.currentState,
    primaryRoom,
    roomNames: roomNames.join("、"),
    allowedRoomNames,
    pendingRoomNames,
    violationTitle,
    violationRuleName: violation?.ruleName?.trim() ?? "",
    violationRemainingAllowance: violation?.remainingEnterAllowance ?? undefined,
    violationEnterLocked: violation?.enterLocked,
    unboundNotice,
    unboundEnterLocked: unbound?.enterLocked,
    enterLocked,
    globalUserState: data.globalUserState,
    hasPhysicalCardMapping: data.hasPhysicalCardMapping,
    scanPopupEntryAllowedNow: data.scanPopupEntryAllowedNow,
    entryWindowBlocked: data.scanPopupEntryWindowEnabled && data.scanPopupEntryAllowedNow === false,
  };
}

/** 存档欢迎语是否有效（由后端数据指纹机制负责失效判断，前端不做日期限制） */
function isArchiveWelcomeFresh(updateTime?: string): boolean {
  if (!updateTime?.trim()) return true;
  const updated = new Date(updateTime);
  if (Number.isNaN(updated.getTime())) return true;
  return true; // 后端的 computeDataFingerprint + loadPreGeneratedGreeting 已处理数据变更失效
}

/** welcome 场景无规则回退文案；存档预填或 LLM 流式结果为准 */
function ruleFallback(kind: ScanAssistantMessageKind, ctx: ScanAssistantSpeakContext): string {
  const name = String(ctx.name ?? "").trim();
  if (kind === "alert") {
    const violation = String(ctx.violationTitle ?? "").trim();
    if (violation) return violation;
    if (ctx.enterLocked) return name ? `${name}，当前暂不可进入` : "当前暂不可进入";
    return name ? `${name}，请注意门禁提示` : "请注意门禁提示";
  }
  if (kind === "info") {
    if (ctx.currentState === "INSIDE") return name ? `${name}，您已在场内` : "您已在场内";
    return name ? `已识别 ${name}` : "识别成功";
  }
  return "";
}

let activeAbort: AbortController | null = null;
let activeSpeakGeneration = 0;
/** 当前扫码弹窗绑定的人员；仅换人时触发加载/播报 */
let trackedPopupPersonKey: string | undefined;
/** 扫码人员弹窗是否正在展示（与 DebugNav / ScannerPanel 的 showScanPopup 同步） */
let scanPopupVisible = false;
let bubbleAutoCloseTimer: ReturnType<typeof setTimeout> | null = null;
let bubbleAutoCloseRetryCount = 0;

/** 人员弹窗关闭且无弹窗时，聊天气泡自动收起的倒计时时长 */
export const SCAN_ASSISTANT_BUBBLE_AUTO_CLOSE_MS = 8_000;

/** 当 isScanPopupSessionActive() 阻塞定时器时，轮询重试的最大次数（1s×30=30s上限） */
const BUBBLE_AUTO_CLOSE_RETRY_MAX = 30;
const BUBBLE_AUTO_CLOSE_RETRY_MS = 1_000;

function cancelBubbleAutoCloseCountdown() {
  if (bubbleAutoCloseTimer) {
    clearTimeout(bubbleAutoCloseTimer);
    bubbleAutoCloseTimer = null;
  }
  bubbleAutoCloseRetryCount = 0;
}

function tryScheduleBubbleAutoClose() {
  if (scanPopupVisible) return;

  // 人脸验证等中间态：人员弹窗 UI 暂隐藏，但扫码会话未结束 → 轮询等待会话结束再启动倒计时
  if (isScanPopupSessionActive()) {
    if (bubbleAutoCloseRetryCount < BUBBLE_AUTO_CLOSE_RETRY_MAX) {
      bubbleAutoCloseRetryCount += 1;
      bubbleAutoCloseTimer = setTimeout(tryScheduleBubbleAutoClose, BUBBLE_AUTO_CLOSE_RETRY_MS);
    }
    return;
  }

  const store = useScanAssistantStore.getState();
  if (!store.activeMessage) return;

  bubbleAutoCloseTimer = setTimeout(() => {
    bubbleAutoCloseTimer = null;
    if (scanPopupVisible) return;
    if (isScanPopupSessionActive()) return;
    dismissScanAssistantBubble();
  }, SCAN_ASSISTANT_BUBBLE_AUTO_CLOSE_MS);
}

function scheduleBubbleAutoCloseCountdown() {
  cancelBubbleAutoCloseCountdown();
  tryScheduleBubbleAutoClose();
}

/**
 * 与首页扫码人员弹窗可见性同步。
 * 弹窗打开：取消自动关闭；弹窗由开→关：启动倒计时（仅无弹窗时生效）。
 */
export function notifyScanPopupVisible(visible: boolean) {
  if (visible) {
    scanPopupVisible = true;
    cancelBubbleAutoCloseCountdown();
    // 弹窗打开时关闭旧气泡，为新内容腾出空间
    const store = useScanAssistantStore.getState();
    if (store.activeMessage && !store.activeMessage.isStreaming) {
      dismissScanAssistantBubble();
    }
    return;
  }

  scanPopupVisible = false;
  trackedPopupPersonKey = undefined;
  // 无论之前状态如何，退出弹窗都启动自动关闭倒计时
  scheduleBubbleAutoCloseCountdown();
}

/** @deprecated 请改用 notifyScanPopupVisible(false) */
export function onScanPopupClosed() {
  notifyScanPopupVisible(false);
}

/** 当前扫码弹窗绑定的人员 key（userId） */
export function getTrackedScanPopupPersonKey(): string | undefined {
  return trackedPopupPersonKey;
}

/** 扫码弹窗关闭 / 会话结束时：中止 LLM 流并清空气泡（退出动画由 transition hook 处理） */
export function dismissScanAssistantBubble() {
  cancelBubbleAutoCloseCountdown();
  activeSpeakGeneration += 1;
  if (activeAbort) {
    activeAbort.abort();
    activeAbort = null;
  }
  useScanAssistantStore.getState().dismissMessage();
}

/** 用户手动收起气泡：取消弹窗关闭后的自动倒计时 */
export function collapseScanAssistantBubble() {
  cancelBubbleAutoCloseCountdown();
  useScanAssistantStore.getState().collapseBubble();
}

/**
 * 调用 LLM 流式播报；alert/info 失败时可回退规则文案。
 * welcome：有 per_user 存档则预填气泡；否则 streamSpeak 实时生成并 persistScanWelcomeToArchive 写入存档。
 * 保存后仅更新助手气泡，禁止整表 load — post-save-no-full-refresh.mdc
 */
export async function speakScanAssistantFromAnalyze(
  data: AnalyzeResponse,
  kind: ScanAssistantMessageKind = "welcome",
) {
  const ctx = buildScanAssistantContext(data);
  const store = useScanAssistantStore.getState();
  const personKey = (ctx.userId != null ? String(ctx.userId).trim() : "") || undefined;

  const generation = ++activeSpeakGeneration;
  const isStale = () => generation !== activeSpeakGeneration;

  if (activeAbort) {
    activeAbort.abort();
    activeAbort = null;
  }
  activeAbort = new AbortController();
  const signal = activeAbort.signal;

  const speechMsgId = kind === "welcome" ? undefined : undefined; // 稍后从 archive 中获取
  store.beginStreamMessage(kind, personKey);
  let streamedText = "";

  if (personKey && kind === "welcome") {
    try {
      const archive = await fetchScanAssistantArchiveWelcome(ctx);
      if (isStale() || signal.aborted) return;
      const archivedText = archive.hasWelcome ? (archive.text ?? "").trim() : "";
      const archiveUsable = archivedText && isArchiveWelcomeFresh(archive.updateTime);
      if (archiveUsable) {
        streamedText = archivedText;
        store.setStreamText(archivedText);
        // 携带 messageId 以便自动播放服务端语音
        const current = useScanAssistantStore.getState().activeMessage;
        if (current && archive.lastAssistantMessageId) {
          useScanAssistantStore.getState().finishStreamMessage(archivedText);
          // finishStreamMessage 不保留 speechMessageId，需要重新设置
          useScanAssistantStore.setState((s) => ({
            activeMessage: s.activeMessage ? { ...s.activeMessage, speechMessageId: archive.lastAssistantMessageId } : null,
          }));
        } else {
          store.finishStreamMessage(archivedText);
        }
        void markScanAssistantConversationUsed(ctx, "auto");
        if (activeAbort?.signal === signal) {
          activeAbort = null;
        }
        return;
      }
    } catch {
      // 存档读取/现场生成失败不阻断流式播报
    }
  }

  const resolveExistingText = () => {
    const current = useScanAssistantStore.getState().activeMessage;
    return (streamedText || current?.text || "").trim();
  };

  const finishWithBestText = (preferred?: string) => {
    if (isStale() || signal.aborted) return;
    const text = (preferred ?? resolveExistingText()).trim();
    const current = useScanAssistantStore.getState().activeMessage;
    if (text) {
      if (current?.isStreaming) {
        store.finishStreamMessage(text);
      } else {
        store.speak(text, kind, personKey);
      }
      return;
    }
    if (kind === "welcome") {
      store.cancelStreamMessage();
      return;
    }
    const fallbackText = ruleFallback(kind, ctx);
    if (fallbackText) {
      if (current?.isStreaming) {
        store.finishStreamMessage(fallbackText);
      } else {
        store.speak(fallbackText, kind, personKey);
      }
    } else {
      store.cancelStreamMessage();
    }
  };

  const finalizeStreamIfNeeded = () => {
    if (isStale() || signal.aborted) return;
    const current = useScanAssistantStore.getState().activeMessage;
    if (!current?.isStreaming) return;
    finishWithBestText();
  };

  try {
    await streamScanAssistantSpeak(
      kind,
      ctx,
      {
        onStarted: () => {
          if (isStale() || signal.aborted) return;
          useScanAssistantStore.getState().setDockVisible(true);
        },
        onDelta: (text, isRuleFallback) => {
          if (isStale() || signal.aborted) return;
          if (isRuleFallback && kind === "welcome") {
            return;
          }
          streamedText += text;
          store.appendStreamDelta(text);
        },
        onDone: (payload) => {
          if (isStale() || signal.aborted) return;
          const incoming = (payload.text ?? "").trim();
          if (incoming) {
            streamedText = incoming;
            store.finishStreamMessage(incoming);
            return;
          }
          finishWithBestText();
        },
        onError: () => {
          finishWithBestText();
        },
      },
      { signal },
    );
    finalizeStreamIfNeeded();
  } catch {
    if (isStale() || signal.aborted) return;
    finishWithBestText();
  } finally {
    if (activeAbort?.signal === signal) {
      activeAbort = null;
    }
  }
}

/** 载体点击展开气泡时：标记一次 click 使用（后端每次计数） */
export async function expandScanAssistantFromCarrierClick(personKey: string) {
  cancelBubbleAutoCloseCountdown();
  const store = useScanAssistantStore.getState();
  if (!personKey || !store.activeMessage) return;
  if (store.activeMessage.personKey && store.activeMessage.personKey !== personKey) return;
  store.expandBubble();
  try {
    await markScanAssistantConversationUsed({ userId: personKey }, "click");
  } catch {
    /* 标记失败不阻断展开 */
  }
}

/**
 * 扫码弹窗识别到具体人员时调用。
 * 仅当 popup 绑定人员变化时加载存档并播报；同一人重复刷卡不重复触发。
 */
export function greetScanAssistantUser(data: AnalyzeResponse) {
  const personKey = data.userInfo?.userId ? String(data.userInfo.userId) : undefined;
  if (!personKey || data.success === false) return;
  if (personKey === trackedPopupPersonKey) return;

  trackedPopupPersonKey = personKey;

  // 新人员/重开弹窗：先关闭旧气泡再加载新内容
  const { activeMessage } = useScanAssistantStore.getState();
  if (activeMessage) {
    dismissScanAssistantBubble();
  }

  void speakScanAssistantFromAnalyze(data, "welcome");
}
