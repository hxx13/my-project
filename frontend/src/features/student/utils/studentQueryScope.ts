import { queryClient } from "@/api/hooks/queryClient";
import { authStorage } from "@/features/auth/authStorage";

/** 学生中心 Query 分片键：特殊通道/PIN 换人后必须与上一会话隔离 */
export function getStudentSessionScope(): string {
  // Mirror mode: scope cache to the target student, not the staff user
  if (authStorage.isMirrorMode()) {
    const mirrorId = authStorage.getMirrorUserId();
    if (mirrorId) return `mirror:${mirrorId}`;
  }

  const infoId = authStorage.getUserInfo()?.id?.trim();
  if (infoId) return infoId;
  const tokenId = authStorage.getUserIdFromToken();
  if (tokenId) return tokenId;
  const token = authStorage.getToken().trim();
  return token ? `token:${token.slice(-32)}` : "anonymous";
}

export function studentQueryKey(...segments: readonly unknown[]) {
  return ["student", getStudentSessionScope(), ...segments] as const;
}

/** 扫码特殊通道进入学生中心前调用，避免沿用上一学生的 TanStack 缓存 */
export function resetStudentSessionQueries() {
  void queryClient.removeQueries({ queryKey: ["student"] });
}
