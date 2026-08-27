export type ViolationFieldCopy = {
  label: string;
  placeholder?: string;
  hint?: string;
  tone?: "default" | "warn";
};

/**
 * 违规规则跨界面统一文案唯一真源。
 *
 * 「封禁天数留空 = 永久封禁」是后端核实语义：expireAfterDays 为 null/≤0 时 expire_at=null，
 * 过期扫描 SQL 只命中 expire_at IS NOT NULL，故此类记录永不自动过期，只能人工解除。
 * 不要改成「不计时」。
 */
export const VIOLATION_FIELD_COPY = {
  expireDays: {
    label: "封禁天数",
    placeholder: "永久",
    hint: "留空 = 永久封禁，须人工解除",
    tone: "warn",
  },
  maxEnterSuccess: { label: "进入次数上限", placeholder: "不限制" },
  challengePhrase: { label: "拼图短语", placeholder: "请输入拼图短语（必填）" },
  forbidEnter: { label: "立即禁止扫码进入" },
  showNoticeEveryScan: { label: "每次扫码都提示违规内容" },
  unlockOnVerify: { label: "验证完成后自动解除禁入" },
} as const satisfies Record<string, ViolationFieldCopy>;

/** 违规字段 key 联合类型，拼错 key 会在类型层面报错。 */
export type ViolationFieldKey = keyof typeof VIOLATION_FIELD_COPY;
