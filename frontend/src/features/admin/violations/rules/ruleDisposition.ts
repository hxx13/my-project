import type { ViolationRule } from "@/api/domains/studentViolation.api";
import {
  dispositionConfigJsonOf,
  registryDispositionType,
  strategyFromDispositionFields,
  actionsIncludeUnlock,
  type DispositionActionCode,
  type DispositionValue,
} from "../slots/dispositionTypes";

/**
 * ViolationRule → DispositionValue（通用规则与笼架规则共用同一映射）。
 * 优先读规则自带的 dispositionType / dispositionConfigJson；
 * 两列为空（AUTO_STRANDED / MANUAL 等存量规则）时回退到从 interactiveChallenge 反推拼图。
 */
export function ruleToDisposition(f: ViolationRule): DispositionValue {
  const actions: DispositionActionCode[] = [];
  if (f.forbidEnter === 1) actions.push("forbid");
  if (f.interactiveUnlockOnVerify === 1) actions.push("unlock");
  return {
    actions,
    strategy: strategyFromDispositionFields(
      f.dispositionType,
      f.dispositionConfigJson,
      f.interactiveChallenge,
      f.maxEnterSuccess
    ),
    // unlock 与封禁天数互斥：已勾选解禁时不回填天数
    expiry: {
      mode: "RELATIVE",
      days: actionsIncludeUnlock(actions) ? null : (f.expireAfterDays ?? null),
    },
  };
}

/** DispositionValue → Partial<ViolationRule>（通用规则与笼架规则共用同一映射）。 */
export function dispositionToRulePatch(v: DispositionValue): Partial<ViolationRule> {
  const phrase =
    v.strategy.type === "fixed" && v.strategy.puzzle ? v.strategy.challengePhrase.trim() : "";
  const unlock = actionsIncludeUnlock(v.actions);
  return {
    forbidEnter: v.actions.includes("forbid") ? 1 : 0,
    interactiveUnlockOnVerify: unlock ? 1 : 0,
    interactiveChallenge: phrase === "" ? undefined : phrase,
    maxEnterSuccess: v.strategy.type === "unset" ? null : (v.strategy.maxEnterSuccess ?? null),
    expireAfterDays: unlock ? null : v.expiry.mode === "RELATIVE" ? v.expiry.days : null,
    // 策略类型与配置 JSON 的落点：与违规记录同源，复用 dispositionObligationPatch
    ...dispositionObligationPatch(v),
  };
}

/** 开单时附带的 Obligation 策略覆盖字段。 */
export function dispositionObligationPatch(v: DispositionValue): {
  dispositionType: string;
  dispositionConfigJson: string | null;
} {
  return {
    dispositionType: registryDispositionType(v),
    dispositionConfigJson: dispositionConfigJsonOf(v),
  };
}
