import { acknowledgeViolationInteractive } from "@/api/domains/scanner.api";

export const TWIN_VIOLATION_INTERACTIVE_DONE_EVENT = "twin-violation-interactive-done";

export type ViolationInteractiveAckResult = {
  violationId: number;
  interactiveChallengeVerified: boolean;
  enterLocked: boolean;
  violationExpired?: boolean;
};

/** 交互式确认开启时强制禁入；否则沿用用户勾选 */
export function effectiveViolationForbidEnter(forbid: boolean, interactivePhrase: string): boolean {
  return interactivePhrase.trim().length > 0 ? true : forbid;
}

/** 调用后端永久确认交互拼图，并广播完成事件供弹窗刷新进房按钮 */
export async function ackViolationInteractivePermanent(
  violationId: number,
  userId: string
): Promise<ViolationInteractiveAckResult> {
  const data = await acknowledgeViolationInteractive({ violationId, userId });
  const result: ViolationInteractiveAckResult = {
    violationId: data.violationId,
    interactiveChallengeVerified: Boolean(data.interactiveChallengeVerified),
    enterLocked: Boolean(data.enterLocked),
    violationExpired: Boolean(data.violationExpired),
  };
  window.dispatchEvent(
    new CustomEvent(TWIN_VIOLATION_INTERACTIVE_DONE_EVENT, { detail: result })
  );
  return result;
}
