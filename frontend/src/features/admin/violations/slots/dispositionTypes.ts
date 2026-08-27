import type {
  CreateStudentViolationPayload,
  StudentViolationRow,
  UpdateStudentViolationPayload,
} from "@/api/domains/studentViolation.api";

/**
 * 抗返工插槽① · 处置字段的对外契约。
 * 期 3：策略分支可扩展（fixed / quiz / ack_read）；导出签名与三转换函数保持稳定。
 *
 * fixed.puzzle 显式区分 SHOW_ONLY / ACK_PUZZLE，避免「空短语 ↔ SHOW_ONLY」把拼图输入框锁死。
 */

export type DispositionActionCode = "forbid" | "every" | "unlock";

export type ExpiryValue =
  | { mode: "RELATIVE"; days: number | null }
  | { mode: "KEEP" }
  | { mode: "CLEAR" };

/** 策略判别联合。unset = 开单未选；fixed.puzzle 区分仅展示 vs 拼图短语。 */
export type DispositionStrategy =
  | { type: "unset" }
  | { type: "fixed"; challengePhrase: string; maxEnterSuccess: number | null; puzzle: boolean }
  | {
      type: "quiz";
      questionBankId: string;
      drawCount: number;
      passCount: number;
      maxAttempts: number;
      maxEnterSuccess: number | null;
    }
  | { type: "ack_read"; maxEnterSuccess: number | null }
  | { type: "signature"; preamble: string; maxEnterSuccess: number | null };

export type DispositionValue = {
  actions: DispositionActionCode[];
  expiry: ExpiryValue;
  strategy: DispositionStrategy;
};

export type DispositionCapability = {
  allowActions: DispositionActionCode[];
  allowChallenge: boolean;
  allowMaxEnter: boolean;
  allowExpire: boolean;
};

export const DISPOSITION_FULL: DispositionCapability = {
  allowActions: ["forbid", "every", "unlock"],
  allowChallenge: true,
  allowMaxEnter: true,
  allowExpire: true,
};

export const DISPOSITION_RULE_LEVEL: DispositionCapability = {
  allowActions: ["forbid", "unlock"],
  allowChallenge: true,
  allowMaxEnter: true,
  allowExpire: true,
};

/**
 * 除「仅展示」(SHOW_ONLY) 与未选外，交互类策略无禁入则沦为摆设。
 * 选中此类策略或尝试去掉 forbid 时，保证 actions 含 forbid；仅展示不强制。
 */
export function strategyRequiresForbid(strategy: DispositionStrategy): boolean {
  if (strategy.type === "unset") return false;
  if (strategy.type === "fixed") return strategy.puzzle;
  return true; // ack_read / quiz / signature
}

export function ensureForbidForStrategy(
  actions: DispositionActionCode[],
  strategy: DispositionStrategy
): DispositionActionCode[] {
  if (!strategyRequiresForbid(strategy)) return actions;
  if (actions.includes("forbid")) return actions;
  return [...actions, "forbid"];
}

/** 是否勾选「验证后解禁」。到期时间与验证后解禁可并存（到期后已验证者自动消弹窗）。 */
export function actionsIncludeUnlock(actions: readonly DispositionActionCode[]): boolean {
  return actions.includes("unlock");
}

/** 映射到后端 disposition_type 注册表编码；unset 返回空串供 Select 占位。 */
export function registryDispositionType(v: DispositionValue): string {
  switch (v.strategy.type) {
    case "unset":
      return "";
    case "quiz":
      return "QUIZ";
    case "ack_read":
      return "ACK_READ";
    case "signature":
      return "SIGNATURE";
    case "fixed":
      return v.strategy.puzzle ? "ACK_PUZZLE" : "SHOW_ONLY";
    default: {
      const _exhaustive: never = v.strategy;
      return _exhaustive;
    }
  }
}

export function dispositionConfigJsonOf(v: DispositionValue): string | null {
  switch (v.strategy.type) {
    case "unset":
      return null;
    case "quiz":
      return JSON.stringify({
        questionBankId: v.strategy.questionBankId || "default",
        drawCount: v.strategy.drawCount,
        passCount: v.strategy.passCount,
        maxAttempts: v.strategy.maxAttempts,
      });
    case "fixed": {
      if (!v.strategy.puzzle) return null;
      const phrase = v.strategy.challengePhrase.trim();
      return phrase ? JSON.stringify({ phrase }) : null;
    }
    case "ack_read":
      return null;
    case "signature":
      return JSON.stringify({ preamble: v.strategy.preamble || "" });
    default: {
      const _exhaustive: never = v.strategy;
      return _exhaustive;
    }
  }
}

function maxEnterOf(v: DispositionValue): number | null {
  if (v.strategy.type === "unset") return null;
  return v.strategy.maxEnterSuccess;
}

function challengeOf(v: DispositionValue): string | null {
  if (v.strategy.type !== "fixed" || !v.strategy.puzzle) return null;
  const t = v.strategy.challengePhrase.trim();
  return t === "" ? null : t;
}

/** 开单提交前校验；返回错误文案，通过则 null。 */
export function validateDispositionForCreate(v: DispositionValue): string | null {
  if (v.strategy.type === "unset") return "请选择处置策略";
  if (v.strategy.type === "fixed" && v.strategy.puzzle && !v.strategy.challengePhrase.trim()) {
    return "请填写拼图短语";
  }
  return null;
}

type CreateDispositionFields = Pick<
  CreateStudentViolationPayload,
  | "forbidEnter"
  | "showNoticeEveryScan"
  | "interactiveUnlockOnVerify"
  | "interactiveChallenge"
  | "maxEnterSuccess"
  | "expireAfterDays"
  | "dispositionType"
  | "dispositionConfigJson"
>;

type UpdateDispositionFields = Pick<
  UpdateStudentViolationPayload,
  | "forbidEnter"
  | "showNoticeEveryScan"
  | "interactiveUnlockOnVerify"
  | "interactiveChallenge"
  | "maxEnterSuccess"
  | "expireMode"
  | "expireAfterDays"
  | "dispositionType"
  | "dispositionConfigJson"
>;

export function toCreateDisposition(v: DispositionValue): CreateDispositionFields {
  if (v.expiry.mode !== "RELATIVE") {
    throw new Error("开单只接受 RELATIVE 到期方式，不接受 KEEP/CLEAR");
  }
  if (v.strategy.type === "unset") {
    throw new Error("请选择处置策略");
  }
  const unlock = actionsIncludeUnlock(v.actions);
  return {
    forbidEnter: v.actions.includes("forbid"),
    showNoticeEveryScan: v.actions.includes("every"),
    interactiveUnlockOnVerify: unlock,
    interactiveChallenge: challengeOf(v),
    maxEnterSuccess: maxEnterOf(v),
    // 到期时间与验证后解禁可并存（开单只接受 RELATIVE）
    expireAfterDays: v.expiry.days,
    dispositionType: registryDispositionType(v),
    dispositionConfigJson: dispositionConfigJsonOf(v),
  };
}

export function toUpdateDisposition(v: DispositionValue): UpdateDispositionFields {
  if (v.strategy.type === "unset") {
    throw new Error("请选择处置策略");
  }
  const unlock = actionsIncludeUnlock(v.actions);
  return {
    forbidEnter: v.actions.includes("forbid"),
    showNoticeEveryScan: v.actions.includes("every"),
    interactiveUnlockOnVerify: unlock,
    interactiveChallenge: challengeOf(v),
    maxEnterSuccess: maxEnterOf(v),
    expireMode: v.expiry.mode,
    expireAfterDays: v.expiry.mode === "RELATIVE" ? v.expiry.days : null,
    dispositionType: registryDispositionType(v),
    dispositionConfigJson: dispositionConfigJsonOf(v),
  };
}

export function fromDispositionRow(row: StudentViolationRow): DispositionValue {
  const actions: DispositionActionCode[] = [];
  if (row.forbidEnter) actions.push("forbid");
  if (row.showNoticeEveryScan) actions.push("every");
  if (row.interactiveUnlockOnVerify) actions.push("unlock");

  const dtype = (row.dispositionType ?? "").toUpperCase();
  if (dtype === "QUIZ") {
    let questionBankId = "default";
    let drawCount = 3;
    let passCount = 2;
    let maxAttempts = 3;
    try {
      if (row.dispositionConfigJson) {
        const cfg = JSON.parse(row.dispositionConfigJson) as Record<string, unknown>;
        if (typeof cfg.questionBankId === "string") questionBankId = cfg.questionBankId;
        if (typeof cfg.drawCount === "number") drawCount = cfg.drawCount;
        if (typeof cfg.passCount === "number") passCount = cfg.passCount;
        if (typeof cfg.maxAttempts === "number") maxAttempts = cfg.maxAttempts;
      }
    } catch {
      /* keep defaults */
    }
    return {
      actions,
      strategy: {
        type: "quiz",
        questionBankId,
        drawCount,
        passCount,
        maxAttempts,
        maxEnterSuccess: row.maxEnterSuccess ?? null,
      },
      expiry: { mode: "KEEP" },
    };
  }
  if (dtype === "ACK_READ") {
    return {
      actions,
      strategy: { type: "ack_read", maxEnterSuccess: row.maxEnterSuccess ?? null },
      expiry: { mode: "KEEP" },
    };
  }
  if (dtype === "SIGNATURE") {
    let preamble = "";
    try {
      if (row.dispositionConfigJson) {
        const cfg = JSON.parse(row.dispositionConfigJson) as { preamble?: string };
        preamble = cfg.preamble ?? "";
      }
    } catch {
      /* ignore */
    }
    return {
      actions,
      strategy: { type: "signature", preamble, maxEnterSuccess: row.maxEnterSuccess ?? null },
      expiry: { mode: "KEEP" },
    };
  }
  if (dtype === "SHOW_ONLY") {
    return {
      actions,
      strategy: {
        type: "fixed",
        challengePhrase: "",
        maxEnterSuccess: row.maxEnterSuccess ?? null,
        puzzle: false,
      },
      expiry: { mode: "KEEP" },
    };
  }

  const phrase = (row.interactiveChallenge ?? "").trim();
  const puzzle = dtype === "ACK_PUZZLE" || phrase.length > 0;
  return {
    actions,
    strategy: {
      type: "fixed",
      challengePhrase: row.interactiveChallenge ?? "",
      maxEnterSuccess: row.maxEnterSuccess ?? null,
      puzzle,
    },
    expiry: { mode: "KEEP" },
  };
}

/** 与编辑器策略下拉一致的展示名。 */
export const DISPOSITION_STRATEGY_LABEL: Record<string, string> = {
  SHOW_ONLY: "仅展示",
  ACK_READ: "确认阅读",
  ACK_PUZZLE: "拼图短语",
  QUIZ: "答题",
  SIGNATURE: "签名确认",
};

const ACTION_LABEL: Record<DispositionActionCode, string> = {
  forbid: "立即禁入",
  every: "每次扫码提示",
  unlock: "验证后解禁",
};

/**
 * 到期列/详情副文案：无日历 expireAt 时，勿一律写成「需人工解除」。
 * 勾选验证解禁或拼图策略时，解除路径是自助验证，不是后台人工。
 */
export function dueSecondaryLabel(row: StudentViolationRow): string {
  if (row.status === "CLEARED" || row.status === "PROCESSED") return "已解除";
  if (row.status === "EXPIRED") return "已过期";
  if (row.expireAt) {
    const remain = Math.ceil((new Date(row.expireAt).getTime() - Date.now()) / 86_400_000);
    if (remain <= 0) return "已过期";
    return remain === 1 ? "明天到期" : `剩 ${remain} 天`;
  }
  const d = fromDispositionRow(row);
  if (actionsIncludeUnlock(d.actions)) return "验证后解禁";
  if (d.strategy.type === "fixed" && d.strategy.puzzle) return "验证后解禁";
  if (d.strategy.type === "quiz" || d.strategy.type === "ack_read" || d.strategy.type === "signature") {
    return "验证后解禁";
  }
  if (d.actions.includes("forbid")) return "需人工解除";
  return "无日历到期";
}

/** 列表展开详情：与编辑器同一套 fromDispositionRow / registry 映射。 */
export function summarizeDispositionForDetail(row: StudentViolationRow): {
  strategyLabel: string;
  challengePhrase: string;
  actionsLabel: string;
  unlockOnVerify: string;
  forbidEnter: string;
  everyScan: string;
  maxEnter: string;
  expireAt: string;
  expireHint: string;
} {
  const d = fromDispositionRow(row);
  const type = registryDispositionType(d) || "SHOW_ONLY";
  const phrase =
    d.strategy.type === "fixed" && d.strategy.puzzle
      ? d.strategy.challengePhrase.trim()
      : "";
  const max =
    d.strategy.type === "unset" ? null : d.strategy.maxEnterSuccess;
  return {
    strategyLabel: DISPOSITION_STRATEGY_LABEL[type] ?? type,
    challengePhrase: phrase || "—",
    actionsLabel: d.actions.length
      ? d.actions.map((a) => ACTION_LABEL[a]).join("、")
      : "无",
    unlockOnVerify: actionsIncludeUnlock(d.actions) ? "是" : "否",
    forbidEnter: d.actions.includes("forbid") ? "是" : "否",
    everyScan: d.actions.includes("every") ? "是" : "否",
    maxEnter:
      max != null
        ? `${row.enterSuccessCount ?? 0} / ${max}`
        : `${row.enterSuccessCount ?? 0} / 不限`,
    expireAt: row.expireAt ? String(row.expireAt).slice(0, 16) : "—",
    expireHint: dueSecondaryLabel(row),
  };
}
