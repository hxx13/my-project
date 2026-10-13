/**
 * 密码强度：与后端 PasswordPolicyValidator 同口径（8-64 位、四类字符里至少三类）。
 *
 * <p>早先各页各写「至少 6 位」，用户照提示填完必被后端打回。规则只留这一份，
 * 注册 / 重置 / 修改 / 管理端建号 全部引它。
 */

/**
 * @param {string} pwd 明文密码
 * @returns {string} 空串表示通过，否则是给用户看的原因（压到 18 字以内，toast 不截断）
 */
function checkPasswordRule(pwd) {
  var p = String(pwd || '').trim();
  if (!p) return '密码不能为空';
  if (p.length < 8) return '密码至少8位';
  if (p.length > 64) return '密码不能超过64位';
  var categories = 0;
  if (/[a-z]/.test(p)) categories += 1;
  if (/[A-Z]/.test(p)) categories += 1;
  if (/[0-9]/.test(p)) categories += 1;
  if (/[^a-zA-Z0-9\s]/.test(p)) categories += 1;
  if (categories < 3) return '需含大小写、数字、特殊字符中三类';
  return '';
}

module.exports = { checkPasswordRule: checkPasswordRule };
