import { authHttp } from "@/api/core/authHttp";

type ApiResult<T> = { code?: number; message?: string; success?: boolean; data?: T };

export interface MobileEnterGrantRow {
  userId: string;
  /** true=白名单（始终开启） false=黑名单（始终关闭） */
  enabled: boolean;
  updatedBy?: string | null;
  updatedAt?: string | null;
}

export interface MobileEnterSettings {
  masterEnabled: boolean;
  whitelistCount: number;
  blacklistCount: number;
}

/** 一键开关 + 两个名单的人数。 */
export async function fetchMobileEnterSettings(): Promise<MobileEnterSettings> {
  const res = await authHttp.get<ApiResult<MobileEnterSettings>>(
    "/v1/twin/scan/mobile-enter/settings",
  );
  if (!res.data?.success || !res.data.data) throw new Error(res.data?.message || "加载失败");
  return {
    masterEnabled: res.data.data.masterEnabled === true,
    whitelistCount: Number(res.data.data.whitelistCount ?? 0),
    blacklistCount: Number(res.data.data.blacklistCount ?? 0),
  };
}

/** 一键开启/关闭所有人。白名单、黑名单不受影响。 */
export async function updateMobileEnterMaster(enabled: boolean): Promise<void> {
  const res = await authHttp.post<ApiResult<boolean>>(
    "/v1/twin/scan/mobile-enter/settings",
    { enabled },
  );
  if (!res.data?.success) throw new Error(res.data?.message || "保存失败");
}

/** 名单查询。enabled 为空表示全部；true 取白名单，false 取黑名单。 */
export async function fetchMobileEnterGrants(
  enabled?: boolean,
  keyword?: string,
): Promise<MobileEnterGrantRow[]> {
  const res = await authHttp.get<ApiResult<MobileEnterGrantRow[]>>(
    "/v1/twin/scan/mobile-enter/grants",
    { params: { enabled, keyword: keyword || undefined } },
  );
  if (!res.data?.success) throw new Error(res.data?.message || "加载失败");
  return Array.isArray(res.data.data) ? res.data.data : [];
}

/** 批量加入名单。enabled=true 加白名单，false 加黑名单。入参可为 STAFF_ 或 ARO 任意形态 id。 */
export async function updateMobileEnterGrants(
  userIds: string[],
  enabled: boolean,
): Promise<number> {
  const res = await authHttp.post<ApiResult<number>>(
    "/v1/twin/scan/mobile-enter/grants",
    { userIds, enabled },
  );
  if (!res.data?.success) throw new Error(res.data?.message || "保存失败");
  return Number(res.data.data ?? 0);
}

/** 批量移出名单（回到跟随一键开关）。 */
export async function removeMobileEnterGrants(userIds: string[]): Promise<number> {
  const res = await authHttp.post<ApiResult<number>>(
    "/v1/twin/scan/mobile-enter/grants/remove",
    { userIds },
  );
  if (!res.data?.success) throw new Error(res.data?.message || "移除失败");
  return Number(res.data.data ?? 0);
}
