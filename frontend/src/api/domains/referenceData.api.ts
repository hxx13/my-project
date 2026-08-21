import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

export interface RefDataItem {
  id: number;
  refType: string;
  parentId: number | null;
  sortOrder: number;
  status: number;
  fieldData: Record<string, any>;
  childCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

/** Parse fieldData if it's a JSON string (backend may return string before fix) */
function normalizeItem(item: RefDataItem): RefDataItem {
  if (typeof item.fieldData === "string") {
    try {
      item.fieldData = JSON.parse(item.fieldData);
    } catch { /* keep as-is */ }
  }
  return item;
}
function normalizeList(items: RefDataItem[]): RefDataItem[] {
  return items.map(normalizeItem);
}

export interface RefSpecTemplate {
  id: number;
  name: string;
  scope: string;
  breedType?: string;
  options: string[];
  createdAt?: string;
}

export interface RefCartItem {
  id: number;
  groupId: string;
  refDataId: number;
  aupRecordId?: number | null;
  /** 后端可能返回已解析对象，或历史 JSON 字符串 */
  specSelections?: Record<string, string> | string;
  quantity: number;
  remark?: string;
  packageStatus?: "DRAFT" | "READY" | string;
  packageRemark?: string | null;
  addedBy: string;
  /** 后端解析的加购人展示名 */
  addedByName?: string;
  /** 后端解析的参考数据展示名 */
  refDataLabel?: string;
  addedAt?: string;
}

export interface RefOrder {
  id: number;
  groupId: string;
  submitterId: string;
  submitterName?: string;
  projectGroupName?: string;
  projectGroupId?: number | null;
  aupRecordId?: number | null;
  registerNo?: string;
  status: string;
  submitRemark?: string;
  submittedAt?: string;
  /** 下单时计算的预计送达日（工作日） */
  estimatedDeliveryDate?: string | null;
  createdAt?: string;
  lines?: RefOrderLine[];
}

export interface RefOrderLine {
  id: number;
  orderId: number;
  refDataId: number;
  specSelections?: Record<string, string> | string;
  hierarchyChain?: Array<{ id: number; refType: string; displayName: string }>;
  quantity: number;
  lineRemark?: string;
  addedBy?: string;
  /** 后端统一解析的加购人展示名 */
  addedByName?: string;
  aupRecordId?: number | null;
  /** 行级 AUP 编号（后端由 aupRecordId 解析） */
  registerNo?: string | null;
}

export interface RefOrderLog {
  id: number;
  orderId: number;
  action: string;
  operatorId: string;
  /** 后端统一解析的操作人展示名 */
  operatorName?: string;
  detail?: string;
  createdAt?: string;
}

// ── Ref Data CRUD ──

export async function fetchRefDataList(
  typeKey: string,
  params?: { parentId?: number; status?: number; keyword?: string; page?: number; size?: number },
) {
  const res = await authHttp.get<Result<RefDataItem[]>>(`/reference-data/${encodeURIComponent(typeKey)}`, { params });
  return normalizeList(res.data.data ?? []);
}

export async function fetchRefDataDetail(typeKey: string, id: number) {
  const res = await authHttp.get<Result<RefDataItem>>(`/reference-data/${encodeURIComponent(typeKey)}/${id}`);
  return normalizeItem(res.data.data);
}

export async function createRefData(typeKey: string, body: Record<string, unknown>) {
  const res = await authHttp.post<Result<RefDataItem>>(`/reference-data/${encodeURIComponent(typeKey)}`, body);
  return normalizeItem(res.data.data);
}

export async function updateRefData(typeKey: string, id: number, body: Record<string, unknown>) {
  const res = await authHttp.put<Result<RefDataItem>>(`/reference-data/${encodeURIComponent(typeKey)}/${id}`, body);
  return normalizeItem(res.data.data);
}

export async function deleteRefData(typeKey: string, id: number) {
  await authHttp.delete(`/reference-data/${encodeURIComponent(typeKey)}/${id}`);
}

export async function fetchRefDataOptions(typeKey: string) {
  const res = await authHttp.get<Result<RefDataItem[]>>(`/reference-data/${encodeURIComponent(typeKey)}/options`);
  return normalizeList(res.data.data ?? []);
}

// ── Spec Templates ──

export async function fetchSpecTemplates() {
  const res = await authHttp.get<Result<RefSpecTemplate[]>>("/reference-data/spec-templates");
  return res.data.data;
}

export async function createSpecTemplate(body: Omit<Partial<RefSpecTemplate>, "options"> & { name: string; scope: string; options: { items: string[] } }) {
  const res = await authHttp.post<Result<RefSpecTemplate>>("/reference-data/spec-templates", body);
  return res.data.data;
}

export async function updateSpecTemplate(id: number, body: Partial<Omit<RefSpecTemplate, "options">> & { options?: { items: string[] } }) {
  const res = await authHttp.put<Result<RefSpecTemplate>>(`/reference-data/spec-templates/${id}`, body);
  return res.data.data;
}

export async function deleteSpecTemplate(id: number) {
  await authHttp.delete(`/reference-data/spec-templates/${id}`);
}

// ── Cart ──

export async function fetchCart(groupId: string) {
  const res = await authHttp.get<Result<RefCartItem[]>>("/reference-data/cart", { params: { groupId } });
  return res.data.data;
}

export async function addToCart(
  body: {
    refDataId: number;
    aupRecordId: number;
    specSelections?: Record<string, string>;
    quantity: number;
  },
  groupId: string,
) {
  const res = await authHttp.post<Result<RefCartItem>>("/reference-data/cart", body, { params: { groupId } });
  return res.data.data;
}

export async function updateCartItem(id: number, body: { quantity?: number; specSelections?: Record<string, string> }) {
  const res = await authHttp.put<Result<RefCartItem>>(`/reference-data/cart/${id}`, body);
  return res.data.data;
}

export async function removeCartItem(id: number) {
  await authHttp.delete(`/reference-data/cart/${id}`);
}

export async function clearCart(groupId: string) {
  await authHttp.delete("/reference-data/cart", { params: { groupId } });
}

/** 实验员提交订单包：本人行 → READY + packageRemark */
export async function markCartPackageReady(
  groupId: string,
  body: { cartIds?: number[]; packageRemark?: string } = {},
) {
  const res = await authHttp.post<Result<RefCartItem[]>>("/reference-data/cart/package-ready", body, {
    params: { groupId },
  });
  return res.data.data ?? [];
}

/** 撤回订单包：本人 READY → DRAFT */
export async function withdrawCartPackage(
  groupId: string,
  body: { cartIds?: number[] } = {},
) {
  const res = await authHttp.post<Result<RefCartItem[]>>("/reference-data/cart/package-draft", body, {
    params: { groupId },
  });
  return res.data.data ?? [];
}

export async function submitOrder(body: {
  groupId: string;
  submitterId?: string;
  submitterName?: string;
  projectGroupName?: string;
  aupRecordId?: number;
  cartIds?: number[];
  lines?: {
    refDataId: number;
    aupRecordId: number;
    specSelections?: Record<string, string>;
    quantity: number;
    addedBy?: string;
    packageRemark?: string;
  }[];
  submitRemark?: string;
}) {
  const res = await authHttp.post<Result<RefOrder>>("/reference-data/orders", body);
  return res.data.data;
}

// ── Orders ──

export async function fetchOrders(groupId: string) {
  const res = await authHttp.get<Result<RefOrder[]>>("/reference-data/orders", { params: { groupId } });
  return res.data.data;
}

// ── AUP（下单必选：本课题组已批准 AUP） ──

export interface AupOption {
  id: string;
  registerNo: string;
  projectGroupName: string;
  projectGroupId?: number | null;
}

/** 拉取本课题组已批准 AUP（下单必选 AUP 下拉；projectGroupName 为空则拉全部） */
export async function fetchApprovedAups(projectGroupName?: string) {
  const res = await authHttp.get<Result<AupOption[]>>("/aup/approved-for-order", {
    params: { projectGroupName },
  });
  return res.data.data ?? [];
}

/** 课题组共享购物车 groupId：pg-{projectGroupId}，否则 pg-name-{归一化课题组名} */
export function resolveSharedCartGroupId(
  projectGroupId?: number | null,
  projectGroupName?: string | null,
): string {
  if (projectGroupId != null && Number.isFinite(Number(projectGroupId))) {
    return `pg-${Number(projectGroupId)}`;
  }
  const name = (projectGroupName || "").trim();
  if (!name) return "";
  return `pg-name-${name.replace(/\s+/g, "_")}`;
}

export async function fetchOrderDetail(id: number) {
  const res = await authHttp.get<Result<RefOrder>>(`/reference-data/orders/${id}`);
  return res.data.data;
}

export async function fetchOrderLogs(id: number) {
  const res = await authHttp.get<Result<RefOrderLog[]>>(`/reference-data/orders/${id}/logs`);
  return res.data.data;
}

export async function fetchAllOrders(page = 1, pageSize = 50) {
  const res = await authHttp.get<Result<{ list: RefOrder[]; total: number }>>("/reference-data/orders/all", { params: { page, pageSize } });
  return res.data.data;
}

export async function updateOrderStatus(id: number, status: string) {
  const res = await authHttp.put<Result<RefOrder>>(`/reference-data/orders/${id}/status`, null, { params: { status } });
  return res.data.data;
}
