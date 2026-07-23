export const ROLE_LEVEL_MAP: Record<string, number> = {
  MEMBER: 1,
  STAFF: 2,
  SENIOR: 3,
  ADMIN: 4,
  SUPER_ADMIN: 5,
  PLATFORM_OWNER: 6,
};

export function getRoleLevel(role?: string): number {
  if (!role) return ROLE_LEVEL_MAP.MEMBER;
  return ROLE_LEVEL_MAP[role] ?? ROLE_LEVEL_MAP.MEMBER;
}

export function hasMinRole(currentRole: string | undefined, minRole: string): boolean {
  return getRoleLevel(currentRole) >= getRoleLevel(minRole);
}

export const MOBILE_HTML5_PRIVILEGE_MIN_ROLE = "ADMIN";

/** HTML5 手机直达：人员授权页角色为管理员及以上时跳过笼架课题组可见性等限制（房间页不受影响） */
export function hasMobileHtml5Privilege(role?: string): boolean {
  return hasMinRole(role, MOBILE_HTML5_PRIVILEGE_MIN_ROLE);
}

export function hasMinRoleLevel(currentRole: string | undefined, minLevel: number): boolean {
  return getRoleLevel(currentRole) >= minLevel;
}
