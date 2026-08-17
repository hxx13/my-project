import { authHttp } from "@/api/core/authHttp";

interface Result<T> {
  code: number;
  success: boolean;
  message: string;
  data: T;
}

// ─────────────────────────────────────────────────────────────
// 类型定义（字段与后端 /api/v1/inventory/* 精确一致）
// ─────────────────────────────────────────────────────────────

export interface SpaceNode {
  id: number;
  parentId: number | null;
  name: string;
  type: string | null;
  icon: string | null;
  posX: number | null;
  posY: number | null;
  width: number | null;
  height: number | null;
  sortOrder: number | null;
  code: string | null;
  itemCount: number | null;
  children: SpaceNode[];
}

export interface CategoryNode {
  id: number;
  parentId: number | null;
  name: string;
  iconType: string | null;
  iconValue: string | null;
  sortOrder: number | null;
  children: CategoryNode[];
}

export interface Item {
  id: number;
  rfidCode: string | null;
  name: string;
  categoryId: number | null;
  spaceId: number | null;
  /** UNIT=一物一码 / BATCH=一批一码 */
  granularity: string | null;
  qty: number | null;
  /** IN_USE=在库 / MISSING=丢失待确认 / RETIRED=已废弃 */
  status: string | null;
  iconType: string | null;
  iconValue: string | null;
  coverUrl: string | null;
  detailImages: string | null;
  brand: string | null;
  model: string | null;
  spec: string | null;
  expireAt: string | null;
  supplier: string | null;
  purchaseNo: string | null;
  price: number | null;
  purchaseDate: string | null;
  warrantyUntil: string | null;
  fundSource: string | null;
  ext: string | null;
  lastScannedAt: string | null;
  createdBy: string | null;
  deleted: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** 空间完整路径，如「1号楼 / 3F手术区 / 手术室101」 */
  spacePath: string | null;
  categoryName: string | null;
}

export interface ItemLog {
  id: number;
  itemId: number;
  /** CREATE/UPDATE/TRANSFER/SCAN_FOUND/SCAN_NEW/SCAN_MISSING/RETIRE */
  logType: string;
  fromSpaceId: number | null;
  toSpaceId: number | null;
  operatorUserId: string | null;
  remark: string | null;
  extra: string | null;
  createdAt: string | null;
}

export interface IconItem {
  key: string;
  label: string;
  emoji: string;
}

export interface UploadedIcon {
  id: number;
  name: string;
  url: string;
  mime: string;
}

export interface IconCatalog {
  builtin: IconItem[];
  uploaded: UploadedIcon[];
}

export interface ScanSession {
  id: number;
  spaceId: number | null;
  operatorUserId: string | null;
  /** IN_PROGRESS / COMMITTED / CANCELLED */
  status: string;
  startedAt: string | null;
  committedAt: string | null;
  scannedCount: number;
  foundCount: number;
  newCount: number;
  missingCount: number;
}

export interface ScanLine {
  id: number;
  rfidCode: string;
  matchedItemId: number | null;
  /** IN_PLACE / ELSEWHERE / NEW */
  lineType: string;
  scannedAt: string | null;
}

export interface ScanSessionDetail {
  session: ScanSession;
  lines: ScanLine[];
  missing: Item[];
}

export interface ScanCommitResult {
  sessionId: number;
  scannedCount: number;
  foundCount: number;
  newCount: number;
  missingCount: number;
}

// ─────────────────────────────────────────────────────────────
// 请求体类型
// ─────────────────────────────────────────────────────────────

export interface SpaceUpsertReq {
  parentId?: number | null;
  name?: string;
  type?: string;
  icon?: string;
  posX?: number;
  posY?: number;
  width?: number;
  height?: number;
  sortOrder?: number;
  code?: string;
  /** 是否清空几何坐标（posX/posY/width/height 置 null） */
  clearGeometry?: boolean;
  /** 是否移回根节点（parentId 置 null） */
  moveToRoot?: boolean;
}

export interface CategoryUpsertReq {
  parentId?: number | null;
  name?: string;
  iconType?: string;
  iconValue?: string;
  sortOrder?: number;
}

export interface ItemUpsertReq {
  rfidCode?: string | null;
  name?: string;
  categoryId?: number | null;
  spaceId?: number | null;
  granularity?: string;
  qty?: number;
  status?: string;
  iconType?: string;
  iconValue?: string;
  coverUrl?: string;
  detailImages?: string;
  brand?: string;
  model?: string;
  spec?: string;
  expireAt?: string;
  supplier?: string;
  purchaseNo?: string;
  price?: number;
  purchaseDate?: string;
  warrantyUntil?: string;
  fundSource?: string;
  ext?: string;
}

export interface ItemListParams {
  keyword?: string;
  spaceId?: number;
  categoryId?: number;
  granularity?: string;
  status?: string;
  hasCode?: boolean;
  page?: number;
  size?: number;
}

export interface ItemPage {
  list: Item[];
  total: number;
}

// ─────────────────────────────────────────────────────────────
// 空间
// ─────────────────────────────────────────────────────────────

export async function fetchSpaceTree(): Promise<SpaceNode[]> {
  const res = await authHttp.get<Result<SpaceNode[]>>("/v1/inventory/spaces/tree");
  if (!res.data?.success) throw new Error(res.data?.message || "加载空间树失败");
  return res.data.data ?? [];
}

export async function createSpace(req: SpaceUpsertReq) {
  const res = await authHttp.post<Result<unknown>>("/v1/inventory/spaces", req);
  if (!res.data?.success) throw new Error(res.data?.message || "新建空间失败");
  return res.data.data;
}

export async function updateSpace(id: number, req: SpaceUpsertReq) {
  const res = await authHttp.put<Result<unknown>>(`/v1/inventory/spaces/${encodeURIComponent(String(id))}`, req);
  if (!res.data?.success) throw new Error(res.data?.message || "更新空间失败");
  return res.data.data;
}

export async function deleteSpace(id: number) {
  const res = await authHttp.delete<Result<unknown>>(`/v1/inventory/spaces/${encodeURIComponent(String(id))}`);
  if (!res.data?.success) throw new Error(res.data?.message || "删除空间失败");
  return res.data.data;
}

// ─────────────────────────────────────────────────────────────
// 分类
// ─────────────────────────────────────────────────────────────

export async function fetchCategoryTree(): Promise<CategoryNode[]> {
  const res = await authHttp.get<Result<CategoryNode[]>>("/v1/inventory/categories/tree");
  if (!res.data?.success) throw new Error(res.data?.message || "加载分类树失败");
  return res.data.data ?? [];
}

export async function createCategory(req: CategoryUpsertReq) {
  const res = await authHttp.post<Result<unknown>>("/v1/inventory/categories", req);
  if (!res.data?.success) throw new Error(res.data?.message || "新建分类失败");
  return res.data.data;
}

export async function updateCategory(id: number, req: CategoryUpsertReq) {
  const res = await authHttp.put<Result<unknown>>(`/v1/inventory/categories/${encodeURIComponent(String(id))}`, req);
  if (!res.data?.success) throw new Error(res.data?.message || "更新分类失败");
  return res.data.data;
}

export async function deleteCategory(id: number) {
  const res = await authHttp.delete<Result<unknown>>(`/v1/inventory/categories/${encodeURIComponent(String(id))}`);
  if (!res.data?.success) throw new Error(res.data?.message || "删除分类失败");
  return res.data.data;
}

// ─────────────────────────────────────────────────────────────
// 物品
// ─────────────────────────────────────────────────────────────

export async function fetchItems(params: ItemListParams = {}): Promise<ItemPage> {
  const res = await authHttp.get<Result<ItemPage>>("/v1/inventory/items", { params });
  if (!res.data?.success) throw new Error(res.data?.message || "加载物品失败");
  return res.data.data ?? { list: [], total: 0 };
}

export async function fetchItem(id: number): Promise<Item> {
  const res = await authHttp.get<Result<Item>>(`/v1/inventory/items/${encodeURIComponent(String(id))}`);
  if (!res.data?.success) throw new Error(res.data?.message || "加载物品详情失败");
  return res.data.data!;
}

export async function createItem(req: ItemUpsertReq): Promise<Item> {
  const res = await authHttp.post<Result<Item>>("/v1/inventory/items", req);
  if (!res.data?.success) throw new Error(res.data?.message || "新建物品失败");
  return res.data.data!;
}

export async function updateItem(id: number, req: ItemUpsertReq): Promise<Item> {
  const res = await authHttp.put<Result<Item>>(`/v1/inventory/items/${encodeURIComponent(String(id))}`, req);
  if (!res.data?.success) throw new Error(res.data?.message || "更新物品失败");
  return res.data.data!;
}

export async function deleteItem(id: number) {
  const res = await authHttp.delete<Result<unknown>>(`/v1/inventory/items/${encodeURIComponent(String(id))}`);
  if (!res.data?.success) throw new Error(res.data?.message || "删除物品失败");
  return res.data.data;
}

export async function transferItem(id: number, body: { spaceId: number }) {
  const res = await authHttp.post<Result<unknown>>(`/v1/inventory/items/${encodeURIComponent(String(id))}/transfer`, body);
  if (!res.data?.success) throw new Error(res.data?.message || "调拨失败");
  return res.data.data;
}

export async function retireItem(id: number, body: { reason?: string; remark?: string }) {
  const res = await authHttp.post<Result<unknown>>(`/v1/inventory/items/${encodeURIComponent(String(id))}/retire`, body);
  if (!res.data?.success) throw new Error(res.data?.message || "废弃失败");
  return res.data.data;
}

export async function recoverItem(id: number) {
  const res = await authHttp.post<Result<unknown>>(`/v1/inventory/items/${encodeURIComponent(String(id))}/recover`);
  if (!res.data?.success) throw new Error(res.data?.message || "恢复失败");
  return res.data.data;
}

export async function fetchItemLogs(id: number): Promise<ItemLog[]> {
  const res = await authHttp.get<Result<ItemLog[]>>(`/v1/inventory/items/${encodeURIComponent(String(id))}/logs`);
  if (!res.data?.success) throw new Error(res.data?.message || "加载留痕失败");
  return res.data.data ?? [];
}

// ─────────────────────────────────────────────────────────────
// 图标
// ─────────────────────────────────────────────────────────────

export async function fetchIcons(): Promise<IconCatalog> {
  const res = await authHttp.get<Result<IconCatalog>>("/v1/inventory/icons");
  if (!res.data?.success) throw new Error(res.data?.message || "加载图标失败");
  return res.data.data ?? { builtin: [], uploaded: [] };
}

export async function createIcon(body: { name: string; url: string; mime: string }) {
  const res = await authHttp.post<Result<unknown>>("/v1/inventory/icons", body);
  if (!res.data?.success) throw new Error(res.data?.message || "上传图标失败");
  return res.data.data;
}

export async function deleteIcon(id: number) {
  const res = await authHttp.delete<Result<unknown>>(`/v1/inventory/icons/${encodeURIComponent(String(id))}`);
  if (!res.data?.success) throw new Error(res.data?.message || "删除图标失败");
  return res.data.data;
}

// ─────────────────────────────────────────────────────────────
// 盘点
// ─────────────────────────────────────────────────────────────

export async function startScanSession(body: { spaceId: number }): Promise<ScanSession> {
  const res = await authHttp.post<Result<ScanSession>>("/v1/inventory/scan-sessions", body);
  if (!res.data?.success) throw new Error(res.data?.message || "开始盘点失败");
  return res.data.data!;
}

export async function addScanLine(id: number, body: { rfidCode: string }): Promise<ScanLine> {
  const res = await authHttp.post<Result<ScanLine>>(`/v1/inventory/scan-sessions/${encodeURIComponent(String(id))}/lines`, body);
  if (!res.data?.success) throw new Error(res.data?.message || "灌入扫描码失败");
  return res.data.data!;
}

export async function getScanSession(id: number): Promise<ScanSessionDetail> {
  const res = await authHttp.get<Result<ScanSessionDetail>>(`/v1/inventory/scan-sessions/${encodeURIComponent(String(id))}`);
  if (!res.data?.success) throw new Error(res.data?.message || "加载盘点会话失败");
  return res.data.data!;
}

export async function commitScanSession(id: number): Promise<ScanCommitResult> {
  const res = await authHttp.post<Result<ScanCommitResult>>(`/v1/inventory/scan-sessions/${encodeURIComponent(String(id))}/commit`);
  if (!res.data?.success) throw new Error(res.data?.message || "提交对账失败");
  return res.data.data!;
}

export async function cancelScanSession(id: number) {
  const res = await authHttp.post<Result<unknown>>(`/v1/inventory/scan-sessions/${encodeURIComponent(String(id))}/cancel`);
  if (!res.data?.success) throw new Error(res.data?.message || "取消盘点失败");
  return res.data.data;
}
