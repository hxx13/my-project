import { authHttp } from "@/api/core/authHttp";
import type { SubtotalSummary } from "@/features/export-config/subtotalConfig";

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
  /** 该物品是否开启了价格 */
  priceEnabled?: boolean;
  /** 单价（元）；未开启价格或未配价时为 null */
  unitPrice?: number | null;
  /** 小计 = unitPrice × quantity */
  lineAmount?: number | null;
  /** 领用方式/房间：房间节点 id */
  pickupRoomId?: string | null;
  /** 领用方式/房间：房间全路径名 */
  pickupRoomName?: string | null;
  /** 领用人账号 id；空=下单人本人 */
  collectorId?: string | null;
  /** 领用人显示名 */
  collectorName?: string | null;
  remark?: string;
  packageStatus?: "DRAFT" | "READY" | string;
  packageRemark?: string | null;
  addedBy: string;
  /** 后端解析的加购人展示名 */
  addedByName?: string;
  /**
   * 加购人的人级主键（personnel.id）。同一人可能同时持有 STAFF_xxx 与 aro_user_id 两个账号，
   * 按「人」分组/判断能不能改必须用它，不能用 addedBy（裸账号 id）。
   */
  addedByKey?: string | null;
  /** 这行是不是当前登录人（同一人换视角也算）加购的；服务端按 personnel.id 判定 */
  mine?: boolean;
  /** 后端解析的参考数据展示名 */
  refDataLabel?: string;
  /** 本行锁定的笼位 ID；未选笼位时为 null */
  targetAnimalCageId?: number | null;
  /** 笼位坐标（购物车活数据，现查）：用于显示位置与「定位」 */
  targetCageLocation?: {
    shelveId?: string | null;
    positionX?: number | null;
    positionY?: number | null;
    campusName?: string | null;
    roomName?: string | null;
    shelveName?: string | null;
  } | null;
  /** 笼位坐标人读串，如「浦东 / A101 / 架3 (4,5)」 */
  targetCageLabel?: string | null;
  addedAt?: string;
}

export interface RefOrder {
  id: number;
  /** ARO 订单号；本地自建单为空 */
  sn?: string | null;
  /** 来源：LOCAL | ARO */
  source?: string | null;
  /** ARO 原文校区名（本地自建单为空） */
  aroAreaName?: string | null;
  groupId: string;
  submitterId: string;
  submitterName?: string;
  projectGroupName?: string;
  projectGroupId?: number | null;
  aupRecordId?: number | null;
  registerNo?: string;
  /** 下单校区：浦东 | 浦西 */
  campus?: string;
  status: string;
  submitRemark?: string;
  submittedAt?: string;
  /** 下单时计算的预计送达日（工作日） */
  estimatedDeliveryDate?: string | null;
  createdAt?: string;
  /** 订单总金额（元）；整单无定价行时为 null */
  totalAmount?: number | null;
  /** 订单内是否含已开启价格的物品 */
  priceEnabled?: boolean;
  lines?: RefOrderLine[];
}

export interface RefOrderLine {
  id: number;
  orderId: number;
  refDataId: number;
  /** 供应商（ARO 导入的结构化品名；本地自建行靠 hierarchyChain 解析） */
  supplierName?: string | null;
  /** 品系（ARO 导入的结构化品名） */
  strainName?: string | null;
  /** 规格（ARO 导入的结构化品名） */
  specName?: string | null;
  specSelections?: Record<string, string> | string;
  hierarchyChain?: Array<{ id: number; refType: string; displayName: string }>;
  quantity: number;
  /** 下单时单价快照（元） */
  unitPrice?: number | null;
  /** 小计 = unitPrice × quantity */
  lineAmount?: number | null;
  /** 实际到货日期（ARO 导入） */
  arrivalDate?: string | null;
  /** 领用方式/房间：房间节点 id */
  pickupRoomId?: string | null;
  /** 领用方式/房间：房间全路径名 */
  pickupRoomName?: string | null;
  /** 领用人账号 id；空=下单人本人 */
  collectorId?: string | null;
  /** 领用人显示名 */
  collectorName?: string | null;
  lineRemark?: string;
  addedBy?: string;
  /** 后端统一解析的加购人展示名 */
  addedByName?: string;
  aupRecordId?: number | null;
  /** 行级 AUP 编号（后端由 aupRecordId 解析） */
  registerNo?: string | null;
  /** 本行锁定的笼位 ID（订购 → 笼位预定）；未选笼位时为 null */
  targetAnimalCageId?: number | null;
  /** 笼位坐标快照（下单那一刻）：用于「定位到该笼位」 */
  targetCageLocation?: {
    animalCageId?: string | null;
    shelveId?: string | null;
    positionX?: number | null;
    positionY?: number | null;
    campusName?: string | null;
    roomName?: string | null;
    shelveName?: string | null;
  } | null;
  /** 笼位坐标人读串，如「浦东 / A101 / 架3 (4,5)」 */
  targetCageLabel?: string | null;
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

/** 领用人候选：仅本人课题组（服务端不接收课题组参数，从根上防止查他人课题组） */
export interface GroupMemberOption {
  accountId: string;
  name: string;
  jobNumber?: string;
}

export async function fetchMyGroupMembers(): Promise<GroupMemberOption[]> {
  const res = await authHttp.get<Result<GroupMemberOption[]>>("/reference-data/group-members");
  return res.data.data ?? [];
}

export async function addToCart(
  body: {
    refDataId: number;
    aupRecordId: number;
    specSelections?: Record<string, string>;
    quantity: number;
    /** 领用方式/房间（必选） */
    pickupRoomId?: string;
    pickupRoomName?: string;
    /** 领用人；不传表示本人 */
    collectorId?: string;
    collectorName?: string;
    /** 行备注（有规格时逐规格各一条） */
    remark?: string;
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
  /** 下单校区：浦东 | 浦西 */
  campus?: string;
}) {
  const res = await authHttp.post<Result<RefOrder[]>>("/reference-data/orders", body);
  return res.data.data ?? [];
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
  /** approved / expired —— expired 仍可选（笼位与白名单还挂在它上面），前端标「已过期」提示 */
  currentStage?: string | null;
}

/** 拉取当前用户课题组的已批准 AUP（服务端按登录用户课题组过滤，不接受客户端指定） */
export async function fetchApprovedAups() {
  const res = await authHttp.get<Result<AupOption[]>>("/aup/approved-for-order");
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

/**
 * 课题组名可能是多组拼接串（aro_personnel.project_group_name 用逗号/顿号分隔），拆成单个组名。
 * 直接拿整串当课题组标识，会与本组其他人的口径对不上。
 */
export function splitGroupNames(raw?: string | null): string[] {
  return (raw || "")
    .split(/[,，、;；]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * 下单归属课题组名（共享购物车 key / 提交时上报）。
 *
 * 多课题组账号取**所选 AUP 的**课题组名，保证与同组其他人落在同一个购物车；
 * 未选 AUP 时退回本人第一个课题组。绝不返回拼接串。
 */
export function resolveOrderGroupName(
  approvedAups: { id: string | number; projectGroupName?: string | null }[],
  selectedAupId: string,
  myGroupNames: string[],
): string {
  const picked = approvedAups.find((a) => String(a.id) === String(selectedAupId));
  const pickedName = (picked?.projectGroupName || "").trim();
  if (pickedName) return pickedName;
  const anyName = (approvedAups.find((a) => (a.projectGroupName || "").trim())?.projectGroupName || "").trim();
  return anyName || myGroupNames[0] || "";
}

export async function fetchOrderDetail(id: number) {
  const res = await authHttp.get<Result<RefOrder>>(`/reference-data/orders/${id}`);
  return res.data.data;
}

export async function fetchOrderLogs(id: number) {
  const res = await authHttp.get<Result<RefOrderLog[]>>(`/reference-data/orders/${id}/logs`);
  return res.data.data;
}

/** 审核页全字段筛选条件（字段名与后端 RefOrderQuery 一致） */
export interface OrderReviewFilter {
  campus?: string;
  status?: string;
  /** 排除某状态（「已完成」页签用） */
  statusNot?: string;
  source?: string;
  sn?: string;
  /** AUP 编号（register_no）*/
  aup?: string;
  projectGroup?: string;
  supplier?: string;
  strain?: string;
  collector?: string;
  room?: string;
  remark?: string;
  from?: string;
  to?: string;
}

function compactFilter(filter?: OrderReviewFilter): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(filter ?? {})) {
    const s = typeof v === "string" ? v.trim() : "";
    if (s) out[k] = s;
  }
  return out;
}

export async function fetchAllOrders(page = 1, pageSize = 50, filter?: OrderReviewFilter) {
  const res = await authHttp.get<Result<{ list: RefOrder[]; total: number }>>("/reference-data/orders/all", {
    params: { page, pageSize, ...compactFilter(filter) },
  });
  return res.data.data;
}

// ── 待处理订单编辑：回填购物车 → 改 → 保存回原单 ──

/** 把待处理订单回填到购物车，进入编辑模式（幂等，重入会先清旧回填行）。 */
export async function loadOrderToCart(orderId: number): Promise<RefCartItem[]> {
  const res = await authHttp.post<Result<RefCartItem[]>>(`/reference-data/orders/${orderId}/edit/load`);
  if (!res.data?.success) throw new Error(res.data?.message || "回填购物车失败");
  return res.data.data ?? [];
}

/** 放弃编辑：清掉回填行，原单不受影响。 */
export async function discardOrderEdit(orderId: number): Promise<void> {
  const res = await authHttp.delete<Result<void>>(`/reference-data/orders/${orderId}/edit`);
  if (!res.data?.success) throw new Error(res.data?.message || "放弃编辑失败");
}

/** 保存编辑：用回填的购物车内容整体替换原单明细，单号与状态不变。 */
export async function applyOrderEdit(orderId: number): Promise<RefOrder> {
  const res = await authHttp.put<Result<RefOrder>>(`/reference-data/orders/${orderId}/edit`);
  if (!res.data?.success) throw new Error(res.data?.message || "保存编辑失败");
  return res.data.data!;
}

/** 学生端：本课题组订单（同组互见；课题组由服务端圈定，前端传了也会被覆盖） */
export async function fetchMyGroupOrders(page = 1, pageSize = 50, filter?: OrderReviewFilter) {
  const res = await authHttp.get<Result<{ list: RefOrder[]; total: number }>>("/reference-data/orders/my-group", {
    params: { page, pageSize, ...compactFilter(filter) },
  });
  return res.data.data;
}

/** 学生端：导出本课题组订单 */
export async function exportMyGroupOrders(filter?: OrderReviewFilter) {
  const res = await authHttp.get("/reference-data/orders/my-group/export", {
    params: compactFilter(filter),
    responseType: "blob",
  });
  return res.data as Blob;
}

/** 筛选下拉候选值的列（服务端白名单） */
export type OrderFilterColumn =
  | "supplier_name"
  | "strain_name"
  | "collector_name"
  | "pickup_room_name"
  | "project_group_name"
  | "register_no";

/** 筛选下拉候选：供应商 / 品系 / 领用人 / 房间 / 课题组 / AUP
 *  scope="student" 时走本课题组接口（范围由服务端圈定），避免管理员接口 403。 */
export async function fetchOrderFilterOptions(
  column: OrderFilterColumn,
  scope: "admin" | "student" = "admin",
): Promise<string[]> {
  const path = scope === "student" ? "/reference-data/orders/my-group/filter-options" : "/reference-data/orders/filter-options";
  const res = await authHttp.get<Result<string[]>>(path, { params: { column } });
  return res.data.data ?? [];
}

/** 把 ARO 历史订单导入本地订单库（仅超管；幂等，可反复执行） */
export async function importAroOrders(): Promise<{
  ordersCreated: number;
  ordersUpdated: number;
  linesWritten: number;
  failed: number;
  failedSns: string[];
}> {
  const res = await authHttp.post<Result<{
    ordersCreated: number;
    ordersUpdated: number;
    linesWritten: number;
    failed: number;
    failedSns: string[];
  }>>("/reference-data/orders/import-aro", null);
  if (!res.data?.success) throw new Error(res.data?.message || "导入失败");
  return res.data.data!;
}

/** 导出订购审核 Excel（后端按 课题组→申领人→物品 逐层小计）。 */
export async function exportOrderReviewExcel(
  filter?: OrderReviewFilter,
  config?: { levels?: string; excludeBlocks?: string },
) {
  const res = await authHttp.get("/reference-data/orders/export", {
    params: { ...compactFilter(filter), ...config },
    responseType: "blob",
  });
  return res.data as Blob;
}

/** 订购审核导出结构摘要（全量层级与板块，供勾选；忽略 levels/excludeBlocks）。 */
export async function exportOrderReviewSummary(filter?: OrderReviewFilter): Promise<SubtotalSummary> {
  const res = await authHttp.get<Result<SubtotalSummary>>("/reference-data/orders/export/summary", {
    params: compactFilter(filter),
  });
  return res.data.data;
}

export async function updateOrderStatus(id: number, status: string) {
  const res = await authHttp.put<Result<RefOrder>>(`/reference-data/orders/${id}/status`, null, { params: { status } });
  return res.data.data;
}
