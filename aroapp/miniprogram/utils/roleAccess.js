/**
 * 与 frontend/src/features/auth/roleAccess.ts 保持一致，供小程序侧权限判断。
 */

var springAuth = require('./springAuth.js');

var ROLE_LEVEL_MAP = {
  MEMBER: 1,
  STUDENT: 1,
  STAFF: 2,
  SENIOR: 3,
  ADMIN: 4,
  SUPER_ADMIN: 5,
  PLATFORM_OWNER: 6,
};

function getRoleLevel(role) {
  if (!role) return ROLE_LEVEL_MAP.MEMBER;
  return ROLE_LEVEL_MAP[String(role).toUpperCase()] ?? ROLE_LEVEL_MAP.MEMBER;
}

function hasMinRole(currentRole, minRole) {
  return getRoleLevel(currentRole) >= getRoleLevel(minRole);
}

/**
 * 判定当前用户是否为学生账号。
 * 优先使用 accountSource，与 Web 端 postLoginNavigation.ts 的 isStudentAccount() 完全一致。
 * @returns {boolean}
 */
function isStudentAccount() {
  try {
    var raw = wx.getStorageSync(springAuth.KEYS.USER_INFO);
    if (raw) {
      var ui = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (ui && ui.accountSource === 'STUDENT') return true;
      if (ui && ui.accountSource === 'STAFF') return false;
    }
  } catch (e) {
    // fall through to role-level check
  }
  var role = wx.getStorageSync(springAuth.KEYS.ROLE) || '';
  return !hasMinRole(role, 'STAFF');
}

module.exports = {
  ROLE_LEVEL_MAP,
  getRoleLevel,
  hasMinRole,
  isStudentAccount,
};
