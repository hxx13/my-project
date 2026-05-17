/**
 * 扫码弹窗会话守卫：抑制同一人短时间重复刷卡/扫码导致的误触发（尤其进入后连扫触发自动离开）。
 */

export type ScanAccessAction = "ENTER" | "EXIT";

/** 弹窗已打开时，同一识别键（工号/卡号）最短间隔 */
const POPUP_OPEN_RESCAN_MS = 5_000;

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

let autoExitTimer: ReturnType<typeof setTimeout> | null = null;

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
  if (autoExitTimer) {
    clearTimeout(autoExitTimer);
    autoExitTimer = null;
  }
}

export function scheduleAutoExit(callback: () => void, delayMs: number) {
  cancelScheduledAutoExit();
  autoExitTimer = setTimeout(() => {
    autoExitTimer = null;
    callback();
  }, delayMs);
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
): { allow: true } | { allow: false; message: string } {
  const key = normalizeKey(scanKey);
  if (!key) {
    return { allow: false, message: "无效的扫码内容" };
  }

  const uid = knownUserId ? normalizeKey(knownUserId) : "";
  const now = Date.now();

  if (executePendingUserId && (executePendingUserId === uid || executePendingUserId === key)) {
    return {
      allow: false,
      message: "上一笔进出正在提交，请稍候再扫，避免重复触发",
    };
  }

  if (popupScanKey && popupScanKey === key && now - popupOpenedAt < POPUP_OPEN_RESCAN_MS) {
    return {
      allow: false,
      message: "该人员弹窗已打开，请勿连续重复刷卡（约 5 秒内忽略重复扫）",
    };
  }

  if (uid && popupUserId && popupUserId === uid && now - popupOpenedAt < POPUP_OPEN_RESCAN_MS) {
    return {
      allow: false,
      message: "该人员弹窗已打开，请勿连续重复扫码",
    };
  }

  if (lastExecute?.action === "ENTER") {
    const since = now - lastExecute.at;
    if (since < POST_ENTER_RESCAN_MS) {
      if (lastExecute.userId === uid || lastExecute.scanKey === key || lastExecute.userId === key) {
        return {
          allow: false,
          message: "刚完成进入登记，请稍候再扫，避免误触发离开",
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
