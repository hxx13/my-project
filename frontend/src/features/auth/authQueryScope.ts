import { queryClient } from "@/api/hooks/queryClient";
import { authStorage } from "@/features/auth/authStorage";

/** Web 端 Query 分片键：换账号后必须与上一会话隔离 */
export function getAuthSessionScope(): string {
  const infoId = authStorage.getUserInfo()?.id?.trim();
  if (infoId) return infoId;
  const tokenId = authStorage.getUserIdFromToken();
  if (tokenId) return tokenId;
  const token = authStorage.getToken().trim();
  return token ? `token:${token.slice(-32)}` : "anonymous";
}

export function authQueryKey(...segments: readonly unknown[]) {
  return ["auth", getAuthSessionScope(), ...segments] as const;
}

/** 登录/退出后清除与当前会话绑定的 TanStack 缓存 */
export function resetAuthSessionQueries() {
  void queryClient.removeQueries({ queryKey: ["auth"] });
}
