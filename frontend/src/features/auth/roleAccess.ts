export const ROLE_LEVEL_MAP: Record<string, number> = {
  STUDENT: 1,
  STAFF: 2,
  SENIOR: 3,
  ADMIN: 4,
  SUPER_ADMIN: 5,
  PLATFORM_OWNER: 6,
};

export function getRoleLevel(role?: string): number {
  if (!role) return ROLE_LEVEL_MAP.STUDENT;
  return ROLE_LEVEL_MAP[role] ?? ROLE_LEVEL_MAP.STUDENT;
}

export function hasMinRole(currentRole: string | undefined, minRole: string): boolean {
  return getRoleLevel(currentRole) >= getRoleLevel(minRole);
}

export function hasMinRoleLevel(currentRole: string | undefined, minLevel: number): boolean {
  return getRoleLevel(currentRole) >= minLevel;
}
