import { adminHttp } from "@/api/core/adminHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export interface SopNode {
  id: number;
  parentId: number | null;
  name: string;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SopDocument {
  id: number;
  nodeId: number | null;
  fileId: string;
  title: string;
  sortOrder: number;
  createdBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
  /** 联表只读：来自 admin_file_template */
  originalName?: string | null;
  sizeBytes?: number | null;
  mimeType?: string | null;
}

export interface SopTree {
  nodes: SopNode[];
  documents: SopDocument[];
}

const EMPTY: SopTree = { nodes: [], documents: [] };

export async function fetchSopTree(): Promise<SopTree> {
  const res = await adminHttp.get<Result<SopTree>>("/sop/tree");
  const d = (res.data as Result<SopTree> | undefined)?.data;
  return d ?? EMPTY;
}

/**
 * 取 PDF 字节流。
 *
 * **故意不走 URL 参数**：token 由 adminHttp 放进 Authorization 头，调用方再把 ArrayBuffer
 * 转成只在当前页面有效的 blob URL 交给 iframe —— 链接复制给别人、右键另存、爬虫直抓都拿不到。
 * timeout 归零：大文档在慢链路下 15s 超时会假失败。
 */
export async function fetchSopPdfBlob(documentId: number): Promise<Blob> {
  const res = await adminHttp.get(`/sop/documents/${documentId}/content`, {
    responseType: "blob",
    timeout: 0,
  });
  return res.data as Blob;
}

export async function createSopNode(parentId: number | null, name: string): Promise<SopNode> {
  const res = await adminHttp.post<Result<SopNode>>("/sop/nodes", { parentId, name });
  return (res.data as Result<SopNode>).data;
}

/** 改名只传 name；移动必须显式 moveParent=true（否则「移到顶层」与「不改」在 JSON 里无法区分） */
export async function updateSopNode(
  id: number,
  payload: { name?: string; parentId?: number | null; moveParent?: boolean },
): Promise<SopNode> {
  const res = await adminHttp.put<Result<SopNode>>(`/sop/nodes/${id}`, payload);
  return (res.data as Result<SopNode>).data;
}

export async function deleteSopNode(id: number): Promise<void> {
  await adminHttp.delete(`/sop/nodes/${id}`);
}

export async function createSopDocument(payload: {
  nodeId: number | null;
  fileId: string;
  title: string;
}): Promise<SopDocument> {
  const res = await adminHttp.post<Result<SopDocument>>("/sop/documents", payload);
  return (res.data as Result<SopDocument>).data;
}

export async function updateSopDocument(
  id: number,
  payload: { title?: string; nodeId?: number | null; moveNode?: boolean },
): Promise<SopDocument> {
  const res = await adminHttp.put<Result<SopDocument>>(`/sop/documents/${id}`, payload);
  return (res.data as Result<SopDocument>).data;
}

export async function deleteSopDocument(id: number): Promise<void> {
  await adminHttp.delete(`/sop/documents/${id}`);
}

/** 当前用户的收藏文档 id，最近收藏的在前 */
export async function fetchSopFavorites(): Promise<number[]> {
  const res = await adminHttp.get<Result<number[]>>("/sop/favorites");
  const d = (res.data as Result<number[]> | undefined)?.data;
  return Array.isArray(d) ? d : [];
}

export async function addSopFavorite(documentId: number): Promise<void> {
  await adminHttp.post(`/sop/favorites/${documentId}`);
}

export async function removeSopFavorite(documentId: number): Promise<void> {
  await adminHttp.delete(`/sop/favorites/${documentId}`);
}
