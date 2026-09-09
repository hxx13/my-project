import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

/** 存放地点树节点；children/directCount/totalCount 由后端 buildTree 填充（单节点接口可能为 null） */
export interface AssetLocationNode {
  id: number;
  parentId: number | null;
  name: string;
  /** 地点图标 emoji（空/null = 未设置，前端回落到文件夹图标） */
  icon?: string | null;
  sortOrder?: number;
  deleted?: number;
  createdAt?: string;
  updatedAt?: string;
  children?: AssetLocationNode[] | null;
  /** 直属资产数 */
  directCount?: number | null;
  /** 含子树的资产总数 */
  totalCount?: number | null;
}

export async function fetchAssetLocationTree() {
  const res = await authHttp.get<Result<AssetLocationNode[]>>("/v1/asset-locations/tree");
  return res.data.data;
}

export async function createAssetLocation(payload: { parentId?: number | null; name: string; icon?: string }) {
  const res = await authHttp.post<Result<AssetLocationNode>>("/v1/asset-locations", payload);
  return res.data.data;
}

/** 局部更新：name / parentId / sortOrder / icon 传 undefined 表示保持原值（后端 null=不改） */
export async function updateAssetLocation(
  id: number,
  payload: { name?: string; parentId?: number; sortOrder?: number; icon?: string }
) {
  const res = await authHttp.patch<Result<AssetLocationNode>>(`/v1/asset-locations/${id}`, payload);
  return res.data.data;
}

export async function deleteAssetLocation(id: number) {
  await authHttp.delete(`/v1/asset-locations/${id}`);
}
