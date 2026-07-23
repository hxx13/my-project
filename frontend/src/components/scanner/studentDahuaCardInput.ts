/** 学生快捷绑卡：物理卡号固定 8 位字母或数字 */
export const STUDENT_DAHUA_CARD_LEN = 8;

/** 读卡器连扫/键盘连发后的校验防抖（毫秒） */
export const STUDENT_DAHUA_CARD_DEBOUNCE_MS = 280;

const CARD_NO_RE = /^[0-9A-Za-z]{8}$/;

export function sanitizeStudentDahuaCardNo(value: string): string {
  return value.replace(/[^0-9A-Za-z]/g, "").slice(0, STUDENT_DAHUA_CARD_LEN);
}

export function isValidStudentDahuaCardNo(value: string): boolean {
  return CARD_NO_RE.test(value);
}
