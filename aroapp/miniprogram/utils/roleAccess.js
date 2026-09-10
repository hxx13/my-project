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

/** 「饲养组长」身份码。与后端 CageModeVisibilityService.CODE_LEADER 同一个码。 */
var CODE_BREEDING_GROUP_LEADER = 'BREEDING_GROUP_LEADER';

/**
 * 笼位关键信息表单的客户端编辑授权 —— Web 端 LocalDetailPanel 的同款判定：
 * 「管理员及以上」或「持饲养组长身份」。
 *
 * 服务端另有按笼位算的判定（管理员/额外操作身份/认领人/实验员本人），两者取或，
 * 见 CageFormFill.tsx 的 `canEdit = editable || serverEditable`。小程序也必须取或，
 * 否则同一个账号会在 Web 能编、在小程序不能。
 *
 * @param {string} currentRole 角色码（storage 里的 ROLE）
 * @param {Object} identityCodes 身份码集合，形如 { BREEDING_GROUP_LEADER: true }
 */
function hasCageFormEditGrant(currentRole, identityCodes) {
  if (hasMinRole(currentRole, 'ADMIN')) return true;
  return !!(identityCodes && identityCodes[CODE_BREEDING_GROUP_LEADER]);
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
  CODE_BREEDING_GROUP_LEADER,
  getRoleLevel,
  hasMinRole,
  hasCageFormEditGrant,
  isStudentAccount,
};
