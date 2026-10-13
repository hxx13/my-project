/**
 * 密码强度规则 —— 后端 `PasswordPolicyValidator` 的前端镜像。
 *
 * <p>**为什么要有这一份**：注册/激活/重置三处各自写「至少 6 位」，而后端早就是
 * 「8 位起 + 大写/小写/数字/特殊字符里至少三类」。用户照前端的提示填，提交才被拒，
 * 提示与实际规则对不上。规则只在这里写一次，各处引用，别再各写各的。
 *
 * <p>错误文案与后端逐字一致，避免「前端一套说法、后端另一套」。
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 64;
export const PASSWORD_MIN_CATEGORIES = 3;

export type PasswordCategory = "lowercase" | "uppercase" | "digit" | "special";

export const PASSWORD_CATEGORY_LABELS: Record<PasswordCategory, string> = {
  lowercase: "小写字母",
  uppercase: "大写字母",
  digit: "数字",
  special: "特殊字符",
};

/** 一句话说清规则，用于提示块 */
export const PASSWORD_RULE_SUMMARY = `${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 位，且大写字母、小写字母、数字、特殊字符里至少凑够 ${PASSWORD_MIN_CATEGORIES} 类`;

/** 输入框占位符：必须短到不会被截断，细则交给输入框下面的提示块 */
export const PASSWORD_RULE_PLACEHOLDER = `${PASSWORD_MIN_LENGTH}-${PASSWORD_MAX_LENGTH} 位，至少三类字符`;

/** 四类字符各自是否出现。特殊字符按后端口径 = 非字母、非数字、非空白 */
export function passwordCategoriesMet(password: string): Record<PasswordCategory, boolean> {
  const p = password ?? "";
  return {
    lowercase: /[a-z]/.test(p),
    uppercase: /[A-Z]/.test(p),
    digit: /[0-9]/.test(p),
    special: /[^a-zA-Z0-9\s]/.test(p),
  };
}

export function countPasswordCategories(password: string): number {
  return Object.values(passwordCategoriesMet(password)).filter(Boolean).length;
}

/**
 * 校验密码；返回 null 表示通过，否则是给用户看的错误文案。
 *
 * <p>先 trim 再判，与后端一致 —— 后端拿到后也是 trim 后再校验和哈希，
 * 前端若按原样判长度，会出现「前端说够长、后端说不够」的错位。
 */
export function validatePassword(password: string): string | null {
  const p = (password ?? "").trim();
  if (!p) return "密码不能为空";
  if (p.length < PASSWORD_MIN_LENGTH) return `密码长度不能少于${PASSWORD_MIN_LENGTH}位`;
  if (p.length > PASSWORD_MAX_LENGTH) return `密码长度不能超过${PASSWORD_MAX_LENGTH}位`;
  if (countPasswordCategories(p) < PASSWORD_MIN_CATEGORIES) {
    return "密码需至少包含大写字母、小写字母、数字、特殊字符中的三类";
  }
  return null;
}
