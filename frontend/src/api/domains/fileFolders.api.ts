import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

/** 文件夹节点；children/directCount/totalCount 由后端 buildTree 填充 */
export interface FileFolderNode {
  id: number;
  parentId: number | null;
  name: string;
  icon?: string | null;
  sortOrder?: number;
  children?: FileFolderNode[] | null;
  /** 直属文件数 */
  directCount?: number | null;
  /** 含子树的文件总数 */
  totalCount?: number | null;
}

export async function fetchFileFolderTree(): Promise<FileFolderNode[]> {
  const res = await authHttp.get<Result<FileFolderNode[]>>("/admin/file-folders/tree");
  if (!res.data?.success) throw new Error(res.data?.message || "读取文件夹失败");
  return res.data.data ?? [];
}

export async function createFileFolder(payload: { parentId?: number | null; name: string; icon?: string }) {
  const res = await authHttp.post<Result<FileFolderNode>>("/admin/file-folders", payload);
  if (!res.data?.success) throw new Error(res.data?.message || "新建失败");
  return res.data.data;
}

export async function updateFileFolder(id: number, payload: { name?: string; parentId?: number; icon?: string }) {
  const res = await authHttp.patch<Result<FileFolderNode>>(`/admin/file-folders/${id}`, payload);
  if (!res.data?.success) throw new Error(res.data?.message || "更新失败");
  return res.data.data;
}

export async function deleteFileFolder(id: number) {
  const res = await authHttp.delete<Result<null>>(`/admin/file-folders/${id}`);
  if (!res.data?.success) throw new Error(res.data?.message || "删除失败");
}
