import { acknowledgeViolationInteractive } from "@/api/domains/scanner.api";
import type { StudentViolationRow } from "@/api/domains/studentViolation.api";
import type { AnalyzeResponse, StudentViolationNotice } from "@/api/types/scanner";

export const TWIN_VIOLATION_INTERACTIVE_DONE_EVENT = "twin-violation-interactive-done";

export type ViolationInteractiveAckResult = {
  violationId: number;
  interactiveChallengeVerified: boolean;
  enterLocked: boolean;
  violationExpired?: boolean;
};

/** @deprecated 与 ViolationInteractiveAckResult 同构，保留别名 */
export type InteractiveVerifiedPatch = ViolationInteractiveAckResult;

function patchNotice(
  notice: StudentViolationNotice | undefined,
  patch: ViolationInteractiveAckResult
): StudentViolationNotice | undefined {
  if (!notice || notice.id !== patch.violationId) return notice;
  if (patch.violationExpired) return undefined;
  return {
    ...notice,
    enterLocked: patch.enterLocked,
    interactiveChallengeVerified: patch.interactiveChallengeVerified,
    pastExpireAwaitingInteractive: false,
  };
}

/** 交互验证 ack 后合并进 analyze 结果，刷新进房按钮锁定态（post-save-no-full-refresh.mdc） */
export function mergeViolationInteractiveAckIntoResult(
  prev: AnalyzeResponse | null,
  patch: ViolationInteractiveAckResult
): AnalyzeResponse | null {
  if (!prev) return prev;
  const studentViolationNotice = patchNotice(prev.studentViolationNotice, patch);
  const unboundCardNotice = patchNotice(prev.unboundCardNotice, patch);
  return {
    ...prev,
    studentViolationNotice,
    unboundCardNotice,
  };
}

/** 手动新建/编辑：填写交互式短语时须同步立即禁入；可仅开禁入、不开交互 */
export function resolveManualViolationForbidEnter(
  forbidEnter: boolean,
  interactivePhrase: string | null | undefined
): boolean {
  return forbidEnter || Boolean(interactivePhrase?.trim());
}

/** @deprecated 请改用 resolveManualViolationForbidEnter */
export function effectiveViolationForbidEnter(forbid: boolean, interactivePhrase: string): boolean {
  return resolveManualViolationForbidEnter(forbid, interactivePhrase);
}

/** 立即禁入开关（forbid_enter 字段，与交互式确认独立） */
export function violationImmediateForbidEnter(forbidEnter?: number | boolean | null): boolean {
  return Boolean(forbidEnter);
}

/** 计算「当前禁入」所需字段（均可选，便于列表行与扫码 notice 共用） */
export type ViolationEnterLockedInput = Pick<
  StudentViolationRow,
  | "status"
  | "forbidEnter"
  | "interactiveChallenge"
  | "interactiveChallengeVerifiedAt"
  | "maxEnterSuccess"
  | "enterSuccessCount"
  | "enterLocked"
>;

/** 当前是否禁入（优先 API enterLocked，否则按后端 computeEnterLocked 口径推算） */
export function violationEnterLocked(row: ViolationEnterLockedInput): boolean {
  if (row.enterLocked != null) return Boolean(row.enterLocked);
  if (row.status !== "ACTIVE") return false;
  const max = row.maxEnterSuccess;
  const used = row.enterSuccessCount ?? 0;
  if (max != null && used >= max) return true;
  if (row.interactiveChallenge?.trim() && !row.interactiveChallengeVerifiedAt) return true;
  return violationImmediateForbidEnter(row.forbidEnter);
}

/** 调用后端永久确认交互拼图，并广播完成事件供弹窗刷新进房按钮 */
export async function ackViolationInteractivePermanent(
  violationId: number,
  userId: string,
  answer: string
): Promise<ViolationInteractiveAckResult> {
  const data = await acknowledgeViolationInteractive({ violationId, userId, answer });
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
