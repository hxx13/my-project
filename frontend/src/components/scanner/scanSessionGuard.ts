/**
 * 扫码弹窗会话守卫：抑制同一人弹窗打开后短时间重复刷卡/扫码导致的误触发（尤其进入状态连扫触发自动离开）。
 */

export type ScanAccessAction = "ENTER" | "EXIT";

/** 弹窗打开后，同一人重复刷卡的最短屏蔽间隔 */
const POPUP_OPEN_RESCAN_MS = 30_000;

/** 手动/流程「进入」成功后，禁止同一人再次走识别通道的时长 */
const POST_ENTER_RESCAN_MS = 15_000;

/** 进入成功后，禁止对该人调度「馆内二次扫自动离开」的时长 */
const POST_ENTER_BLOCK_AUTO_EXIT_MS = 15_000;

const normalizeKey = (value: string) => String(value || "").trim().toUpperCase();

type LastExecute = { userId: string; scanKey: string; action: ScanAccessAction; at: number };

let popupUserId: string | null = null;
let popupScanKey: string | null = null;
let popupOpenedAt = 0;

let executePendingUserId: string | null = null;

let lastExecute: LastExecute | null = null;

export function setScanPopupSession(userId: string | null, scanKey: string | null) {
  popupUserId = userId ? normalizeKey(userId) : null;
  popupScanKey = scanKey ? normalizeKey(scanKey) : null;
  popupOpenedAt = popupUserId || popupScanKey ? Date.now() : 0;
}

export function setScanExecutePending(userId: string | null) {
  executePendingUserId = userId ? normalizeKey(userId) : null;
}

export function noteScanExecuteSuccess(userId: string, scanKey: string, action: ScanAccessAction) {
  const uid = normalizeKey(userId);
  const key = normalizeKey(scanKey || userId);
  lastExecute = { userId: uid, scanKey: key, action, at: Date.now() };
  if (action === "ENTER") {
    cancelScheduledAutoExit();
  }
}

export function cancelScheduledAutoExit() {
  // 保留为安全占位函数：原定时器调度已废弃，由手动确认弹窗替代
}

/** 是否允许 DebugNav 馆内二次扫触发自动离开 */
export function canScheduleAutoExit(userId: string, scanKey?: string): boolean {
  const uid = normalizeKey(userId);
  const key = normalizeKey(scanKey || userId);
  if (!lastExecute || lastExecute.userId !== uid) return true;
  if (lastExecute.action !== "ENTER") return true;
  const within = Date.now() - lastExecute.at < POST_ENTER_BLOCK_AUTO_EXIT_MS;
  if (!within) return true;
  // 进入后保护期内：仅当本次扫瞄键与进入时不一致才允许自动离开（换卡场景）
  return lastExecute.scanKey !== key;
}

/**
 * 硬件/输入框发起 analyze 前调用。
 * @param scanKey 本次刷入的工号或卡号（analyze 前的原始键）
 * @param knownUserId 若弹窗已打开且已知人员，可传入以按人拦截
 */
export function tryBeginScanChannel(
  scanKey: string,
  knownUserId?: string | null
): { allow: true } | { allow: false; message: string; blockedUntil: number } {
  const key = normalizeKey(scanKey);
  if (!key) {
    return { allow: false, message: "无效的扫码内容", blockedUntil: 0 };
  }

  const uid = knownUserId ? normalizeKey(knownUserId) : "";
  const now = Date.now();

  if (executePendingUserId && (executePendingUserId === uid || executePendingUserId === key)) {
    return {
      allow: false,
      message: "上一笔进出正在提交，请稍候再扫，避免重复触发",
      blockedUntil: 0,
    };
  }

  // 弹窗打开后 30s 内：同一 scanKey 或同一人员再刷卡 → 拦截
  if (popupScanKey && popupScanKey === key && now - popupOpenedAt < POPUP_OPEN_RESCAN_MS) {
    return {
      allow: false,
      message: "请抬起您的卡片，防止多次刷卡误操作",
      blockedUntil: popupOpenedAt + POPUP_OPEN_RESCAN_MS,
    };
  }

  if (uid && popupUserId && popupUserId === uid && now - popupOpenedAt < POPUP_OPEN_RESCAN_MS) {
    return {
      allow: false,
      message: "请抬起您的卡片，防止多次刷卡误操作",
      blockedUntil: popupOpenedAt + POPUP_OPEN_RESCAN_MS,
    };
  }

  if (lastExecute?.action === "ENTER") {
    const since = now - lastExecute.at;
    if (since < POST_ENTER_RESCAN_MS) {
      if (lastExecute.userId === uid || lastExecute.scanKey === key || lastExecute.userId === key) {
        return {
          allow: false,
          message: "刚完成进入登记，请稍候再扫，避免误触发离开",
          blockedUntil: 0,
        };
      }
    }
  }

  return { allow: true };
}

export function resetScanSessionGuard() {
  setScanPopupSession(null, null);
  setScanExecutePending(null);
  lastExecute = null;
  cancelScheduledAutoExit();
}
