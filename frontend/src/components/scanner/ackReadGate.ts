/**
 * 确认阅读的门控配置解析（触摸屏与 H5 共用，必须与后端 AckReadDispositionStrategy 同口径）。
 *
 * 缺失/非法一律按「无门控」处理——后端 verify 对未配门控的记录恒通过，
 * 前端若擅自加码会把老数据锁死。
 */
export type AckReadGate = {
  minDwellSeconds: number;
  requireScrollToBottom: boolean;
};

export const NO_ACK_READ_GATE: AckReadGate = {
  minDwellSeconds: 0,
  requireScrollToBottom: false,
};

export function parseAckReadGate(configJson?: string | null): AckReadGate {
  try {
    if (!configJson) return NO_ACK_READ_GATE;
    const cfg = JSON.parse(configJson) as Record<string, unknown>;
    const secs = typeof cfg.minDwellSeconds === "number" ? Math.max(0, cfg.minDwellSeconds) : 0;
    return { minDwellSeconds: secs, requireScrollToBottom: cfg.requireScrollToBottom === true };
  } catch {
    return NO_ACK_READ_GATE;
  }
}

/** 门控是否已满足：停留够久，且（若要求）已滚到底。 */
export function ackReadGateSatisfied(
  gate: AckReadGate,
  elapsedSeconds: number,
  scrolledToBottom: boolean
): boolean {
  if (gate.minDwellSeconds > 0 && elapsedSeconds < gate.minDwellSeconds) return false;
  if (gate.requireScrollToBottom && !scrolledToBottom) return false;
  return true;
}
